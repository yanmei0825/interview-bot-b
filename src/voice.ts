import { Language } from "./types";
import OpenAI from "openai";
import { toFile } from "openai";

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

function detectScript(text: string): Language | null {
  const clean = text.replace(/\s+/g, "");
  if (!clean.length) return null;
  const cyrillic = (clean.match(/[а-яёА-ЯЁ]/g) ?? []).length;
  const turkish  = (clean.match(/[çğışöüÇĞİŞÖÜ]/g) ?? []).length;
  const latin    = (clean.match(/[a-zA-Z]/g) ?? []).length;
  const total    = cyrillic + turkish + latin;
  if (!total) return null;
  if (cyrillic / total >= 0.3) return "ru";
  if (turkish  / total >= 0.3) return "tr";
  if (latin    / total >= 0.3) return "en";
  return null;
}

function isWrongLanguage(text: string, expected: Language): boolean {
  const detected = detectScript(text);
  return detected !== null && detected !== expected;
}

export async function speechToText(
  audioBuffer: ArrayBuffer,
  language: Language
): Promise<STTResult> {
  const client = getOpenAIClient();

  const file = await toFile(Buffer.from(audioBuffer), "audio.webm", { type: "audio/webm" });

  // Very short audio (< ~1s at typical bitrate) is almost certainly silence
  const estimatedDurationMs = (audioBuffer.byteLength / 16000) * 1000;
  if (estimatedDurationMs < 800) {
    return { text: "", confidence: 0, language, duration: estimatedDurationMs, isFinal: true };
  }

  const response = await client.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language,
  });

  return {
    text: (response.text && !isHallucination(response.text) && !isWrongLanguage(response.text, language)) ? response.text : "",
    confidence: 0.95,
    language,
    duration: (audioBuffer.byteLength / 32000) * 1000,
    isFinal: true,
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
