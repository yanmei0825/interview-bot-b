import { Router, Request, Response, NextFunction } from "express";
import {
  createSession, getSession, saveSession, logEvent,
  advanceDimension, shouldAdvance, getSessionSummary, updateDimensionMetrics,
  isQuestionAlreadyAsked, registerQuestion,
} from "../session";
import { classifyInput, getGuardReply, stripEmoji } from "../guards";
import { getLLMReply } from "../llm";
import { extractSignals, detectSentiment } from "../prompt";
import { validateReply } from "../replyValidator";
import { Language, InterviewSession, DimensionKey } from "../types";
import { getDimension } from "../dimensions";
import { getProject } from "../store";
import { speechToText, textToSpeech, TTSOptions } from "../voice";

const router = Router();

// ── Shared middleware ─────────────────────────────────────────────────────────

async function requireSession(req: Request, res: Response, next: NextFunction) {
  const token = String(req.params["token"] ?? "");
  const session = await getSession(token);
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.locals["session"] = session;
  next();
}

function requireLanguage(_req: Request, res: Response, next: NextFunction) {
  const session = res.locals["session"] as InterviewSession;
  if (!session.language) return res.status(400).json({ error: "Language not selected" });
  next();
}

// ── Static routes ─────────────────────────────────────────────────────────────

router.post("/public-session", async (req: Request, res: Response) => {
  const { projectId } = req.body as { projectId?: string };
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  const project = await getProject(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const session = await createSession(projectId, project.demographicsEnabled);
  await logEvent(session.token, "session_created", projectId);
  return res.status(201).json({ token: session.token });
});

router.post("/:token/voice/transcribe", requireSession, requireLanguage, async (req: Request, res: Response) => {
  const session = res.locals["session"] as InterviewSession;

  try {
    // Read raw body
    const audioBuffer: Buffer = await new Promise((resolve, reject) => {
      if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        console.log("[Transcribe] body from express.raw, size:", req.body.length);
        return resolve(req.body);
      }
      console.log("[Transcribe] reading from stream, body type:", typeof req.body, "content-type:", req.headers["content-type"]);
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const buf = Buffer.concat(chunks);
        console.log("[Transcribe] stream read complete, size:", buf.length);
        resolve(buf);
      });
      req.on("error", reject);
    });

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: "No audio provided" });
    }

    let text = "";
    try {
      const result = await speechToText(audioBuffer as unknown as ArrayBuffer, session.language!);
      text = result.text ?? "";
      await logEvent(session.token, "voice_transcribed", text.slice(0, 80), session.currentDimension);
      session.history.push({ role: "user", content: text, timestamp: Date.now() });
      await saveSession(session);
    } catch (err: any) {
      console.error("[Voice Transcribe Error]", err?.message ?? err, err?.stack);
      // Return empty text — frontend will treat this as __skip__
    }

    return res.json({ text, confidence: 0.95, language: session.language, duration: 0 });
  } catch (err: any) {
    console.error("[Transcribe] Unhandled error:", err?.message ?? err);
    return res.json({ text: "", confidence: 0, language: session.language, duration: 0 });
  }
});

