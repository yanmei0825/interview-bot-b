import { Language } from "./types";
import { detectLanguage } from "./guards";

export interface ValidationResult {
  reply: string;
  violations: string[];
}

const AI_DISCLOSURE = [
  /\b(i am|i'm) (an? )?(ai|artificial intelligence|language model|bot|chatbot|virtual assistant|llm)\b/i,
  /\bas (an? )?(ai|language model|assistant)\b/i,
  /\bi (was|am) (trained|designed|programmed|built)\b/i,
  /\bmy (training|programming|instructions|system prompt)\b/i,
];

const HR_JARGON = [
  /\b(synergy|leverage|bandwidth|touch base|circle back|alignment|wellbeing|engagement score|kpi|okr|deliverable|stakeholder)\b/i,
];

const THERAPY_PHRASES = [
  /\b(i hear you|i feel your|that must be (very |really )?(hard|difficult|challenging)|you (should|might want to) (talk|speak) (to|with) (someone|a professional|hr))\b/i,
  /\b(it('s| is) (okay|ok|normal|valid) to feel)\b/i,
  /\b(your feelings are)\b/i,
];

const FILLER_PHRASES = [
  /^(great|excellent|wonderful|fantastic|amazing|perfect|awesome|absolutely|definitely|certainly|of course|sure thing|no problem|sounds good|that('s| is) (great|interesting|wonderful|amazing|good|helpful))[!.,]?\s/i,
  /^(thank you for sharing|thanks for (that|sharing|being honest|opening up))/i,
  /^(i (completely |totally |fully )?(understand|get it|see))/i,
];

function countQuestions(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

function countSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function stripFillerOpener(text: string): string {
  for (const p of FILLER_PHRASES) {
    if (p.test(text)) {
      const stripped = text.replace(/^[^.!?]+[.!?,]\s*/, "").trim();
      if (stripped.length > 10) return stripped;
    }
  }
  return text;
}

export function validateReply(
  reply: string,
  lang: Language,
  previousReplies: string[]
): ValidationResult {
  const violations: string[] = [];
  let text = reply.trim();

  const detectedLang = detectLanguage(text);
  if (detectedLang && detectedLang !== lang) {
    violations.push(`wrong_language:got_${detectedLang}_expected_${lang}`);
    return { reply: getFallback(lang), violations };
  }

  const stripped = stripFillerOpener(text);
  if (stripped !== text) {
    violations.push("filler_opener_removed");
    text = stripped;
  }

  for (const p of AI_DISCLOSURE) {
    if (p.test(text)) {
      violations.push("ai_disclosure");
      text = getFallback(lang);
      return { reply: text, violations };
    }
  }

  for (const p of HR_JARGON) {
    if (p.test(text)) {
      violations.push("hr_jargon");
      break;
    }
  }

  for (const p of THERAPY_PHRASES) {
    if (p.test(text)) {
      violations.push("therapy_phrase");
      text = getFallback(lang);
      return { reply: text, violations };
    }
  }

  const qCount = countQuestions(text);
  if (qCount > 1) {
    violations.push(`multiple_questions:${qCount}`);
    const firstQ = text.indexOf("?");
    if (firstQ !== -1) {
      text = text.slice(0, firstQ + 1).trim();
    }
  }

  const sentences = countSentences(text);
  if (sentences.length > 3) {
    violations.push(`too_long:${sentences.length}_sentences`);
    text = sentences.slice(0, 3).join(" ").trim();
    if (!text.endsWith("?")) {
      text = sentences.slice(0, 2).join(" ").trim();
    }
  }

  if (isDuplicateReply(text, previousReplies)) {
    violations.push("duplicate_reply");
    text = getFallback(lang);
  }

  if (!text.includes("?") && text.length > 0) {
    violations.push("no_question");
    text = getFallback(lang);
  }

  const adviceMarkers = /\b(you should|you could|i suggest|i recommend|try to|make sure|consider|it would help|it might help)\b/i;
  if (adviceMarkers.test(text)) {
    violations.push("advice_detected");
    const sentences = countSentences(text);
    const questionSentence = sentences.find((s) => s.includes("?"));
    text = questionSentence ?? getFallback(lang);
  }

  const genericPatterns = [
    /^could you give me a (specific )?example\??$/i,
    /^can you give me a (specific )?example\??$/i,
    /^tell me more\.?\??$/i,
    /^what do you mean\??$/i,
    /^can you elaborate\??$/i,
    /^what was your part in that\??$/i,
    /^tell me more about (it|that|this)\??$/i,
    /^can you say more about (it|that|this)\??$/i,
    /\b(let'?s start|to begin|first of all|moving on|now let'?s|at first)\b/i,
  ];
  if (genericPatterns.some((p) => p.test(text.trim()))) {
    violations.push("generic_question_no_context");
    text = getFallback(lang);
  }

  return { reply: text, violations };
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-zа-яёçğışöü\s]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 8)
    .join(" ");
}

function isDuplicateReply(candidate: string, previous: string[]): boolean {
  const fp = normalize(candidate);
  return previous.some((p) => normalize(p) === fp);
}

const FALLBACKS: Record<Language, string[]> = {
  en: [
    "Can you tell me a bit more about that?",
    "What else comes to mind?",
    "How did that play out for you?",
    "What would you add to that?",
  ],
  ru: [
    "Можешь рассказать чуть подробнее?",
    "Что ещё приходит на ум?",
    "Как это для тебя обернулось?",
    "Что бы ты добавил к этому?",
  ],
  tr: [
    "Bunu biraz daha açar mısın?",
    "Aklına başka ne geliyor?",
    "Bu senin için nasıl sonuçlandı?",
    "Buna ne eklerdin?",
  ],
};

let fallbackIndex = 0;
function getFallback(lang: Language): string {
  const pool = FALLBACKS[lang];
  const reply = pool[fallbackIndex % pool.length]!;
  fallbackIndex++;
  return reply;
}
