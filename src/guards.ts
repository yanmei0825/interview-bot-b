import { Language } from "./types";

export function detectLanguage(text: string): Language | null {
  const clean = text.replace(/\s+/g, "");
  if (clean.length === 0) return null;

  const cyrillic = (clean.match(/[а-яёА-ЯЁ]/g) ?? []).length;
  const turkish  = (clean.match(/[çğışöüÇĞİŞÖÜ]/g) ?? []).length;
  const latin    = (clean.match(/[a-zA-Z]/g) ?? []).length;
  const total    = cyrillic + turkish + latin;

  if (total === 0) return null;

  // require at least 20% of letter chars to be from that script (lowered from 30% for better detection)
  if (cyrillic / total >= 0.2) return "ru";
  if (turkish  / total >= 0.2) return "tr";
  if (latin    / total >= 0.2) return "en";
  return null;
}

function isWrongLanguage(text: string, expected: Language): boolean {
  const detected = detectLanguage(text);
  if (!detected) return false;
  return detected !== expected;
}

export type InputType =
  | "valid_answer"
  | "refusal"
  | "continue_request"
  | "stop_signal"
  | "off_topic"
  | "gibberish"
  | "too_short"
  | "too_long"
  | "emotion"
  | "confusion"
  | "wrong_language"
  | "emoji_mixed";

const MIN_CHARS = 2;
const MAX_CHARS = 1200;
// Minimum meaningful words for a substantive answer
const MIN_WORDS = 3;

const EMOJI_RE = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}\u{FE00}-\u{FEFF}\u{200D}\u{20E3}\u{FE0F}]+/gu;

export function stripEmoji(text: string): string {
  return text.replace(EMOJI_RE, "").replace(/\s{2,}/g, " ").trim();
}

function isEmojiOnly(text: string): boolean {
  return stripEmoji(text).length === 0;
}

function hasEmoji(text: string): boolean {
  EMOJI_RE.lastIndex = 0;
  return EMOJI_RE.test(text);
}


function isGibberish(text: string): boolean {
  const stripped = text.replace(/\s+/g, "");
  if (stripped.length < MIN_CHARS) return true;

  if (/(.)\1{3,}/.test(stripped)) return true;

  const letters = (stripped.match(/\p{L}/gu) ?? []).length;
  return letters / stripped.length < 0.5;
}

