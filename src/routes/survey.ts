import { Router, Request, Response } from "express";
import {
  createSession, getSession, saveSession, logEvent,
  advanceDimension, shouldAdvance, getSessionSummary, updateDimensionMetrics,
  isQuestionAlreadyAsked, registerQuestion,
} from "../session";
import { classifyInput, getGuardReply, isDuplicateQuestion, stripEmoji } from "../guards";
import { getLLMReply } from "../llm";
import { extractSignals, detectSentiment, isReplyDuplicate } from "../prompt";
import { validateReply } from "../replyValidator";
import { Language, InterviewSession, DimensionKey } from "../types";
import { getDimension, DIMENSION_ORDER } from "../dimensions";
import { getProject } from "../store";
import { speechToText, textToSpeech, TTSOptions } from "../voice";
import { analyzeVoiceInput, assessVoiceQuality, tokenizeText, enforceCharacterLimit } from "../voice-processor";
import * as fs from "fs";
import * as path from "path";

const router = Router();

const voiceStoragePath = path.join(process.cwd(), "voice_files");
if (!fs.existsSync(voiceStoragePath)) {
  fs.mkdirSync(voiceStoragePath, { recursive: true });
}

router.post("/:token/voice/send", async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    
    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    const session = getSession(token);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (!session.language) {
      return res.status(400).json({ error: "Language not selected" });
    }

    const audioBuffer = req.body;
    if (!audioBuffer || (Buffer.isBuffer(audioBuffer) && audioBuffer.length === 0)) {
      return res.status(400).json({ error: "No audio provided" });
    }

    console.log(`[Voice Send] Token: ${token}, Audio size: ${Buffer.isBuffer(audioBuffer) ? audioBuffer.length : 'unknown'}`);

    const voiceFileName = `voice_${token}_${Date.now()}.webm`;
    const voiceFilePath = path.join(voiceStoragePath, voiceFileName);

    fs.writeFileSync(voiceFilePath, audioBuffer);
    console.log(`[Voice Send] Saved: ${voiceFilePath}`);

    const voiceMessage = {
      type: "voice",
      fileName: voiceFileName,
      filePath: `/voice_files/${voiceFileName}`,
      size: Buffer.isBuffer(audioBuffer) ? audioBuffer.length : 0,
      timestamp: Date.now(),
      language: session.language,
    };

    session.history.push({
      role: "user",
      content: `[Voice Message: ${voiceFileName}]`,
      timestamp: Date.now(),
    });

    logEvent(token, "voice_sent", voiceFileName, session.currentDimension);
    saveSession(session);

    res.json({
      success: true,
      message: "Voice file received",
      voiceFile: voiceMessage,
      sessionUpdated: true,
    });
  } catch (err: any) {
    console.error("[Voice Send Error]", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/:token/voice/transcribe", async (req: Request, res: Response) => {
  console.log("-=-=-=-------------------");
  try {
    const token = req.params.token as string;
    
    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    const session = getSession(token);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (!session.language) {
      return res.status(400).json({ error: "Language not selected" });
    }

    const audioBuffer = req.body;
    if (!audioBuffer || (Buffer.isBuffer(audioBuffer) && audioBuffer.length === 0)) {
      return res.status(400).json({ error: "No audio provided" });
    }

    console.log(`[Voice Transcribe] Token: ${token}, Audio size: ${Buffer.isBuffer(audioBuffer) ? audioBuffer.length : 'unknown'}`);

    const result = await speechToText(audioBuffer, session.language);

    logEvent(token, "voice_transcribed", result.text.slice(0, 80), session.currentDimension);

    session.history.push({
      role: "user",
      content: result.text,
      timestamp: Date.now(),
    });
    saveSession(session);

    res.json({
      text: result.text,
      confidence: result.confidence,
      language: result.language,
      duration: result.duration,
    });
  } catch (err: any) {
    console.error("[Voice Transcribe Error]", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/:token/voice/speak/stream", async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    console.log(`[Voice Speak] Received request for token: ${token}`);
    
    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    const { text, speed, pitch, voiceGender } = req.body;
    console.log(`[Voice Speak] Body: text=${text?.slice(0, 50)}, speed=${speed}, pitch=${pitch}, voiceGender=${voiceGender}`);

    const session = getSession(token);
    if (!session) {
      console.log(`[Voice Speak] Session not found for token: ${token}`);
      return res.status(404).json({ error: "Session not found" });
    }

    if (!session.language) {
      return res.status(400).json({ error: "Language not selected" });
    }

    if (!text || text.length === 0) {
      return res.status(400).json({ error: "No text provided" });
    }

    console.log(`[Voice Speak] Generating TTS for: ${text.slice(0, 50)}`);

    const options: TTSOptions = {
      speed: speed ?? 1.0,
      pitch: pitch ?? 1.0,
      voiceGender: voiceGender ?? "neutral",
    };

    let result;
    try {
      result = await textToSpeech(text, session.language, options);
    } catch (err: any) {
      console.error("[Voice Speak] TTS failed, using mock audio:", err.message);
      const silentMP3 = Buffer.from([
        0xFF, 0xFB, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]);
      result = {
        audioBuffer: silentMP3.buffer,
        mimeType: "audio/mpeg",
        duration: 1000,
      };
    }

    if (!result) {
      return res.status(500).json({ error: "Failed to generate audio" });
    }

    console.log(`[Voice Speak] TTS result: ${result.audioBuffer.byteLength} bytes, mimeType: ${result.mimeType}`);

    logEvent(token, "voice_generated_stream", text.slice(0, 80));

    res.setHeader("Content-Type", result.mimeType);
    res.send(Buffer.from(result.audioBuffer));
  } catch (err: any) {
    console.error("[Voice Speak Stream Error]", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/:token/voice/analyze", async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const { text, language, confidence, duration } = req.body as {
      text?: string;
      language?: Language;
      confidence?: number;
      duration?: number;
    };

    if (!text || !language) {
      return res.status(400).json({ error: "text and language are required" });
    }

    const session = getSession(token);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const limitResult = enforceCharacterLimit(text, 500, 100, language);

    const qualityMetrics = assessVoiceQuality(new ArrayBuffer(0), duration ?? 0);

    const analysis = analyzeVoiceInput(
      limitResult.truncated,
      language,
      qualityMetrics,
      confidence ?? 0.85
    );

    logEvent(token, "voice_analyzed", `${analysis.wordCount} words, ${analysis.sentiment}`, session.currentDimension);

    res.json(analysis);
  } catch (err: any) {
    console.error("[Voice Analyze Error]", err);
    res.status(500).json({ error: err.message });
  }
});


interface ProcessResult {
  reply: string;
  dimension: DimensionKey | null;
  finished: boolean;
  guardHit: boolean;
}

async function processMessage(session: InterviewSession, message: string): Promise<ProcessResult> {
  const lang = session.language!;

  let processedMessage = message;
  if (message.includes("[Voice:")) {
    const voiceMatch = message.match(/\[Voice: (\/voice_files\/[^\]]+)\]/);
    if (voiceMatch && voiceMatch[1]) {
      const voiceFilePath = voiceMatch[1];
      const fullPath = path.join(process.cwd(), voiceFilePath);
      
      try {
        if (fs.existsSync(fullPath)) {
          const audioBuffer = fs.readFileSync(fullPath);
          const transcriptionResult = await speechToText(audioBuffer as any, lang);
          processedMessage = transcriptionResult.text;
          console.log(`[Voice Transcription] Transcribed: ${processedMessage}`);
        } else {
          console.warn(`[Voice Transcription] File not found: ${fullPath}`);
          processedMessage = "I sent a voice message but it couldn't be transcribed.";
        }
      } catch (err: any) {
        console.error(`[Voice Transcription Error]`, err);
        processedMessage = "I sent a voice message but there was an error transcribing it.";
      }
    }
  }

  const inputClass = classifyInput(processedMessage, lang);
  logEvent(session.token, "user_response_received", processedMessage.slice(0, 80), session.currentDimension);
  logEvent(session.token, "input_classified", inputClass, session.currentDimension);

  const cleanMessage = (inputClass === "emoji_mixed" || inputClass === "emotion")
    ? stripEmoji(processedMessage) : processedMessage;

  const isPassThrough = inputClass === "valid_answer" || inputClass === "emoji_mixed" || inputClass === "emotion";

  if (!isPassThrough) {
    const guardReply = getGuardReply(inputClass, lang);
    let reply = guardReply;

    if (inputClass === "wrong_language") {
      // remind and re-ask last question
      const lastBotMsg = session.history.filter(m => m.role === "assistant").slice(-1)[0]?.content ?? "";
      reply = lastBotMsg ? `${guardReply} ${lastBotMsg}` : guardReply;
      session.history.push({ role: "user", content: processedMessage, timestamp: Date.now() });
      session.history.push({ role: "assistant", content: reply, timestamp: Date.now() });
      saveSession(session);
      return { reply, dimension: session.currentDimension, finished: false, guardHit: true };
    } else if (inputClass === "off_topic") {
      const dim = getDimension(session.currentDimension);
      reply = `${guardReply} ${dim.starterQuestions[lang][0]!}`;
    } else if (inputClass === "refusal") {
      session.history.push({ role: "user", content: processedMessage, timestamp: Date.now() });
      session.history.push({ role: "assistant", content: guardReply, timestamp: Date.now() });
      const advanced = advanceDimension(session);
      let finalReply = guardReply;
      if (advanced && !session.finished) {
        const nextDim = getDimension(session.currentDimension);
        const nextQ = nextDim.starterQuestions[lang][0]!;
        finalReply = `${guardReply} ${nextQ}`;
        session.history[session.history.length - 1] = { role: "assistant", content: finalReply, timestamp: Date.now() };
      }
      saveSession(session);
      return { reply: finalReply, dimension: session.currentDimension, finished: session.finished, guardHit: true };
    } else if (inputClass === "confusion") {
      const dim = getDimension(session.currentDimension);
      const probes = dim.probeQuestions[lang];
      const usedAssistant = session.history
        .filter((m) => m.role === "assistant")
        .map((m) => m.content.toLowerCase());
      const freshProbe = probes.find(
        (p) => !usedAssistant.some((used) => used.includes(p.toLowerCase().slice(0, 15)))
      ) ?? probes[session.coverage[session.currentDimension].turnCount % probes.length] ?? probes[0]!;
      reply = freshProbe;
    } else if (inputClass === "too_long") {
      session.coverage[session.currentDimension].turnCount++;
      session.turnCount++;
      updateDimensionMetrics(session);
      session.history.push({ role: "user", content: processedMessage.slice(0, 200) + "...", timestamp: Date.now() });
      session.history.push({ role: "assistant", content: guardReply, timestamp: Date.now() });
      saveSession(session);
      return { reply: guardReply, dimension: session.currentDimension, finished: session.finished, guardHit: true };
    } else if (inputClass === "gibberish" || inputClass === "too_short") {
      const dim = getDimension(session.currentDimension);
      const idx = session.coverage[session.currentDimension].turnCount % dim.starterQuestions[lang].length;
      reply = `${guardReply} ${dim.starterQuestions[lang][idx] ?? dim.starterQuestions[lang][0]!}`;
    }

    session.history.push({ role: "user", content: message, timestamp: Date.now() });
    session.history.push({ role: "assistant", content: reply, timestamp: Date.now() });
    saveSession(session);
    return { reply, dimension: session.currentDimension, finished: session.finished, guardHit: true };
  }

  const signals = extractSignals(cleanMessage, session.currentDimension);
  const sentiment = detectSentiment(cleanMessage);
  session.coverage[session.currentDimension].signals.push(...signals);
  session.coverage[session.currentDimension].turnCount++;
  session.turnCount++;
  logEvent(session.token, `sentiment_${sentiment}`, undefined, session.currentDimension);
  updateDimensionMetrics(session);
  session.history.push({ role: "user", content: cleanMessage, timestamp: Date.now() });

  if (inputClass === "emotion") {
    const ack = getGuardReply("emotion", lang);
    session.history.push({ role: "assistant", content: ack, timestamp: Date.now() });
  }

  if (shouldAdvance(session)) {
    const prevDim = session.currentDimension;
    const hasNext = advanceDimension(session);
    logEvent(session.token, "dimension_completed", prevDim, prevDim as any);
    if (!hasNext) {
      const closing = getClosingMessage(lang);
      session.history.push({ role: "assistant", content: closing, timestamp: Date.now() });
      saveSession(session);
      logEvent(session.token, "interview_completed", `turns=${session.turnCount}`);
      return { reply: closing, dimension: null, finished: true, guardHit: false };
    }
    logEvent(session.token, "dimension_started", session.currentDimension, session.currentDimension);
  }

  // Try LLM first, fall back to curated questions
  let nextQuestion = "";
  try {
    const rawReply = await getLLMReply(session);
    if (rawReply) {
      const previousReplies = session.history.filter(m => m.role === "assistant").map(m => m.content);
      const validated = validateReply(rawReply, lang, previousReplies);
      if (validated.violations.length > 0) {
        logEvent(session.token, "reply_violations", validated.violations.join(","), session.currentDimension);
      }
      nextQuestion = validated.reply;
    }
  } catch (err: any) {
    console.error("[LLM Error] Falling back to curated questions:", err.message);
  }

  if (!nextQuestion) {
    const dim = getDimension(session.currentDimension);
    const allQuestions = [...dim.starterQuestions[lang], ...dim.probeQuestions[lang]];
    nextQuestion = pickFresh(allQuestions, session.history, session.askedQuestionFps)
      ?? getFallback(lang, session.currentDimension, session.history)
      ?? allQuestions[0]!;
  }

  const finalQuestion = safeAddBotQuestion(session, nextQuestion, lang);
  saveSession(session);
  logEvent(session.token, "question_generated", finalQuestion.slice(0, 80), session.currentDimension);
  session.questionCount++;
  return { reply: finalQuestion, dimension: session.currentDimension, finished: false, guardHit: false };
}

