import { Language } from "./types";
import { ProxyAgent } from "undici";

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

function getProxyFetch() {
  const proxyUrl = process.env.PROXY_URL;
  if (!proxyUrl) return undefined;
  const agent = new ProxyAgent(proxyUrl);
  return (url: string, options?: RequestInit) =>
    fetch(url, { ...(options as any), dispatcher: agent } as any);
}

export async function speechToText(
  audioBuffer: ArrayBuffer,
  language: Language
): Promise<STTResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  // form-data is needed because fetch's FormData doesn't support Buffer filenames
  const FormData = require("form-data");
  const form = new FormData();
  form.append("file", Buffer.from(audioBuffer), { filename: "audio.webm" });
  form.append("model", "whisper-1");
  form.append("language", language);

  const proxyFetch = getProxyFetch();
  const doFetch = proxyFetch ?? fetch;

  const response = await doFetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...form.getHeaders(),
    },
    body: form,
  } as any);

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[STT Error]", response.status, errorText);
    throw new Error(`Whisper STT failed: ${response.status}`);
  }

  const data = (await response.json()) as { text: string };
  return {
    text: data.text ?? "",
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
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const voice = options.voiceGender === "male" ? "onyx" : "nova";
  const proxyFetch = getProxyFetch();
  const doFetch = proxyFetch ?? fetch;

  const response = await doFetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      input: text,
      voice,
      speed: options.speed ?? 1,
    }),
  } as any);

  if (!response.ok) {
    const error = await response.text();
    console.error(`[TTS Error] ${response.status}: ${error}`);
    throw new Error(`OpenAI TTS failed: ${response.status}`);
  }

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
