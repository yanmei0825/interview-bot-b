import { Language } from "./types";
import OpenAI from "openai";
import { toFile } from "openai";
import { detectLanguage } from "./guards";

export interface TTSOptions {
  speed?: number;
  voiceGender?: "male" | "female" | "neutral";
}

export interface STTResult {
  text: string;
  confidence: number;
  language: Language;
  duration: number;
  isFinal: boolean;
  wrongLanguage?: boolean;
}

export interface TTSResult {
  audioBuffer: ArrayBuffer;
  mimeType: string;
  duration: number;
  language: Language;
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const proxyUrl = process.env.PROXY_URL;
  let proxyFetch: OpenAI["fetch"] | undefined;
  if (proxyUrl) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ProxyAgent } = require("undici") as { ProxyAgent: typeof import("undici").ProxyAgent };
    const agent = new ProxyAgent(proxyUrl);
    proxyFetch = (url: string, options?: RequestInit) =>
      fetch(url, { ...(options as any), duplex: "half", dispatcher: agent } as any);
  }

  return new OpenAI({ apiKey, fetch: proxyFetch });
}

// Whisper commonly hallucinates these phrases from silence/noise
const WHISPER_HALLUCINATIONS = new Set([
  // Russian
  "продолжение следует", "субтитры", "субтитры сделаны", "редактор субтитров",
  "переведено", "перевод", "спасибо за просмотр", "спасибо", "да", "нет",
  "хорошо", "окей", "ок", "понятно", "ладно", "угу", "ага",
  // Turkish
  "teşekkürler", "teşekkür ederim", "evet", "hayır", "tamam", "iyi",
  "altyazı", "altyazılar", "çeviri", "devam edecek",
  // English
  "thank you", "thanks", "thank you for watching", "subtitles by", "yes", "no",
  "okay", "ok", "uh", "um", "hmm",
]);

function isHallucination(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/[.,!?…]+$/, "").trim();
  return WHISPER_HALLUCINATIONS.has(normalized);
}

function isWrongLanguage(text: string, expected: Language): boolean {
  const detected = detectLanguage(text);
  return detected !== null && detected !== expected;
}

export async function speechToText(
  audioBuffer: ArrayBuffer,
  language: Language,
  contentType = "audio/webm"
): Promise<STTResult> {
  const client = getOpenAIClient();

  // Derive filename extension from content type for Whisper to parse correctly
  const EXT_MAP: Record<string, string> = {
    "audio/webm": "audio.webm",
    "audio/webm;codecs=opus": "audio.webm",
    "audio/ogg": "audio.ogg",
    "audio/ogg;codecs=opus": "audio.ogg",
    "audio/mp4": "audio.mp4",
    "audio/mpeg": "audio.mp3",
    "audio/wav": "audio.wav",
  };
  const mimeBase = contentType.split(";")[0]!.trim().toLowerCase();
  const filename = EXT_MAP[mimeBase] ?? EXT_MAP[contentType] ?? "audio.webm";
  const file = await toFile(Buffer.from(audioBuffer), filename, { type: mimeBase });

  // Very short audio (< ~0.3s at typical bitrate) is almost certainly silence
  const estimatedDurationMs = (audioBuffer.byteLength / 16000) * 1000;
  if (estimatedDurationMs < 300) {
    return { text: "", confidence: 0, language, duration: estimatedDurationMs, isFinal: true };
  }

  // Do NOT pass `language` to Whisper — let it auto-detect.
  // Forcing the language causes Whisper to transcribe wrong-language speech as garbled text
  // in the forced language, making detection impossible. Auto-detect is far more reliable.
  const response = await client.audio.transcriptions.create({
    file,
    model: "whisper-1",
    response_format: "verbose_json",
  });

  const detectedLang = (response as any).language ?? null;
  const text = response.text ?? "";

  // Map Whisper's language name to our language code
  const LANG_MAP: Record<string, string> = { russian: "ru", english: "en", turkish: "tr" };
  const mappedDetected = detectedLang
    ? (LANG_MAP[detectedLang.toLowerCase()] ?? detectedLang.slice(0, 2).toLowerCase())
    : null;

  // If Whisper detected a different language than expected, reject immediately
  if (mappedDetected && mappedDetected !== language) {
    return { text: "", confidence: 0, language, duration: estimatedDurationMs, isFinal: true, wrongLanguage: true };
  }

  const finalText = (text && !isHallucination(text)) ? text : "";

  // Secondary check: verify the transcribed text's script matches the expected language.
  // Catches edge cases where Whisper reports the correct language but transcribes wrong-language
  // speech phonetically (e.g. Russian words written in Latin characters).
  if (finalText && isWrongLanguage(finalText, language)) {
    return { text: "", confidence: 0, language, duration: estimatedDurationMs, isFinal: true, wrongLanguage: true };
  }

  return {
    text: finalText,
    confidence: mappedDetected === language ? 0.95 : 0.7,
    language,
    duration: (audioBuffer.byteLength / 32000) * 1000,
    isFinal: true,
    wrongLanguage: false,
  };
}

export async function textToSpeech(
  text: string,
  language: Language,
  options: TTSOptions = {}
): Promise<TTSResult> {
  const client = getOpenAIClient();

  const voice = options.voiceGender === "male" ? "onyx" : ("nova" as const);

  const response = await client.audio.speech.create({
    model: "tts-1",
    input: text,
    voice,
    speed: options.speed ?? 1,
  });

  const audioBuffer = await response.arrayBuffer();
  if (audioBuffer.byteLength === 0) {
    throw new Error("OpenAI TTS returned empty audio.");
  }

  return {
    audioBuffer,
    mimeType: "audio/mp3",
    duration: (text.split(" ").length / 150) * 1000,
    language,
  };
}