function safeAddBotQuestion(
  session: InterviewSession,
  question: string,
  lang: Language
): string {
  if (isQuestionAlreadyAsked(session, question)) {
    const dim = getDimension(session.currentDimension);
    const fresh = pickFresh([...dim.probeQuestions[lang], ...dim.starterQuestions[lang]], session.history, session.askedQuestionFps)
      ?? getFallback(lang, session.currentDimension, session.history);
    const finalQ = fresh ?? question;
    registerQuestion(session, finalQ);
    session.history.push({ role: "assistant", content: finalQ, timestamp: Date.now() });
    return finalQ;
  }
  registerQuestion(session, question);
  session.history.push({ role: "assistant", content: question, timestamp: Date.now() });
  return question;
}
function pickFresh(
  candidates: string[],
  history: { role: string; content: string }[],
  askedFps?: string[]
): string | undefined {
  const usedFps = new Set([
    ...history.filter((m) => m.role === "assistant").map((m) => textFingerprint(m.content)),
    ...(askedFps ?? []),
  ]);
  
  const usedQuestions = history
    .filter((m) => m.role === "assistant")
    .map((m) => m.content.toLowerCase().trim());
  
  const usedKeywords = new Set(
    history
      .filter((m) => m.role === "assistant")
      .flatMap((m) =>
        m.content.toLowerCase()
          .replace(/[^a-zа-яёçğışöü\s]/gi, "")
          .split(" ")
          .filter((w) => w.length > 5)
      )
  );
  
  const filtered = candidates.filter((q) => {
    const qLower = q.toLowerCase().trim();
    
    if (usedFps.has(textFingerprint(q))) return false;
    
    if (usedQuestions.includes(qLower)) return false;
    
    const qWords = q.toLowerCase()
      .replace(/[^a-zа-яёçғışöü\s]/gi, "")
      .split(" ")
      .filter((w) => w.length > 4);
    const overlap = qWords.filter(w => usedKeywords.has(w)).length;

    return overlap < 2;
  });

  if (filtered.length === 0) return undefined;

  return filtered[Math.floor(Math.random() * filtered.length)]!;
}

