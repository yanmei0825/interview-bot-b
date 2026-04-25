import { Language } from "./types";
import { ProxyAgent } from "undici";
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
  const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : null;

  return new OpenAI({
    apiKey,
    fetch: proxyAgent
      ? (url: string, options?: RequestInit) =>
          fetch(url, { ...(options as any), duplex: "half", dispatcher: proxyAgent } as any)
      : undefined,
  });
}

export async function speechToText(
  audioBuffer: ArrayBuffer,
  language: Language
): Promise<STTResult> {
  const client = getOpenAIClient();

  const file = await toFile(Buffer.from(audioBuffer), "audio.webm", { type: "audio/webm" });

  const response = await client.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language,
  });

  return {
    text: response.text ?? "",
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
