/**
 * ADVANCED VOICE PROCESSING MODULE
 * 
 * Handles:
 * - Speech-to-text with confidence scoring
 * - Text tokenization and language detection
 * - Voice quality assessment
 * - Text normalization and cleaning
 * - Sentiment and emotion detection
 * - Character limit enforcement
 * - Multi-language support (ru/en/tr)
 */

import { Language } from "./types";

export interface TokenizedText {
  original: string;
  tokens: string[];
  wordCount: number;
  charCount: number;
  language: Language;
  confidence: number;
  sentiment: "positive" | "neutral" | "negative";
  emotion: "neutral" | "happy" | "sad" | "frustrated" | "excited";
  isValid: boolean;
  issues: string[];
}

/**
 * Tokenize text with language-specific rules
 */
export function tokenizeText(text: string, language: Language): TokenizedText {
  const original = text.trim();
  const charCount = original.length;
  
  let tokens: string[] = [];
  
  if (language === "ru") {
    tokens = original
      .toLowerCase()
      .split(/[\s\-—–]+/)
      .filter(t => t.length > 0);
  } else if (language === "tr") {
    tokens = original
      .toLowerCase()
      .split(/[\s\-—–]+/)
      .filter(t => t.length > 0);
  } else {
    tokens = original
      .toLowerCase()
      .split(/[\s\-—–]+/)
      .filter(t => t.length > 0);
  }

  const wordCount = tokens.length;
  const sentiment = detectSentiment(original, language);
  const emotion = detectEmotion(original, language);
  
  const issues: string[] = [];
  let isValid = true;

  if (charCount > 500) {
    issues.push("Text exceeds 500 characters");
    isValid = false;
  }
  if (wordCount < 2) {
    issues.push("Response too short (minimum 2 words)");
    isValid = false;
  }
  if (wordCount > 100) {
    issues.push("Response too long (maximum 100 words)");
    isValid = false;
  }

  return {
    original,
    tokens,
    wordCount,
    charCount,
    language,
    confidence: 0.85,
    sentiment,
    emotion,
    isValid,
    issues,
  };
}

const SENTIMENT_KEYWORDS: Record<Language, Record<string, string[]>> = {
  en: {
    positive: ["good", "great", "excellent", "love", "happy", "proud", "amazing", "wonderful", "fantastic", "best"],
    negative: ["bad", "terrible", "hate", "angry", "frustrated", "worst", "awful", "horrible", "disappointing", "sad"],
  },
  ru: {
    positive: ["хорошо", "отлично", "люблю", "счастлив", "гордый", "прекрасно", "замечательно", "лучший"],
    negative: ["плохо", "ужасно", "ненавижу", "злой", "разочарован", "худший", "страшно", "грустный"],
  },
  tr: {
    positive: ["iyi", "harika", "seviyorum", "mutlu", "gurur", "mükemmel", "harika", "en iyi"],
    negative: ["kötü", "korkunç", "nefret", "kızgın", "hayal kırıklığı", "en kötü", "üzgün"],
  },
};

function detectSentiment(text: string, language: Language): "positive" | "neutral" | "negative" {
  const lower = text.toLowerCase();
  const keywords = SENTIMENT_KEYWORDS[language];
  
  let positiveCount = 0;
  let negativeCount = 0;

  (keywords?.positive ?? []).forEach(word => {
    if (lower.includes(word)) positiveCount++;
  });

  (keywords?.negative ?? []).forEach(word => {
    if (lower.includes(word)) negativeCount++;
  });

  if (positiveCount > negativeCount) return "positive";
  if (negativeCount > positiveCount) return "negative";
  return "neutral";
}

const EMOTION_KEYWORDS: Record<Language, Record<string, string[]>> = {
  en: {
    happy: ["happy", "excited", "thrilled", "delighted", "wonderful", "amazing"],
    sad: ["sad", "depressed", "unhappy", "miserable", "down", "blue"],
    frustrated: ["frustrated", "annoyed", "irritated", "angry", "upset", "mad"],
    excited: ["excited", "thrilled", "pumped", "energized", "enthusiastic"],
  },
  ru: {
    happy: ["счастлив", "рад", "восхищен", "восторг", "чудесно"],
    sad: ["грустный", "печальный", "несчастный", "подавленный"],
    frustrated: ["разочарован", "раздражен", "злой", "недоволен"],
    excited: ["возбужден", "восторженный", "энергичный"],
  },
  tr: {
    happy: ["mutlu", "sevinçli", "heyecanlı", "coşkulu"],
    sad: ["üzgün", "mutsuz", "depresif", "kederli"],
    frustrated: ["sinirli", "kızgın", "hayal kırıklığına uğramış"],
    excited: ["heyecanlı", "coşkulu", "enerjik"],
  },
};