router.post("/:token/voice/speak/stream", requireSession, requireLanguage, async (req: Request, res: Response) => {
  try {
    const session = res.locals["session"] as InterviewSession;
    const { text, speed, voiceGender } = req.body as { text?: string; speed?: number; voiceGender?: string };
    if (!text || text.length === 0) return res.status(400).json({ error: "No text provided" });

    const options: TTSOptions = {
      speed: speed ?? 1.0,
      voiceGender: (voiceGender as TTSOptions["voiceGender"]) ?? "neutral",
    };

    let audioBuffer: ArrayBuffer;
    let mimeType: string;
    try {
      const result = await textToSpeech(text, session.language!, options);
      audioBuffer = result.audioBuffer;
      mimeType = result.mimeType;
    } catch (err: any) {
      console.error("[Voice Speak] TTS failed:", err.message);
      return res.status(503).json({ error: "TTS unavailable" });
    }

    await logEvent(session.token, "voice_generated_stream", text.slice(0, 80));
    res.setHeader("Content-Type", mimeType);
    res.send(Buffer.from(audioBuffer));
  } catch (err: any) {
    console.error("[Voice Speak Error]", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Core interview logic ──────────────────────────────────────────────────────

interface ProcessResult {
  reply: string;
  dimension: DimensionKey | null;
  finished: boolean;
  guardHit: boolean;
}

async function handleGuardedInput(
  session: InterviewSession,
  inputClass: string,
  processedMessage: string,
  lang: Language
): Promise<ProcessResult> {
  const guardReply = getGuardReply(inputClass as any, lang);
  const dim = getDimension(session.currentDimension);
  const cov = session.coverage[session.currentDimension];

  const pushHistory = (userContent: string, botContent: string) => {
    session.history.push({ role: "user", content: userContent, timestamp: Date.now() });
    session.history.push({ role: "assistant", content: botContent, timestamp: Date.now() });
  };

  const done = async (reply: string): Promise<ProcessResult> => {
    await saveSession(session);
    return { reply, dimension: session.currentDimension, finished: session.finished, guardHit: true };
  };

  if (inputClass === "wrong_language") {
    const lastBotMsg = session.history.filter(m => m.role === "assistant").slice(-1)[0]?.content ?? "";
    const reply = lastBotMsg ? `${guardReply} ${lastBotMsg}` : guardReply;
    pushHistory(processedMessage, reply);
    return done(reply);
  }

  if (inputClass === "refusal") {
    pushHistory(processedMessage, guardReply);
    const advanced = advanceDimension(session);
    let reply = guardReply;
    if (advanced && !session.finished) {
      const nextQ = getDimension(session.currentDimension).starterQuestions[lang][0]!;
      reply = `${guardReply} ${nextQ}`;
      session.history[session.history.length - 1] = { role: "assistant", content: reply, timestamp: Date.now() };
    }
    return done(reply);
  }

  if (inputClass === "too_long") {
    cov.turnCount++;
    session.turnCount++;
    updateDimensionMetrics(session);
    pushHistory(processedMessage.slice(0, 200) + "...", guardReply);
    return done(guardReply);
  }

  let reply = guardReply;
  if (inputClass === "off_topic") {
    reply = `${guardReply} ${dim.starterQuestions[lang][0]!}`;
  } else if (inputClass === "confusion") {
    const usedLower = session.history.filter(m => m.role === "assistant").map(m => m.content.toLowerCase());
    reply = dim.probeQuestions[lang].find(
      p => !usedLower.some(used => used.includes(p.toLowerCase().slice(0, 15)))
    ) ?? dim.probeQuestions[lang][cov.turnCount % dim.probeQuestions[lang].length] ?? dim.probeQuestions[lang][0]!;
  } else if (inputClass === "gibberish" || inputClass === "too_short") {
    const idx = cov.turnCount % dim.starterQuestions[lang].length;
    reply = `${guardReply} ${dim.starterQuestions[lang][idx] ?? dim.starterQuestions[lang][0]!}`;
  }

  pushHistory(processedMessage, reply);
  return done(reply);
}

async function handleValidInput(
  session: InterviewSession,
  cleanMessage: string,
  inputClass: string,
  lang: Language
): Promise<ProcessResult> {
  const cov = session.coverage[session.currentDimension];

  cov.signals.push(...extractSignals(cleanMessage, session.currentDimension));
  cov.turnCount++;
  session.turnCount++;
  await logEvent(session.token, `sentiment_${detectSentiment(cleanMessage)}`, undefined, session.currentDimension);
  updateDimensionMetrics(session);
  session.history.push({ role: "user", content: cleanMessage, timestamp: Date.now() });

  if (inputClass === "emotion") {
    session.history.push({ role: "assistant", content: getGuardReply("emotion", lang), timestamp: Date.now() });
  }

  if (shouldAdvance(session)) {
    const prevDim = session.currentDimension;
    const hasNext = advanceDimension(session);
    await logEvent(session.token, "dimension_completed", prevDim, prevDim as DimensionKey);
    if (!hasNext) {
      const closing = getClosingMessage(lang);
      session.history.push({ role: "assistant", content: closing, timestamp: Date.now() });
      await saveSession(session);
      await logEvent(session.token, "interview_completed", `turns=${session.turnCount}`);
      return { reply: closing, dimension: null, finished: true, guardHit: false };
    }
    await logEvent(session.token, "dimension_started", session.currentDimension, session.currentDimension);
  }

  const nextQuestion = await resolveNextQuestion(session, lang);
  const finalQuestion = safeAddBotQuestion(session, nextQuestion, lang);
  await saveSession(session);
  await logEvent(session.token, "question_generated", finalQuestion.slice(0, 80), session.currentDimension);
  session.questionCount++;
  return { reply: finalQuestion, dimension: session.currentDimension, finished: false, guardHit: false };
}

async function resolveNextQuestion(session: InterviewSession, lang: Language): Promise<string> {
  try {
    const rawReply = await getLLMReply(session);
    if (rawReply) {
      const previousReplies = session.history.filter(m => m.role === "assistant").map(m => m.content);
      const validated = validateReply(rawReply, lang, previousReplies);
      if (validated.violations.length > 0) {
        await logEvent(session.token, "reply_violations", validated.violations.join(","), session.currentDimension);
      }
      if (validated.reply) return validated.reply;
    }
  } catch (err: any) {
    console.error("[LLM Error] Falling back to curated questions:", err.message);
  }

  const dim = getDimension(session.currentDimension);
  const allQuestions = [...dim.starterQuestions[lang], ...dim.probeQuestions[lang]];
  return pickFresh(allQuestions, session.history, session.askedQuestionFps)
    ?? getFallback(lang, session.currentDimension)
    ?? allQuestions[0]!;
}

async function processMessage(session: InterviewSession, message: string): Promise<ProcessResult> {
  const lang = session.language!;

  // Internal sentinel sent when no speech was detected — always advance
  if (message === "__skip__") {
    const guardReply = getGuardReply("refusal", lang);
    session.history.push({ role: "user", content: "", timestamp: Date.now() });
    const advanced = advanceDimension(session);
    let reply = guardReply;
    if (advanced && !session.finished) {
      const nextQ = getDimension(session.currentDimension).starterQuestions[lang][0]!;
      reply = `${guardReply} ${nextQ}`;
    } else if (session.finished) {
      reply = getClosingMessage(lang);
      session.history.push({ role: "assistant", content: reply, timestamp: Date.now() });
      await saveSession(session);
      await logEvent(session.token, "interview_completed", `turns=${session.turnCount}`);
      return { reply, dimension: null, finished: true, guardHit: true };
    }
    session.history.push({ role: "assistant", content: reply, timestamp: Date.now() });
    await saveSession(session);
    return { reply, dimension: session.currentDimension, finished: false, guardHit: true };
  }

  const inputClass = classifyInput(message, lang);
  await logEvent(session.token, "user_response_received", message.slice(0, 80), session.currentDimension);
  await logEvent(session.token, "input_classified", inputClass, session.currentDimension);

  const isPassThrough = inputClass === "valid_answer" || inputClass === "emoji_mixed" || inputClass === "emotion";
  if (!isPassThrough) return handleGuardedInput(session, inputClass, message, lang);

  const cleanMessage = (inputClass === "emoji_mixed" || inputClass === "emotion") ? stripEmoji(message) : message;
  return handleValidInput(session, cleanMessage, inputClass, lang);
}

function safeAddBotQuestion(session: InterviewSession, question: string, lang: Language): string {
  if (isQuestionAlreadyAsked(session, question)) {
    const dim = getDimension(session.currentDimension);
    const fresh = pickFresh([...dim.probeQuestions[lang], ...dim.starterQuestions[lang]], session.history, session.askedQuestionFps)
      ?? getFallback(lang, session.currentDimension);
    const finalQ = fresh ?? question;
    registerQuestion(session, finalQ);
    session.history.push({ role: "assistant", content: finalQ, timestamp: Date.now() });
    return finalQ;
  }
  registerQuestion(session, question);
  session.history.push({ role: "assistant", content: question, timestamp: Date.now() });
  return question;
}

function pickFresh(candidates: string[], history: { role: string; content: string }[], askedFps?: string[]): string | undefined {
  const usedFps = new Set([
    ...history.filter((m) => m.role === "assistant").map((m) => textFingerprint(m.content)),
    ...(askedFps ?? []),
  ]);
  const usedQuestions = history.filter((m) => m.role === "assistant").map((m) => m.content.toLowerCase().trim());
  const usedKeywords = new Set(
    history.filter((m) => m.role === "assistant")
      .flatMap((m) => m.content.toLowerCase().replace(/[^a-zа-яёçğışöü\s]/gi, "").split(" ").filter((w) => w.length > 5))
  );
  const filtered = candidates.filter((q) => {
    if (usedFps.has(textFingerprint(q))) return false;
    if (usedQuestions.includes(q.toLowerCase().trim())) return false;
    const qWords = q.toLowerCase().replace(/[^a-zа-яёçğışöü\s]/gi, "").split(" ").filter((w) => w.length > 4);
    return qWords.filter(w => usedKeywords.has(w)).length < 2;
  });
  return filtered.length > 0 ? filtered[Math.floor(Math.random() * filtered.length)] : undefined;
}

function textFingerprint(text: string): string {
  return (text || "").toLowerCase().replace(/[^a-zа-яёçğışöü\s]/gi, "").replace(/\s+/g, " ").trim().split(" ").slice(0, 10).join(" ");
}

// ── Route handlers ────────────────────────────────────────────────────────────

router.get("/:token", requireSession, (_req: Request, res: Response) => {
  return res.json(getSessionSummary(res.locals["session"] as InterviewSession));
});

router.post("/:token/language", requireSession, async (req: Request, res: Response) => {
  const session = res.locals["session"] as InterviewSession;
  if (session.started) return res.status(409).json({ error: "Language already locked." });

  const { language } = req.body as { language?: string };
  if (!language || !["ru", "en", "tr"].includes(language))
    return res.status(400).json({ error: "language must be one of: ru, en, tr" });

  const project = await getProject(session.projectId);
  if (project && !project.allowedLanguages.includes(language as Language))
    return res.status(400).json({ error: `Language '${language}' is not allowed for this project.` });

  session.language = language as Language;
  session.state = "LANGUAGE_SELECTED";
  await logEvent(session.token, "language_selected", language);

  if (!session.demographicsEnabled) {
    session.started = true;
    session.state = "INTERVIEW";
    const intro = getIntroMessage(session);
    session.history.push({ role: "assistant", content: intro, timestamp: Date.now() });
    await saveSession(session);
    await logEvent(session.token, "interview_started", session.projectId);
    await logEvent(session.token, "dimension_started", session.currentDimension, session.currentDimension);
    return res.json({ message: "Language set. Interview started.", intro });
  }

  await saveSession(session);
  return res.json({ message: "Language set. Please submit demographics." });
});

router.post("/:token/demographics", requireSession, async (req: Request, res: Response) => {
  const session = res.locals["session"] as InterviewSession;
  if (!session.demographicsEnabled) return res.status(400).json({ error: "Demographics not enabled." });
  if (session.demographicsSubmitted) return res.status(409).json({ error: "Demographics already submitted." });
  if (!session.language) return res.status(400).json({ error: "Set language before submitting demographics." });

  const body = req.body as Record<string, string | undefined>;
  const { fullName, department, position, ...rest } = body;
  session.demographics = {
    ...(fullName !== undefined && { fullName }),
    ...(department !== undefined && { department }),
    ...(position !== undefined && { position }),
    ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
  };
  session.demographicsSubmitted = true;
  session.started = true;
  session.state = "INTERVIEW";
  await logEvent(session.token, "demographics_submitted");

  const intro = getIntroMessage(session);
  session.history.push({ role: "assistant", content: intro, timestamp: Date.now() });
  await saveSession(session);
  await logEvent(session.token, "interview_started", session.projectId);
  await logEvent(session.token, "dimension_started", session.currentDimension, session.currentDimension);
  return res.json({ message: "Demographics saved. Interview started.", intro });
});

router.post("/:token/message", requireSession, async (req: Request, res: Response) => {
  const session = res.locals["session"] as InterviewSession;
  if (!session.started) return res.status(400).json({ error: "Interview not started yet." });
  if (session.finished) return res.status(400).json({ error: "Interview already finished." });

  const { message } = req.body as { message?: string };
  if (!message || typeof message !== "string") return res.status(400).json({ error: "message is required" });

  const result = await processMessage(session, message);
  return res.json({ reply: result.reply, dimension: result.dimension, finished: result.finished });
});

router.post("/:token/message/stream", requireSession, async (req: Request, res: Response) => {
  const session = res.locals["session"] as InterviewSession;
  if (!session.started || session.finished) return res.status(400).json({ error: "Interview not active." });

  const { message } = req.body as { message?: string };
  if (!message || typeof message !== "string") return res.status(400).json({ error: "message is required" });

  const result = await processMessage(session, message);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.write(`data: ${JSON.stringify({ chunk: result.reply, done: false })}\n\n`);
  res.write(`data: ${JSON.stringify({ chunk: "", done: true, dimension: result.dimension, finished: result.finished })}\n\n`);
  res.end();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function getIntroMessage(session: InterviewSession): string {
  const lang = session.language as Language;
  return {
    en: "Hey — thanks for taking the time. This is a short anonymous conversation about your work experience. No right or wrong answers, just your honest take. Ready to start?",
    ru: "Привет — спасибо, что нашёл время. Это короткий анонимный разговор о твоём рабочем опыте. Нет правильных или неправильных ответов — только твой честный взгляд. Готов начать?",
    tr: "Merhaba — zaman ayırdığın için teşekkürler. Bu, iş deneyimin hakkında kısa ve anonim bir konuşma. Doğru ya da yanlış cevap yok — sadece dürüst görüşün. Başlamaya hazır mısın?",
  }[lang];
}

function getClosingMessage(lang: Language): string {
  return {
    en: "That's everything — thank you so much for your time and for sharing so openly. It was a pleasure speaking with you. Take care, and goodbye!",
    ru: "Это всё — большое спасибо за твоё время и за то, что так открыто поделился. Было приятно пообщаться. Береги себя, до свидания!",
    tr: "Hepsi bu kadar — zaman ayırdığın ve bu kadar açık paylaştığın için çok teşekkür ederim. Seninle konuşmak bir zevkti. Kendine iyi bak, güle güle!",
  }[lang];
}

function getFallback(lang: Language, dim: string): string {
  const pools: Record<string, Record<Language, string[]>> = {
    D1: { en: ["What was the most challenging part of making this happen?", "What would your team have missed without your contribution?"], ru: ["Какой была самая сложная часть?", "Что твоя команда потеряла бы без твоего вклада?"], tr: ["En zor kısım neydi?", "Ekibin katkın olmadan neyi kaybederdi?"] },
    D2: { en: ["What would make you feel more secure in your position?", "How has this affected your confidence?"], ru: ["Что сделало бы тебя более уверенным?", "Как это повлияло на твою уверенность?"], tr: ["Daha güvende hissetmek için ne gerekir?", "Bu güvenini nasıl etkiledi?"] },
    D3: { en: ["What made this relationship different from others at work?", "How has this relationship evolved over time?"], ru: ["Что сделало эти отношения особенными?", "Как они изменились со временем?"], tr: ["Bu ilişkiyi farklı yapan neydi?", "Bu ilişki zaman içinde nasıl gelişti?"] },
    D4: { en: ["What happened when you pushed back or proposed a different approach?", "When did you last feel real ownership over a decision?"], ru: ["Что происходило, когда ты возражал?", "Когда ты последний раз чувствовал реальную власть над решением?"], tr: ["Karşı çıktığında ne oldu?", "En son ne zaman gerçek sahiplik hissettin?"] },
    D5: { en: ["What would need to change for you to feel more engaged?", "When did you last feel genuinely absorbed in your work?"], ru: ["Что нужно изменить, чтобы ты чувствовал себя более вовлечённым?", "Когда ты последний раз был поглощён работой?"], tr: ["Daha bağlı hissetmen için ne değişmeli?", "En son ne zaman işine dalmış hissettin?"] },
    D6: { en: ["What kind of recognition actually matters to you?", "Is there something you did that deserved recognition but didn't get it?"], ru: ["Какое признание для тебя важно?", "Есть ли что-то, что заслуживало признания, но не получило его?"], tr: ["Sana gerçekten önemli gelen tanınma nedir?", "Tanınmayı hak ettiğin ama almadığın bir şey var mı?"] },
    D7: { en: ["Is there something you want to learn but aren't getting the chance to?", "What would help you feel like you're actually progressing?"], ru: ["Есть ли что-то, чему ты хочешь научиться?", "Что помогло бы тебе чувствовать прогресс?"], tr: ["Öğrenmek isteyip fırsatını bulamadığın bir şey var mı?", "İlerlediğini hissetmene ne yardımcı olur?"] },
    D8: { en: ["Has that sense of purpose changed since you started here?", "Do you feel like your work makes a real difference?"], ru: ["Изменилось ли ощущение смысла?", "Чувствуешь ли ты, что твоя работа имеет реальное влияние?"], tr: ["Bu amaç duygusu değişti mi?", "İşinin gerçek bir fark yarattığını hissediyor musun?"] },
    D9: { en: ["How long has that been an issue?", "Have you tried to fix it — what happened?"], ru: ["Как давно это проблема?", "Ты пытался это исправить?"], tr: ["Bu ne zamandır bir sorun?", "Bunu düzeltmeye çalıştın mı?"] },
    D10: { en: ["What makes it feel safe — or unsafe — to speak up here?", "Have you ever held back from saying something because of the reaction?"], ru: ["Что делает высказывание безопасным или опасным?", "Ты когда-нибудь удерживал себя от высказывания?"], tr: ["Sesini yükseltmeyi güvenli ya da güvensiz hissettiren nedir?", "Tepkisinden endişeyle hiç bir şey söylemekten kaçındın mı?"] },
  };
  const pool = pools[dim]?.[lang] ?? ["Can you tell me a bit more about that?"];
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export default router;