function textFingerprint(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-zа-яёçğışöü\s]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 10)
    .join(" ");
}

router.post("/public-session", (req: Request, res: Response) => {
  const { projectId } = req.body as { projectId?: string };
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  const project = getProject(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const session = createSession(projectId, project.demographicsEnabled);
  logEvent(session.token, "session_created", projectId);
  return res.status(201).json({ token: session.token });
});

router.get("/:token", (req: Request, res: Response) => {
  const session = getSession(String(req.params["token"]));
  if (!session) return res.status(404).json({ error: "Session not found" });
  return res.json(getSessionSummary(session));
});

router.post("/:token/language", async (req: Request, res: Response) => {
  const session = getSession(String(req.params["token"]));
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.started) return res.status(409).json({ error: "Language already locked." });

  const { language } = req.body as { language?: string };
  if (!language || !["ru", "en", "tr"].includes(language))
    return res.status(400).json({ error: "language must be one of: ru, en, tr" });

  const project = getProject(session.projectId);
  if (project && !project.allowedLanguages.includes(language as Language))
    return res.status(400).json({ error: `Language '${language}' is not allowed for this project.` });

  session.language = language as Language;
  session.state = "LANGUAGE_SELECTED";
  logEvent(session.token, "language_selected", language);

  if (!session.demographicsEnabled) {
    session.started = true;
    session.state = "INTERVIEW";
    const intro = await getIntroMessage(session);
    session.history.push({ role: "assistant", content: intro, timestamp: Date.now() });
    saveSession(session);
    logEvent(session.token, "interview_started", session.projectId);
    logEvent(session.token, "dimension_started", session.currentDimension, session.currentDimension);
    return res.json({ message: "Language set. Interview started.", intro });
  }

  saveSession(session);
  return res.json({ message: "Language set. Please submit demographics." });
});

