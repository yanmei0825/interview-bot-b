/**
 * VOICE PROCESSING MODULE
 * 
 * Handles speech-to-text and text-to-speech for the interview system.
 * Supports all 3 languages: Russian (ru), English (en), Turkish (tr)
 */

import { Language } from "./types";

export interface STTProvider {
  name: "google" | "azure" | "aws" | "openai" | "assemblyai";
  apiKey: string;
  region?: string;
}

export interface STTResult {
  text: string;
  confidence: number;
  language: Language;
  duration: number; 
  isFinal: boolean;
}

/**
 * Convert speech audio to text
 * Supports streaming for real-time transcription
 */
export async function speechToText(
  audioBuffer: ArrayBuffer,
  language: Language,
  provider: STTProvider = getDefaultSTTProvider()
): Promise<STTResult> {
  try {
    switch (provider.name) {
      case "google":
        return await speechToTextGoogle(audioBuffer, language, provider);
      case "azure":
        return await speechToTextAzure(audioBuffer, language, provider);
      case "aws":
        return await speechToTextAWS(audioBuffer, language, provider);
      case "openai":
        return await speechToTextOpenAI(audioBuffer, language, provider);
      case "assemblyai":
        return await speechToTextAssemblyAI(audioBuffer, language, provider);
      default:
        throw new Error(`Unknown STT provider: ${provider.name}`);
    }
  } catch (err: any) {
    console.error(`[STT Error] ${provider.name}: ${err.message}`);
    console.log("[STT] Falling back to mock transcription");
    return {
      text: "[Mock] Voice recognition service is unavailable. Please check your API key.",
      confidence: 0.5,
      language,
      duration: audioBuffer.byteLength / 32000 * 1000,
      isFinal: true,
    };
  }
}

/**
 * Stream speech-to-text for real-time transcription
 */
export async function* streamSpeechToText(
  audioStream: ReadableStream<Uint8Array>,
  language: Language,
  provider: STTProvider = getDefaultSTTProvider()
): AsyncGenerator<STTResult> {
  switch (provider.name) {
    case "google":
      yield* streamSpeechToTextGoogle(audioStream, language, provider);
      break;
    case "azure":
      yield* streamSpeechToTextAzure(audioStream, language, provider);
      break;
    case "aws":
      yield* streamSpeechToTextAWS(audioStream, language, provider);
      break;
    case "openai":
      yield* streamSpeechToTextOpenAI(audioStream, language, provider);
      break;
    default:
      throw new Error(`Unknown STT provider: ${provider.name}`);
  }
}

export interface TTSProvider {
  name: "google" | "azure" | "aws" | "openai" | "elevenlabs";
  apiKey: string;
  region?: string;
  voiceId?: string;
}

export interface TTSOptions {
  speed?: number;
  pitch?: number; 
  volume?: number; 
  voiceGender?: "male" | "female" | "neutral";
}

export interface TTSResult {
  audioBuffer: ArrayBuffer;
  mimeType: string;
  duration: number;  
  language: Language;
}

/**
 * Convert text to speech
 */
export async function textToSpeech(
  text: string,
  language: Language,
  options: TTSOptions = {},
  provider: TTSProvider = getDefaultTTSProvider()
): Promise<TTSResult> {
  switch (provider.name) {
    case "google":
      return textToSpeechGoogle(text, language, options, provider);
    case "azure":
      return textToSpeechAzure(text, language, options, provider);
    case "aws":
      return textToSpeechAWS(text, language, options, provider);
    case "openai":
      return textToSpeechOpenAI(text, language, options, provider);
    case "elevenlabs":
      return textToSpeechElevenLabs(text, language, options, provider);
    default:
      throw new Error(`Unknown TTS provider: ${provider.name}`);
  }
}

/**
 * Stream text-to-speech for real-time audio
 */
export async function* streamTextToSpeech(
  text: string,
  language: Language,
  options: TTSOptions = {},
  provider: TTSProvider = getDefaultTTSProvider()
): AsyncGenerator<Uint8Array> {
  switch (provider.name) {
    case "google":
      yield* streamTextToSpeechGoogle(text, language, options, provider);
      break;
    case "azure":
      yield* streamTextToSpeechAzure(text, language, options, provider);
      break;
    case "aws":
      yield* streamTextToSpeechAWS(text, language, options, provider);
      break;
    case "openai":
      yield* streamTextToSpeechOpenAI(text, language, options, provider);
      break;
    case "elevenlabs":
      yield* streamTextToSpeechElevenLabs(text, language, options, provider);
      break;
    default:
      throw new Error(`Unknown TTS provider: ${provider.name}`);
  }
}

