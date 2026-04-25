import { DimensionKey } from "./types";

export const MAX_REPLY_TOKENS = 150;

const SIGNAL_KEYWORDS: Record<DimensionKey, string[]> = {
  D1: [
    "proud","pride","achievement","win","success","result","accomplished","delivered","nailed","milestone",
    "гордость","гордился","достижение","результат","успех","сделал","получилось","справился","завершил","победа",
    "gurur","başarı","başardım","sonuç","tamamladım","hallettim","kazandım",
  ],
  D2: [
    "stable","secure","security","valued","fair","fairness","pay","salary","compensation","recognized","underpaid","overworked",
    "стабильность","стабильно","ценность","ценят","справедливо","зарплата","безопасность","недооценивают","уверенность",
    "güvenli","güvenlik","değerli","adil","maaş","istikrar","değersiz","takdir",
  ],
  D3: [
    "team","colleague","coworker","manager","boss","trust","conflict","support","relationship","together","toxic","alone","isolated",
    "команда","коллега","руководитель","доверие","конфликт","поддержка","отношения","токсично","один","изолирован",
    "ekip","meslektaş","yönetici","güven","çatışma","destek","ilişki","toksik","yalnız",
  ],
  D4: [
    "autonomy","control","decide","decision","freedom","independent","ownership","flexibility","micromanage","micromanaged",
    "автономия","контроль","решение","свобода","самостоятельно","независимость","микроменеджмент","гибкость",
    "özerklik","karar","özgürlük","bağımsız","esneklik","kontrol",
  ],
  D5: [
    "energy","motivated","motivation","engaged","flow","drain","drained","boring","excited","passionate","burned out","burnout","exhausted",
    "энергия","мотивация","вовлечённость","поток","скучно","интересно","захватывает","выгорание","истощение","устал",
    "enerji","motivasyon","bağlılık","akış","sıkıcı","heyecan","tükenme","yorgunluk",
  ],
  D6: [
    "feedback","recognition","seen","acknowledged","noticed","credit","praise","review","performance","invisible","ignored",
    "обратная связь","признание","замечают","оценка","отзыв","невидимый","игнорируют","похвала","видят",
    "geri bildirim","tanınma","fark edilmek","övgü","değerlendirme","görünmez","görmezden",
  ],
  D7: [
    "learn","learning","grow","growth","skill","develop","development","training","course","new","stagnant","stuck",
    "учиться","учёба","расти","рост","навык","развитие","обучение","новое","застой","застрял",
    "öğrenmek","büyüme","beceri","gelişim","eğitim","yeni","durağan","takılı",
  ],
  D8: [
    "purpose","meaning","meaningful","values","matter","impact","mission","believe","pointless","hollow",
    "смысл","значение","ценности","важно","миссия","влияние","бессмысленно","пусто","верю",
    "amaç","anlam","değerler","önemli","misyon","etki","anlamsız","boş",
  ],
  D9: [
    "obstacle","block","blocked","slow","frustrate","frustrated","workload","overload","bureaucracy","process","tool","broken","chaos",
    "препятствие","мешает","нагрузка","перегрузка","бюрократия","тормозит","хаос","сломано","процесс",
    "engel","engellendi","iş yükü","aşırı yük","bürokrasi","süreç","yavaş","kaos",
  ],
  D10: [
    "voice","speak up","heard","safe","psychological safety","opinion","idea","suggestion","ignored","silenced","afraid to say",
    "голос","высказаться","услышан","безопасно","мнение","идея","игнорируют","замолчали","боюсь сказать",
    "ses","sesini yükselt","duyulmak","güvenli","fikir","öneri","görmezden","susturuldu",
  ],
};

export function extractSignals(text: string, dim: DimensionKey): string[] {
  const lower = text.toLowerCase();
  return (SIGNAL_KEYWORDS[dim] ?? []).filter((kw) => lower.includes(kw.toLowerCase()));
}

export type Sentiment = "positive" | "negative" | "neutral";

const POSITIVE_WORDS = [
  "good","great","love","enjoy","proud","happy","excited","motivated","meaningful","growth","trust","support",
  "хорошо","отлично","нравится","горжусь","рад","мотивация","доверие","поддержка","смысл","рост","люблю","доволен",
  "iyi","harika","seviyorum","gurur","mutlu","motivasyon","güven","destek","anlam","büyüme",
];

const NEGATIVE_WORDS = [
  "bad","hate","frustrated","stressed","tired","unfair","ignored","burned out","burnout","toxic","alone","stuck","pointless","broken",
  "плохо","ненавижу","устал","стресс","несправедливо","игнорируют","выгорание","токсично","один","застрял","бессмысленно","сломано",
  "kötü","nefret","yorgun","stres","adaletsiz","görmezden","tükenme","toksik","yalnız","anlamsız",
];

export function detectSentiment(text: string): Sentiment {
  const lower = text.toLowerCase();
  const pos = POSITIVE_WORDS.filter((w) => lower.includes(w)).length;
  const neg = NEGATIVE_WORDS.filter((w) => lower.includes(w)).length;
  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
}

export function parseLLMOutput(raw: string): string {
  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.question && typeof parsed.question === "string") return parsed.question.trim();
  } catch { /* not JSON, try regex */ }
  const match = trimmed.match(/"question"\s*:\s*"([^"]+)"/);
  if (match?.[1]) return match[1].trim();
  if (trimmed.includes("?")) return trimmed.replace(/^\W+/, "").trim();
  return "";
}

export function isReplyDuplicate(
  reply: string,
  history: { role: string; content: string }[]
): boolean {
  if (!reply || reply.length < 5) return false;
  const replyLower = reply.toLowerCase().trim();
  const fp = replyLower
    .replace(/[^a-zа-яёçğışöü\s]/gi, "")
    .replace(/\s+/g, " ")
    .split(" ")
    .slice(0, 6)
    .join(" ");

  return history
    .filter((m) => m.role === "assistant")
    .some((m) => {
      const mLower = m.content.toLowerCase().trim();
      const mFp = mLower
        .replace(/[^a-zа-яёçğışöü\s]/gi, "")
        .replace(/\s+/g, " ")
        .split(" ")
        .slice(0, 6)
        .join(" ");
      if (mLower === replyLower) return true;
      if (mFp === fp && fp.length > 5) return true;
      if (replyLower.slice(0, 30) === mLower.slice(0, 30) && replyLower.length > 20) return true;
      return false;
    });
}