router.post("/:token/demographics", async (req: Request, res: Response) => {
  const session = getSession(String(req.params["token"]));
  if (!session) return res.status(404).json({ error: "Session not found" });
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
  logEvent(session.token, "demographics_submitted");

  const intro = await getIntroMessage(session);
  session.history.push({ role: "assistant", content: intro, timestamp: Date.now() });
  saveSession(session);
  logEvent(session.token, "interview_started", session.projectId);
  logEvent(session.token, "dimension_started", session.currentDimension, session.currentDimension);
  return res.json({ message: "Demographics saved. Interview started.", intro });
});

router.post("/:token/message", async (req: Request, res: Response) => {
  const session = getSession(String(req.params["token"]));
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (!session.started) return res.status(400).json({ error: "Interview not started yet." });
  if (session.finished) return res.status(400).json({ error: "Interview already finished." });

  const { message } = req.body as { message?: string };
  if (!message || typeof message !== "string") return res.status(400).json({ error: "message is required" });

  const lang = session.language!;
  const result = await processMessage(session, message);

  if (result.guardHit || result.finished) {
    return res.json({ reply: result.reply, dimension: result.dimension, finished: result.finished });
  }

  return res.json({ reply: result.reply, dimension: result.dimension, finished: result.finished });
});

router.post("/:token/message/stream", async (req: Request, res: Response) => {
  const session = getSession(String(req.params["token"]));
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (!session.started || session.finished) return res.status(400).json({ error: "Interview not active." });

  const { message } = req.body as { message?: string };
  if (!message || typeof message !== "string") return res.status(400).json({ error: "message is required" });

  const lang = session.language!;
  const result = await processMessage(session, message);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  if (result.guardHit || result.finished) {
    res.write(`data: ${JSON.stringify({ chunk: result.reply, done: false })}\n\n`);
    res.write(`data: ${JSON.stringify({ chunk: "", done: true, dimension: result.dimension, finished: result.finished })}\n\n`);
    res.end();
    return;
  }

  res.write(`data: ${JSON.stringify({ chunk: result.reply, done: false })}\n\n`);
  res.write(`data: ${JSON.stringify({ chunk: "", done: true, dimension: result.dimension, finished: result.finished })}\n\n`);
  res.end();
});