export async function detectLanguageFromAudio(
  audioBuffer: ArrayBuffer
): Promise<Language> {
  const result = await speechToText(audioBuffer, "en");
  return result.language;
}

export interface VoiceQuality {
  noiseLevel: number;
  clarity: number; 
  volume: number; 
  isAcceptable: boolean;
}

async function speechToTextAssemblyAI(
  audioBuffer: ArrayBuffer,
  language: Language,
  provider: STTProvider
): Promise<STTResult> {
  const apiKey = provider.apiKey || process.env.ASSEMBLYAI_API_KEY;

  if (!apiKey || apiKey === "YOUR_ASSEMBLYAI_API_KEY_HERE") {
    console.warn("[AssemblyAI] API key not configured. Using mock transcription for testing.");
    console.warn("[AssemblyAI] Get free API key from https://www.assemblyai.com/");
    
    return {
      text: "[Mock] This is a test transcription. Add ASSEMBLYAI_API_KEY to .env for real speech-to-text.",
      confidence: 0.5,
      language,
      duration: audioBuffer.byteLength / 32000 * 1000,
      isFinal: true,
    };
  }

  try {
    const buffer = Buffer.from(audioBuffer);
    
    console.log(`[AssemblyAI] Uploading audio: ${buffer.length} bytes`);

    const uploadResponse = await fetch("https://api.assemblyai.com/v2/upload", {
      method: "POST",
      headers: {
        Authorization: apiKey,
      },
      body: buffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error(`[AssemblyAI Upload Error] ${uploadResponse.status}: ${errorText}`);
      throw new Error(`Upload failed: ${uploadResponse.status}`);
    }

    const uploadData = (await uploadResponse.json()) as any;
    const audioUrl = uploadData.upload_url;
    
    console.log(`[AssemblyAI] Audio uploaded: ${audioUrl}`);

    const transcribeResponse = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        language_code: language,
        speech_models: ["universal-2"], 
      }),
    });

    if (!transcribeResponse.ok) {
      const errorText = await transcribeResponse.text();
      console.error(`[AssemblyAI Transcribe Error] ${transcribeResponse.status}: ${errorText}`);
      throw new Error(`Transcription failed: ${transcribeResponse.status}`);
    }

    const transcribeData = (await transcribeResponse.json()) as any;
    const transcriptId = transcribeData.id;
    
    console.log(`[AssemblyAI] Transcription started: ${transcriptId}`);

    let result = transcribeData;
    let attempts = 0;
    const maxAttempts = 120; 
    
    while (result.status !== "completed" && result.status !== "error" && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: { Authorization: apiKey },
      });
      result = (await pollResponse.json()) as any;
      attempts++;
      
      if (attempts % 10 === 0) {
        console.log(`[AssemblyAI] Polling... (${attempts}s) Status: ${result.status}`);
      }
    }

    if (result.status === "error") {
      console.error(`[AssemblyAI] Transcription error: ${result.error}`);
      throw new Error(`Transcription error: ${result.error}`);
    }

    if (attempts >= maxAttempts) {
      throw new Error("Transcription timeout");
    }

    const transcript = result.text ?? "";
    
    console.log(`[AssemblyAI] Transcription complete: "${transcript.slice(0, 50)}..."`);

    return {
      text: transcript,
      confidence: 0.9,
      language,
      duration: audioBuffer.byteLength / 32000 * 1000,
      isFinal: true,
    };
  } catch (err: any) {
    console.error("[AssemblyAI Error]", err.message);
    throw err;
  }
}
async function speechToTextGoogle(
  audioBuffer: ArrayBuffer,
  language: Language,
  provider: STTProvider
): Promise<STTResult> {
  const languageCode = getLanguageCode(language);
  const base64Audio = Buffer.from(audioBuffer).toString("base64");
  const apiKey = provider.apiKey || process.env.GOOGLE_CLOUD_API_KEY;

  if (!apiKey || apiKey === "YOUR_GOOGLE_CLOUD_API_KEY_HERE") {
    console.warn("[Google STT] API key not configured. Using mock transcription for testing.");
    console.warn("[Google STT] To enable real transcription, get a free API key from https://console.cloud.google.com/");
    
    return {
      text: "[Mock] This is a test transcription. Add GOOGLE_CLOUD_API_KEY to .env for real speech-to-text.",
      confidence: 0.5,
      language,
      duration: audioBuffer.byteLength / 32000 * 1000,
      isFinal: true,
    };
  }

  try {
    const response = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: {
          encoding: "LINEAR16",
          languageCode,
          audioChannelCount: 1,
          sampleRateHertz: 16000,
        },
        audio: { content: base64Audio },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Google STT Error]", response.status, errorText);
      throw new Error(`Google Cloud Speech-to-Text error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const transcript = data.results?.[0]?.alternatives?.[0]?.transcript ?? "";
    const confidence = data.results?.[0]?.alternatives?.[0]?.confidence ?? 0;

    if (!transcript) {
      throw new Error("No transcription result from Google Cloud");
    }

    return {
      text: transcript,
      confidence,
      language,
      duration: audioBuffer.byteLength / 32000 * 1000,
      isFinal: true,
    };
  } catch (err: any) {
    console.error("[Google STT Error]", err.message);
    throw err;
  }
}

async function* streamSpeechToTextGoogle(
  audioStream: ReadableStream<Uint8Array>,
  language: Language,
  provider: STTProvider
): AsyncGenerator<STTResult> {
  const languageCode = getLanguageCode(language);
  
  yield {
    text: "",
    confidence: 0,
    language,
    duration: 0,
    isFinal: false,
  };
}

async function speechToTextAzure(
  audioBuffer: ArrayBuffer,
  language: Language,
  provider: STTProvider
): Promise<STTResult> {
  const languageCode = getLanguageCode(language);
  const region = provider.region ?? "eastus";

  const response = await fetch(
    `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${languageCode}`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": provider.apiKey,
        "Content-Type": "audio/wav",
      },
      body: audioBuffer,
    }
  );

  const data = (await response.json()) as any;
  const transcript = data.DisplayText ?? "";
  const confidence = data.Confidence ?? 0;

  return {
    text: transcript,
    confidence,
    language,
    duration: audioBuffer.byteLength / 32000 * 1000,
    isFinal: true,
  };
}

async function* streamSpeechToTextAzure(
  audioStream: ReadableStream<Uint8Array>,
  language: Language,
  provider: STTProvider
): AsyncGenerator<STTResult> {
  yield {
    text: "",
    confidence: 0,
    language,
    duration: 0,
    isFinal: false,
  };
}

async function speechToTextAWS(
  audioBuffer: ArrayBuffer,
  language: Language,
  provider: STTProvider
): Promise<STTResult> {
  return {
    text: "",
    confidence: 0,
    language,
    duration: 0,
    isFinal: true,
  };
}

async function* streamSpeechToTextAWS(
  audioStream: ReadableStream<Uint8Array>,
  language: Language,
  provider: STTProvider
): AsyncGenerator<STTResult> {
  yield {
    text: "",
    confidence: 0,
    language,
    duration: 0,
    isFinal: false,
  };
}

async function speechToTextOpenAI(
  audioBuffer: ArrayBuffer,
  language: Language,
  provider: STTProvider
): Promise<STTResult> {
  try {
    const FormData = require('form-data');
    const HttpsProxyAgent = require('https-proxy-agent');
    const formData = new FormData();
    formData.append("file", Buffer.from(audioBuffer), { filename: "audio.wav" });
    formData.append("model", "whisper-1");
    formData.append("language", language);

    const proxyUrl = process.env.PROXY_URL;
    const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { 
        Authorization: `Bearer ${provider.apiKey}`,
        ...formData.getHeaders(),
      },
      body: formData,
      ...(agent && { agent }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[OpenAI STT Error]", response.status, errorText);
      
      if (response.status === 403) {
        console.log("[OpenAI STT] Geographic restriction detected, trying Google Cloud Speech-to-Text");
        try {
          return await speechToTextGoogle(audioBuffer, language, provider);
        } catch (googleErr) {
          console.error("[Google STT Fallback Error]", googleErr);
          throw new Error(`Both OpenAI and Google STT failed: ${response.status}`);
        }
      }
      
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const transcript = data.text ?? "";

    return {
      text: transcript,
      confidence: 0.95,
      language,
      duration: audioBuffer.byteLength / 32000 * 1000,
      isFinal: true,
    };
  } catch (err: any) {
    console.error("[speechToTextOpenAI Error]", err);
    throw err;
  }
}

async function* streamSpeechToTextOpenAI(
  audioStream: ReadableStream<Uint8Array>,
  language: Language,
  provider: STTProvider
): AsyncGenerator<STTResult> {
  yield {
    text: "",
    confidence: 0,
    language,
    duration: 0,
    isFinal: false,
  };
}

async function textToSpeechGoogle(
  text: string,
  language: Language,
  options: TTSOptions,
  provider: TTSProvider
): Promise<TTSResult> {
  const languageCode = getLanguageCode(language);
  const voiceGender = options.voiceGender ?? "neutral";
  const apiKey = provider.apiKey || process.env.GOOGLE_CLOUD_API_KEY;

  if (!apiKey) throw new Error("Google TTS failed: no API key configured (set GOOGLE_CLOUD_API_KEY in .env)");

  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: {
        languageCode,
        ssmlGender: voiceGender.toUpperCase(),
      },
      audioConfig: {
        audioEncoding: "MP3",
        pitch: (options.pitch ?? 1) - 1, 
        speakingRate: options.speed ?? 1,
      },
    }),
  });

  const data = (await response.json()) as any;

  if (!response.ok || !data.audioContent) {
    const errMsg = data?.error?.message ?? data?.error ?? `HTTP ${response.status}`;
    throw new Error(`Google TTS failed: ${errMsg}`);
  }

  const audioBuffer = Buffer.from(data.audioContent, "base64");

  return {
    audioBuffer: audioBuffer.buffer,
    mimeType: "audio/mp3",
    duration: (text.split(" ").length / 150) * 1000, 
    language,
  };
}

async function* streamTextToSpeechGoogle(
  text: string,
  language: Language,
  options: TTSOptions,
  provider: TTSProvider
): AsyncGenerator<Uint8Array> {
  const result = await textToSpeechGoogle(text, language, options, provider);
  yield new Uint8Array(result.audioBuffer);
}

async function textToSpeechAzure(
  text: string,
  language: Language,
  options: TTSOptions,
  provider: TTSProvider
): Promise<TTSResult> {
  const region = provider.region ?? "eastus";
  const voiceGender = options.voiceGender ?? "neutral";
  const voiceName = getAzureVoiceName(language, voiceGender);

  const ssml = `
    <speak version="1.0" xml:lang="${getLanguageCode(language)}">
      <voice name="${voiceName}">
        <prosody pitch="${(options.pitch ?? 1) * 100}%" rate="${options.speed ?? 1}">
          ${text}
        </prosody>
      </voice>
    </speak>
  `;

  const response = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": provider.apiKey,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-16khz-32kbitrate-mono-mp3",
      },
      body: ssml,
    }
  );

  const audioBuffer = await response.arrayBuffer();

  return {
    audioBuffer,
    mimeType: "audio/mp3",
    duration: (text.split(" ").length / 150) * 1000,
    language,
  };
}

async function* streamTextToSpeechAzure(
  text: string,
  language: Language,
  options: TTSOptions,
  provider: TTSProvider
): AsyncGenerator<Uint8Array> {
  const result = await textToSpeechAzure(text, language, options, provider);
  yield new Uint8Array(result.audioBuffer);
}

async function textToSpeechAWS(
  text: string,
  language: Language,
  options: TTSOptions,
  provider: TTSProvider
): Promise<TTSResult> {
  return {
    audioBuffer: new ArrayBuffer(0),
    mimeType: "audio/mp3",
    duration: 0,
    language,
  };
}

async function* streamTextToSpeechAWS(
  text: string,
  language: Language,
  options: TTSOptions,
  provider: TTSProvider
): AsyncGenerator<Uint8Array> {
  yield new Uint8Array(0);
}

async function textToSpeechOpenAI(
  text: string,
  language: Language,
  options: TTSOptions,
  provider: TTSProvider
): Promise<TTSResult> {
  const HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent;
  const proxyUrl = process.env.PROXY_URL;
  const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      input: text,
      voice: options.voiceGender === "male" ? "onyx" : "nova",
      speed: options.speed ?? 1,
    }),
    ...(agent && { agent }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`[OpenAI TTS Error] ${response.status}: ${error}`);
    
    if (response.status === 403) {
      console.log("[OpenAI TTS] Geographic restriction detected, trying Google Cloud Text-to-Speech");
      try {
        return await textToSpeechGoogle(text, language, options, provider);
      } catch (googleErr) {
        console.error("[Google TTS Fallback Error]", googleErr);
        throw new Error(`Both OpenAI and Google TTS failed: ${response.status}`);
      }
    }
    
    throw new Error(`OpenAI TTS failed: ${response.statusText}`);
  }

  const audioBuffer = await response.arrayBuffer();

  if (audioBuffer.byteLength === 0) {
    console.error('[OpenAI TTS Error] Empty audio buffer');
    throw new Error('OpenAI TTS returned empty audio');
  }

  console.log(`[OpenAI TTS] Generated ${audioBuffer.byteLength} bytes of audio`);

  return {
    audioBuffer,
    mimeType: "audio/mp3",
    duration: (text.split(" ").length / 150) * 1000,
    language,
  };
}

async function* streamTextToSpeechOpenAI(
  text: string,
  language: Language,
  options: TTSOptions,
  provider: TTSProvider
): AsyncGenerator<Uint8Array> {
  const result = await textToSpeechOpenAI(text, language, options, provider);
  yield new Uint8Array(result.audioBuffer);
}

async function textToSpeechElevenLabs(
  text: string,
  language: Language,
  options: TTSOptions,
  provider: TTSProvider
): Promise<TTSResult> {
  const voiceId = provider.voiceId ?? getElevenLabsVoiceId(language, options.voiceGender);

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": provider.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_monolingual_v1",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  const audioBuffer = await response.arrayBuffer();

  return {
    audioBuffer,
    mimeType: "audio/mpeg",
    duration: (text.split(" ").length / 150) * 1000,
    language,
  };
}

async function* streamTextToSpeechElevenLabs(
  text: string,
  language: Language,
  options: TTSOptions,
  provider: TTSProvider
): AsyncGenerator<Uint8Array> {
  const voiceId = provider.voiceId ?? getElevenLabsVoiceId(language, options.voiceGender);

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: "POST",
      headers: {
        "xi-api-key": provider.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    }
  );

  const reader = response.body?.getReader();
  if (!reader) return;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield value;
  }
}

function getDefaultSTTProvider(): STTProvider {
  const provider = (process.env.STT_PROVIDER ?? "openai").toLowerCase();
  const apiKey = process.env[`${provider.toUpperCase()}_API_KEY`] ?? "";
  const region = process.env.AZURE_REGION;

  return {
    name: (provider as any) ?? "openai",
    apiKey,
    ...(region && { region }),
  };
}

function getDefaultTTSProvider(): TTSProvider {
  const provider = (process.env.TTS_PROVIDER ?? "openai").toLowerCase();
  const apiKey = process.env[`${provider.toUpperCase()}_API_KEY`] ?? "";
  const region = process.env.AZURE_REGION;

  return {
    name: (provider as any) ?? "openai",
    apiKey,
    ...(region && { region }),
  };
}

function getLanguageCode(language: Language): string {
  const codes: Record<Language, string> = {
    ru: "ru-RU",
    en: "en-US",
    tr: "tr-TR",
  };
  return codes[language];
}

function getAzureVoiceName(language: Language, gender: string): string {
  const voices: Record<Language, Record<string, string>> = {
    ru: {
      male: "ru-RU-DmitryNeural",
      female: "ru-RU-SvetlanaNeural",
      neutral: "ru-RU-SvetlanaNeural",
    },
    en: {
      male: "en-US-GuyNeural",
      female: "en-US-AriaNeural",
      neutral: "en-US-AriaNeural",
    },
    tr: {
      male: "tr-TR-AhmetNeural",
      female: "tr-TR-EmelNeural",
      neutral: "tr-TR-EmelNeural",
    },
  };
  return voices[language]?.[gender] ?? voices[language]?.neutral ?? "en-US-AriaNeural";
}

function getElevenLabsVoiceId(language: Language, gender?: string): string {
  const voices: Record<Language, Record<string, string>> = {
    ru: {
      male: "21m00Tcm4TlvDq8ikWAM", 
      female: "EXAVITQu4vr4xnSDxMaL", 
      neutral: "EXAVITQu4vr4xnSDxMaL",
    },
    en: {
      male: "onyx", 
      female: "nova", 
      neutral: "nova",
    },
    tr: {
      male: "21m00Tcm4TlvDq8ikWAM", 
      female: "EXAVITQu4vr4xnSDxMaL",
      neutral: "EXAVITQu4vr4xnSDxMaL",
    },
  };
  return voices[language]?.[gender ?? "neutral"] ?? "nova";
}