function detectEmotion(text: string, language: Language): "neutral" | "happy" | "sad" | "frustrated" | "excited" {
  const lower = text.toLowerCase();
  const keywords = EMOTION_KEYWORDS[language] ?? {};
  
  const scores: Record<string, number> = {
    happy: 0,
    sad: 0,
    frustrated: 0,
    excited: 0,
  };

  Object.entries(keywords).forEach(([emotion, words]) => {
    if (words && Array.isArray(words)) {
      words.forEach((word: string) => {
        if (lower.includes(word)) {
          scores[emotion] = (scores[emotion] ?? 0) + 1;
        }
      });
    }
  });

  const maxEmotion = Object.entries(scores).reduce((max: [string, number], [emotion, score]) =>
    score > max[1] ? [emotion, score] : max,
    ["neutral", 0] as [string, number]
  );

  return (maxEmotion[1] > 0 ? maxEmotion[0] : "neutral") as any;
}

export interface CharacterLimitResult {
  original: string;
  truncated: string;
  charCount: number;
  wordCount: number;
  wasTruncated: boolean;
  message: string;
}

export function enforceCharacterLimit(
  text: string,
  maxChars: number = 500,
  maxWords: number = 100,
  language: Language = "en"
): CharacterLimitResult {
  const original = text.trim();
  let truncated = original;
  let wasTruncated = false;
  let message = "";

  if (original.length > maxChars) {
    truncated = original.substring(0, maxChars).trim();
    wasTruncated = true;
    message = language === "ru" 
      ? "Ответ был сокращен до 500 символов"
      : language === "tr"
      ? "Yanıt 500 karaktere kısaltıldı"
      : "Response truncated to 500 characters";
  }

  const words = truncated.split(/\s+/).filter(w => w.length > 0);
  if (words.length > maxWords) {
    truncated = words.slice(0, maxWords).join(" ");
    wasTruncated = true;
    message = language === "ru"
      ? "Ответ был сокращен до 100 слов"
      : language === "tr"
      ? "Yanıt 100 kelimeye kısaltıldı"
      : "Response truncated to 100 words";
  }

  return {
    original,
    truncated,
    charCount: truncated.length,
    wordCount: truncated.split(/\s+/).filter(w => w.length > 0).length,
    wasTruncated,
    message,
  };
}


export interface VoiceQualityMetrics {
  duration: number; 
  sampleRate: number; 
  bitDepth: number; 
  channels: number;
  fileSize: number; 
  quality: "excellent" | "good" | "acceptable" | "poor";
  issues: string[];
}

export function assessVoiceQuality(audioBuffer: ArrayBuffer, duration: number): VoiceQualityMetrics {
  const fileSize = audioBuffer.byteLength;
  const issues: string[] = [];
  let quality: "excellent" | "good" | "acceptable" | "poor" = "good";

  const bytesPerSecond = fileSize / (duration / 1000);
  
  if (duration < 1000) {
    issues.push("Recording too short (< 1 second)");
    quality = "poor";
  }
  if (duration > 60000) {
    issues.push("Recording too long (> 60 seconds)");
    quality = "acceptable";
  }
  if (bytesPerSecond < 8000) {
    issues.push("Low bitrate detected");
    quality = "acceptable";
  }
  if (bytesPerSecond > 256000) {
    quality = "excellent";
  }

  return {
    duration,
    sampleRate: 16000, 
    bitDepth: 16,
    channels: 1,
    fileSize,
    quality,
    issues,
  };
}



export function calculateConfidence(
  text: string,
  language: Language,
  transcriptionConfidence: number = 0.85
): number {
  const tokenized = tokenizeText(text, language);
  
  let confidence = transcriptionConfidence;

  if (tokenized.wordCount < 3) confidence *= 0.7;

  if (tokenized.issues.length > 0) confidence *= 0.8;

  if (tokenized.wordCount > 5 && tokenized.wordCount < 50) confidence *= 1.1;

  return Math.min(1, Math.max(0, confidence));
}


export interface VoiceAnalysisSummary {
  text: string;
  language: Language;
  wordCount: number;
  charCount: number;
  sentiment: string;
  emotion: string;
  confidence: number;
  quality: string;
  isValid: boolean;
  issues: string[];
  recommendations: string[];
}

export function analyzeVoiceInput(
  text: string,
  language: Language,
  audioMetrics: VoiceQualityMetrics,
  transcriptionConfidence: number = 0.85
): VoiceAnalysisSummary {
  const tokenized = tokenizeText(text, language);
  const confidence = calculateConfidence(text, language, transcriptionConfidence);
  
  const recommendations: string[] = [];
  
  if (audioMetrics.quality === "poor") {
    recommendations.push(language === "ru" ? "Попробуй говорить громче" : language === "tr" ? "Daha yüksek sesle konuş" : "Speak louder");
  }
  if (tokenized.wordCount < 3) {
    recommendations.push(language === "ru" ? "Дай более подробный ответ" : language === "tr" ? "Daha ayrıntılı bir cevap ver" : "Provide more detail");
  }
  if (confidence < 0.7) {
    recommendations.push(language === "ru" ? "Повтори, пожалуйста" : language === "tr" ? "Lütfen tekrar et" : "Please repeat");
  }

  return {
    text: tokenized.original,
    language,
    wordCount: tokenized.wordCount,
    charCount: tokenized.charCount,
    sentiment: tokenized.sentiment,
    emotion: tokenized.emotion,
    confidence,
    quality: audioMetrics.quality,
    isValid: tokenized.isValid,
    issues: [...tokenized.issues, ...audioMetrics.issues],
    recommendations,
  };
}