router.get("/:token/report", (req: Request, res: Response) => {
  const session = getSession(String(req.params["token"]));
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (!session.finished) return res.status(400).json({ error: "Interview not completed yet" });

  const lang = session.language as Language;
  const report = generateReport(session, lang);
  return res.json(report);
});

async function getIntroMessage(session: InterviewSession): Promise<string> {
  const lang = session.language as Language;
  const intros: Record<Language, string> = {
    en: "Hey — thanks for taking the time. This is a short anonymous conversation about your work experience. No right or wrong answers, just your honest take. Ready to start?",
    ru: "Привет — спасибо, что нашёл время. Это короткий анонимный разговор о твоём рабочем опыте. Нет правильных или неправильных ответов — только твой честный взгляд. Готов начать?",
    tr: "Merhaba — zaman ayırdığın için teşekkürler. Bu, iş deneyimin hakkında kısa ve anonim bir konuşma. Doğru ya da yanlış cevap yok — sadece dürüst görüşün. Başlamaya hazır mısın?",
  };
  return intros[lang];
}

function getClosingMessage(lang: Language): string {
  const msgs: Record<Language, string> = {
    en: "That's everything — thank you so much for your time and for sharing so openly. It was a pleasure speaking with you. Take care, and goodbye!",
    ru: "Это всё — большое спасибо за твоё время и за то, что так открыто поделился. Было приятно пообщаться. Береги себя, до свидания!",
    tr: "Hepsi bu kadar — zaman ayırdığın ve bu kadar açık paylaştığın için çok teşekkür ederim. Seninle konuşmak bir zevkti. Kendine iyi bak, güle güle!",
  };
  return msgs[lang];
}