const EMOTION_PATTERNS: Record<Language, RegExp> = {
  en: /\b(frustrated|exhausted|burned out|burnout|stressed|overwhelmed|angry|upset|sad|depressed|anxious|tired of|fed up|can't take|hate this|awful|terrible|horrible)\b/i,
  ru: /\b(устал|выгорел|выгорание|стресс|злюсь|расстроен|грустно|тревожно|надоело|ненавижу|ужасно|невыносимо|не могу больше|всё достало)\b/i,
  tr: /\b(yoruldum|tükendim|stres|sinirli|üzgün|bunaldım|nefret|berbat|dayanamıyorum|bıktım|bunaldım)\b/i,
};

const JAILBREAK_PATTERNS = [
  /ignore (all |previous |your )?(instructions|rules|prompt)/i,
  /you are now/i,
  /pretend (you are|to be)/i,
  /act as (a |an )?(different|new|unrestricted)/i,
  /forget (everything|your instructions)/i,
  /system prompt/i,
  /override (your |the )?(instructions|rules)/i,
  /\bDAN\b/,
  /jailbreak/i,
  /do anything now/i,
  /new persona/i,
  /disregard (your |all )?(previous |prior )?(instructions|rules)/i,
  /you (must|should|have to) (obey|follow|listen to) me/i,
  /stop being/i,
  /from now on (you are|act as|behave as)/i,
  /reveal (your |the )?(prompt|instructions|system)/i,
  /what (are|were) your instructions/i,
];

const REFUSAL_PATTERNS: Record<Language, RegExp> = {
  en: /\b(skip|pass|next question|don't want|not comfortable|rather not|no answer|decline|prefer not|won't answer|not going to answer|move on|next topic)\b/i,
  ru: /\b(пропустить|пропусти|не хочу|не буду|отказываюсь|не отвечу|не хочу отвечать|не буду отвечать|перейдём дальше)\b/i,
  tr: /\b(geç|atla|istemiyorum|cevaplamak istemiyorum|hayır|pas geçeyim|cevap vermek istemiyorum|geçelim|devam edelim)\b/i,
};

const CONTINUE_PATTERNS: Record<Language, RegExp> = {
  en: /\b(continue|let'?s continue|keep going|move on|next|next topic|go on|carry on|what'?s next|let'?s go|proceed|next question)\b/i,
  ru: /(давай дальше|давай продолжим|продолжим|продолжай|продолжаем|поехали дальше|идём дальше|пошли дальше|двигаемся дальше|на чём остановил(ись|ся)|следующая тема|следующий вопрос|перейдём к следующему|к следующей теме|перейдём дальше|давай к следующему)/i,
  tr: /(devam edelim|devam et|devam ediyoruz|sonraki konuya|sonraki soruya|kaldığımız yerden devam|ilerliyoruz|geçelim|ilerleyelim|bir sonraki soruya geçelim)/i,
};

const STOP_SIGNAL_PATTERNS: Record<Language, RegExp> = {
  en: /\b(stop|wait|hold on|pause|that'?s not right|you misunderstood|you got it wrong|not what i meant|you'?re acting like a bot|sounds like a bot|too formal|start over|reset|let'?s restart|what'?s going on|what are you doing)\b/i,
  ru: /(стоп|подожди|погоди|не так|не то|не правильно|ты не так понял|говоришь как бот|звучишь как бот|слишком официально|начнём заново|начни заново|что происходит|что ты делаешь|сначала|перезапусти|давай сначала)/i,
  tr: /(dur|bekle|yanlış anladın|bu doğru değil|bot gibi konuşuyorsun|çok resmi|baştan başlayalım|ne oluyor|ne yapıyorsun|yeniden başla|sıfırla)/i,
};

const CONFUSION_PATTERNS: Record<Language, RegExp> = {
  en: /\b(don'?t understand|not sure what (you mean|this means)|what do you mean|unclear|confused|huh\??|can you (explain|clarify)|what are you asking|what does that mean|could you rephrase)\b/i,
  ru: /\b(не понимаю|не понял|что имеешь в виду|непонятно|объясни|поясни|что ты спрашиваешь|не понятно|можешь переформулировать)\b/i,
  tr: /\b(anlamadım|ne demek istiyorsun|açıklar mısın|anlaşılmadı|ne soruyorsun|ne demek bu|yeniden sorar mısın)\b/i,
};

export function classifyInput(text: string, lang: Language): InputType {
  if (text.length > MAX_CHARS) return "too_long";
  if (text.trim().length < MIN_CHARS) return "too_short";

  if (isEmojiOnly(text)) return "gibberish";

  const clean = hasEmoji(text) ? stripEmoji(text) : text;
  const hadEmoji = clean !== text;

  if (isGibberish(clean)) return "gibberish";

  if (clean.trim().length < MIN_CHARS) return "too_short";

  if (STOP_SIGNAL_PATTERNS[lang].test(clean)) return "stop_signal";

  for (const p of JAILBREAK_PATTERNS) {
    if (p.test(clean)) return "off_topic";
  }

  // continue_request checked before refusal — "давай дальше" must not be caught as refusal
  if (CONTINUE_PATTERNS[lang].test(clean)) return "continue_request";

  if (REFUSAL_PATTERNS[lang].test(clean)) return "refusal";

  if (CONFUSION_PATTERNS[lang].test(clean)) return "confusion";

  if (EMOTION_PATTERNS[lang].test(clean)) return "emotion";

  if (isWrongLanguage(clean, lang)) return "wrong_language";

  if (hadEmoji) return "emoji_mixed";

  // Answers with fewer than MIN_WORDS meaningful words are too vague to be substantive
  const wordCount = clean.trim().split(/\s+/).filter(w => w.length > 1).length;
  if (wordCount < MIN_WORDS) return "too_short";

  return "valid_answer";
}

type GuardPool = Record<Language, string[]>;

const GUARD_POOLS: Record<InputType, GuardPool> = {
  gibberish: {
    en: [
      "Something got garbled there — want to try again?",
      "That didn't come through clearly. Could you rephrase?",
      "Looks like something went wrong with that message. Try again?",
    ],
    ru: [
      "Что-то пошло не так с этим сообщением. Попробуй ещё раз.",
      "Не совсем понял — можешь написать иначе?",
      "Кажется, сообщение не дошло. Попробуй снова.",
    ],
    tr: [
      "Bu mesajda bir sorun olmuş gibi görünüyor. Tekrar dener misin?",
      "Mesaj tam anlaşılmadı — yeniden yazar mısın?",
      "Bir şeyler ters gitti. Tekrar dener misin?",
    ],
  },
  too_short: {
    en: [
      "Could you say a bit more about that?",
      "A little more detail would help — what do you mean?",
      "Can you expand on that a little?",
    ],
    ru: [
      "Можешь рассказать чуть подробнее?",
      "Немного больше деталей — что ты имеешь в виду?",
      "Можешь развернуть мысль?",
    ],
    tr: [
      "Biraz daha açar mısın?",
      "Biraz daha ayrıntı verir misin?",
      "Bunu biraz genişletebilir misin?",
    ],
  },
  too_long: {
    en: [
      "That's quite a lot — could you give me the short version? A few sentences is plenty.",
      "Could you pick the most important part and say it in a few sentences?",
      "A bit long — what's the core of it?",
    ],
    ru: [
      "Это довольно много — можешь дать краткую версию? Пары предложений достаточно.",
      "Можешь выделить самое главное в паре предложений?",
      "Немного много — что самое важное?",
    ],
    tr: [
      "Bu oldukça fazla — kısa versiyonunu verebilir misin? Birkaç cümle yeterli.",
      "En önemli kısmı birkaç cümlede özetleyebilir misin?",
      "Biraz uzun — özünü birkaç cümlede anlatabilir misin?",
    ],
  },
  off_topic: {
    en: [
      "Let's keep things on track — we're here to talk about your work experience.",
      "That's outside what we're covering here. Back to your work.",
      "I'll stay focused on the interview.",
    ],
    ru: [
      "Давай держаться темы — мы здесь, чтобы поговорить о твоём рабочем опыте.",
      "Это за рамками нашего разговора. Вернёмся к работе.",
      "Мне нужно оставаться в рамках интервью.",
    ],
    tr: [
      "Konuya odaklanalım — burada iş deneyimini konuşmak için varız.",
      "Bu kapsam dışında. İş deneyimine geri dönelim.",
      "Görüşmeye odaklanmam gerekiyor.",
    ],
  },
  refusal: {
    en: ["No problem — we can move on.", "Totally fine, let's skip that.", "Understood."],
    ru: ["Без проблем — двигаемся дальше.", "Всё нормально, пропустим.", "Понял."],
    tr: ["Sorun değil — devam edelim.", "Tamam, geçelim.", "Anladım."],
  },
  continue_request: {
    en: ["Sure —", "Of course —", ""],
    ru: ["Хорошо —", "Конечно —", ""],
    tr: ["Tabii —", "Elbette —", ""],
  },
  stop_signal: {
    en: ["Got it.", "Fair enough.", "Understood."],
    ru: ["Понял.", "Хорошо.", "Окей."],
    tr: ["Anladım.", "Tamam.", "Peki."],
  },
  confusion: {
    en: ["Fair enough — let me put it differently.", "Let me rephrase that.", "Different angle:"],
    ru: ["Понятно — позволь переформулировать.", "Попробую иначе.", "Зайду с другой стороны."],
    tr: ["Anlaşıldı — farklı bir şekilde sorayım.", "Farklı ifade edeyim.", "Farklı açıdan yaklaşayım."],
  },
  emotion: {
    en: ["That sounds tough.", "Yeah, that's a lot.", "Sounds hard."],
    ru: ["Это звучит тяжело.", "Да, это немало.", "Понимаю, непросто."],
    tr: ["Bu zor görünüyor.", "Evet, bu çok fazla.", "Zor bir durum."],
  },
  wrong_language: {
    en: [
      "We started this interview in English — please continue in English.",
      "Just a reminder — we're keeping this in English throughout.",
    ],
    ru: [
      "Мы начали это интервью на русском — пожалуйста, продолжай на русском.",
      "Напомню — мы ведём это интервью на русском языке.",
    ],
    tr: [
      "Bu görüşmeye Türkçe başladık — lütfen Türkçe devam et.",
      "Hatırlatayım — bu görüşmeyi Türkçe yürütüyoruz.",
    ],
  },
  emoji_mixed: { en: [""], ru: [""], tr: [""] },  // emoji stripped, text processed normally
  valid_answer: { en: [""], ru: [""], tr: [""] },
};

export function getGuardReply(cls: InputType, lang: Language): string {
  const pool = GUARD_POOLS[cls][lang];
  return pool[Math.floor(Math.random() * pool.length)] ?? pool[0] ?? "";
}