function getFallback(lang: Language, dim?: string, history?: { role: string; content: string }[]): string {
  const dimPools: Record<string, Record<Language, string[]>> = {
    D1: {
      en: [
        "What measurable impact did that achievement have on your team or project?",
        "What would your team or project have missed without your specific contribution?",
        "How did you approach this differently than others might have?",
        "What was the most challenging part of making this happen?",
      ],
      ru: [
        "Какой измеримый эффект это достижение оказало на твою команду или проект?",
        "Что твоя команда потеряла бы без твоего вклада?",
        "Как ты подошёл к этому иначе, чем могли бы другие?",
        "Какой была самая сложная часть в том, чтобы это сделать?",
      ],
      tr: [
        "Bu başarının ekibine veya projeye ölçülebilir etkisi ne oldu?",
        "Ekibiniz veya projeniz senin katkın olmadan neyi kaybederdi?",
        "Bunu başkaları nasıl yaklaşabilirdi, sen nasıl yaklaştın?",
        "Bunu gerçekleştirmenin en zor kısmı neydi?",
      ],
    },
    D2: {
      en: [
        "How long has your sense of job stability been affected by this situation?",
        "What specific event at work first made you question your stability or value here?",
        "What would make you feel more secure in your position?",
        "How has this affected your confidence in your role?",
      ],
      ru: [
        "Как давно твоё ощущение стабильности затронуто этим?",
        "Какая конкретная ситуация на работе заставила тебя чувствовать себя недооценённым?",
        "Что сделало бы тебя более уверенным в своей позиции?",
        "Как это повлияло на твою уверенность в своей роли?",
      ],
      tr: [
        "İş istikrarı hissiniz ne zamandır bundan etkileniyor?",
        "İşte sizi değersiz hissettiren belirli bir durum neydi?",
        "Pozisyonunuzda daha güvende hissetmek için ne gerekir?",
        "Bu, rolünüzdeki güveninizi nasıl etkiledi?",
      ],
    },
    D3: {
      en: [
        "What specific action did you or the other person take that changed the dynamic?",
        "How did that conflict or collaboration affect your day-to-day work output?",
        "What made this relationship different from others at work?",
        "How has this relationship evolved over time?",
      ],
      ru: [
        "Какое конкретное действие предпринял ты или другой человек, что изменило динамику?",
        "Как тот конфликт или сотрудничество повлияли на твой ежедневный рабочий результат?",
        "Что сделало эти отношения другими, чем другие на работе?",
        "Как эти отношения эволюционировали со временем?",
      ],
      tr: [
        "Dinamiği değiştiren somut bir eylem neydi — sizin mi yoksa karşı tarafın mı?",
        "O çatışma veya iş birliği günlük iş çıktınızı nasıl etkiledi?",
        "Bu ilişkiyi işte diğerlerinden farklı yapan neydi?",
        "Bu ilişki zaman içinde nasıl gelişti?",
      ],
    },
    D4: {
      en: [
        "What happened when you pushed back or proposed a different approach?",
        "How did the lack of control over that task affect the final outcome?",
        "When did you last feel you had real ownership over a decision?",
        "What would change if you had more say in how you work?",
      ],
      ru: [
        "Что происходило, когда ты возражал или предлагал другой подход?",
        "Как отсутствие контроля над этим заданием повлияло на конечный результат?",
        "Когда ты последний раз чувствовал, что у тебя была реальная власть над решением?",
        "Что изменилось бы, если бы у тебя было больше влияния на то, как ты работаешь?",
      ],
      tr: [
        "Karşı çıktığında veya farklı bir yaklaşım önerdiğinde ne oldu?",
        "O görev üzerindeki kontrol eksikliği nihai sonucu nasıl etkiledi?",
        "En son ne zaman bir karar üzerinde gerçek sahiplik hissettin?",
        "Çalışma şeklinde daha fazla söz hakkın olsaydı ne değişirdi?",
      ],
    },
    D5: {
      en: [
        "What specifically about that task made it energizing or draining?",
        "How often does that draining feeling happen in a typical week?",
        "What would need to change for you to feel more engaged?",
        "When did you last feel genuinely absorbed in your work?",
      ],
      ru: [
        "Что конкретно в этом задании делало его заряжающим или истощающим?",
        "Как часто это ощущение истощения случается в типичную неделю?",
        "Что нужно изменить, чтобы ты чувствовал себя более вовлечённым?",
        "Когда ты последний раз был по-настоящему поглощён своей работой?",
      ],
      tr: [
        "O görevde seni enerji veren veya tüketen şey tam olarak neydi?",
        "Bu tükenme hissi tipik bir haftada ne sıklıkla oluyor?",
        "Daha fazla bağlı hissetmen için ne değişmesi gerekir?",
        "En son ne zaman işine gerçekten dalmış hissettin?",
      ],
    },
    D6: {
      en: [
        "What made that feedback land well — or what was missing if it didn't?",
        "How often do you get meaningful feedback about your work?",
        "Is there something you've done that deserved recognition but didn't get it?",
        "What kind of recognition actually matters to you?",
      ],
      ru: [
        "Что сделало эту обратную связь полезной — или что было не так, если нет?",
        "Как часто ты получаешь значимую обратную связь о своей работе?",
        "Есть ли что-то, что ты сделал и что заслуживало признания, но не получило его?",
        "Какое признание для тебя действительно важно?",
      ],
      tr: [
        "Bu geri bildirimi iyi yapan neydi — ya da iyi değilse, ne eksikti?",
        "Çalışman hakkında ne sıklıkla anlamlı geri bildirim alıyorsun?",
        "Yaptığın ve tanınmayı hak ettiğini hissettiğin ama almadığın bir şey var mı?",
        "Sana gerçekten önemli gelen tanınma türü nedir?",
      ],
    },
    D7: {
      en: [
        "What's been the biggest thing you've picked up or learned recently?",
        "Is there something you want to learn but aren't getting the chance to?",
        "How does your manager or team support your growth?",
        "What would help you feel like you're actually progressing?",
      ],
      ru: [
        "Что самое значимое ты усвоил или узнал в последнее время?",
        "Есть ли что-то, чему ты хочешь научиться, но не получаешь возможности?",
        "Как твой руководитель или команда поддерживают твой рост?",
        "Что помогло бы тебе чувствовать, что ты действительно прогрессируешь?",
      ],
      tr: [
        "Son zamanlarda öğrendiğin ya da aldığın en büyük şey neydi?",
        "Öğrenmek isteyip de fırsatını bulamadığın bir şey var mı?",
        "Yöneticin ya da ekibin büyümeni nasıl destekliyor?",
        "Gerçekten ilerlediğini hissetmene ne yardımcı olur?",
      ],
    },
    D8: {
      en: [
        "What specifically makes your work feel meaningful — or hollow?",
        "Has that sense of purpose changed since you started here?",
        "How much does your work align with your personal values?",
        "Do you feel like your work makes a real difference?",
      ],
      ru: [
        "Что конкретно делает твою работу значимой — или пустой?",
        "Изменилось ли это ощущение смысла с тех пор, как ты здесь начал?",
        "Насколько твоя работа соответствует твоим личным ценностям?",
        "Чувствуешь ли ты, что твоя работа имеет реальное влияние?",
      ],
      tr: [
        "İşini anlamlı — ya da boş — hissettiren şey tam olarak nedir?",
        "Bu amaç duygusu buraya başladığından beri değişti mi?",
        "İşin kişisel değerlerinle ne kadar uyumlu?",
        "İşinin gerçek bir fark yarattığını hissediyor musun?",
      ],
    },
    D9: {
      en: [
        "How long has that been an issue — is it new or ongoing?",
        "Have you tried to fix it or work around it — what happened?",
        "How much does it actually affect your day or work quality?",
        "Is it something the team or company could change?",
      ],
      ru: [
        "Как давно это является проблемой — это новое или постоянное?",
        "Ты пытался это исправить или обойти — что произошло?",
        "Насколько это реально влияет на твой день или качество работы?",
        "Это что-то, что команда или компания могли бы изменить?",
      ],
      tr: [
        "Bu ne zamandır bir sorun — yeni mi yoksa devam eden mi?",
        "Bunu düzeltmeye ya da çalışmaya çalıştın mı — ne oldu?",
        "Bu günlük hayatını ya da çalışma kaliteni ne kadar etkiliyor?",
        "Ekibin ya da şirketin değiştirebileceği bir şey mi?",
      ],
    },
    D10: {
      en: [
        "What makes it feel safe — or unsafe — to speak up here?",
        "Did anything actually change because of what you said?",
        "Have you ever held back from saying something because of the reaction?",
        "Do you feel like your voice actually matters in decisions that affect you?",
      ],
      ru: [
        "Что делает высказывание безопасным — или опасным — здесь?",
        "Что-то реально изменилось из-за того, что ты сказал?",
        "Ты когда-нибудь удерживал себя от высказывания из-за реакции?",
        "Чувствуешь ли ты, что твой голос действительно имеет значение в решениях, которые тебя касаются?",
      ],
      tr: [
        "Burada sesini yükseltmeyi güvenli — ya da güvensiz — hissettiren nedir?",
        "Söylediklerin yüzünden gerçekten bir şey değişti mi?",
        "Tepkisinden endişe duyduğun için hiç bir şey söylemekten kaçındın mı?",
        "Seni etkileyen kararlarda sesin gerçekten önemli olduğunu hissediyor musun?",
      ],
    },
  };

  const pool = (dim && dimPools[dim]) ? dimPools[dim][lang] : [];

  if (pool.length === 0) {
    return lang === "ru" ? "Можешь рассказать подробнее?" : lang === "tr" ? "Bana daha fazla anlatabilir misin?" : "Can you elaborate on that?";
  }

  const used = new Set(
    (history ?? [])
      .filter(m => m.role === "assistant")
      .map(m => m.content.toLowerCase().trim())
  );

  const fresh = pool.filter((q: string) => !used.has(q.toLowerCase().trim()));

  const source = fresh.length > 0 ? fresh : pool;

  return source[Math.floor(Math.random() * source.length)]!;
}

interface DimensionReport {
  key: DimensionKey;
  name: string;
  focus: string;
  turnCount: number;
  coverageScore: number;
  depthLevel: number;
  signals: string[];
  status: "deep" | "moderate" | "light" | "skipped";
}

interface InterviewReport {
  token: string;
  projectId: string;
  language: Language;
  demographics: Record<string, any> | null;
  completedAt: number;
  totalTurns: number;
  totalQuestions: number;
  dimensions: DimensionReport[];
  summary: {
    overallCoverage: number;
    strongDimensions: string[];
    weakDimensions: string[];
    keyThemes: string[];
  };
}

function generateReport(session: InterviewSession, lang: Language): InterviewReport {
  const dimensions: DimensionReport[] = [];
  let totalCoverage = 0;
  let coveredCount = 0;

  for (const key of DIMENSION_ORDER) {
    const dim = getDimension(key);
    const cov = session.coverage[key as DimensionKey];

    let status: "deep" | "moderate" | "light" | "skipped" = "skipped";
    if (cov.depthLevel === 3) status = "deep";
    else if (cov.depthLevel === 2) status = "moderate";
    else if (cov.turnCount > 0) status = "light";

    if (cov.covered) {
      totalCoverage += cov.coverageScore;
      coveredCount++;
    }

    dimensions.push({
      key,
      name: dim.name[lang],
      focus: dim.focus[lang],
      turnCount: cov.turnCount,
      coverageScore: cov.coverageScore,
      depthLevel: cov.depthLevel,
      signals: cov.signals,
      status,
    });
  }

  const overallCoverage = coveredCount > 0 ? totalCoverage / coveredCount : 0;
  const strongDimensions = dimensions
    .filter((d) => d.status === "deep")
    .map((d) => d.name);
  const weakDimensions = dimensions
    .filter((d) => d.status === "skipped" || d.status === "light")
    .map((d) => d.name);

  const allSignals = dimensions.flatMap((d) => d.signals);
  const keyThemes = extractKeyThemes(allSignals, lang);

  return {
    token: session.token,
    projectId: session.projectId,
    language: lang,
    demographics: session.demographics,
    completedAt: Date.now(),
    totalTurns: session.turnCount,
    totalQuestions: session.questionCount,
    dimensions,
    summary: {
      overallCoverage: Math.round(overallCoverage * 100) / 100,
      strongDimensions,
      weakDimensions,
      keyThemes,
    },
  };
}

function extractKeyThemes(signals: string[], lang: Language): string[] {
  const themes: Record<string, number> = {};

  for (const signal of signals) {
    const normalized = signal.toLowerCase().trim();
    themes[normalized] = (themes[normalized] || 0) + 1;
  }

  const sorted = Object.entries(themes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([theme]) => theme);

  return sorted;
}

export default router;

