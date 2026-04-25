import OpenAI from "openai";
import { InterviewSession, Language } from "./types";
import { parseLLMOutput, isReplyDuplicate, MAX_REPLY_TOKENS } from "./prompt";
import { buildSystemPrompt, buildUserMessage, buildLLMInput } from "./llm-prompt";
import { logEvent } from "./session";
import { getDimension } from "./dimensions";

interface UsageRecord {
  token: string; model: string; promptTokens: number;
  completionTokens: number; totalTokens: number; timestamp: number;
}
const usageLog: UsageRecord[] = [];
export function getUsageLog(): UsageRecord[] { return usageLog; }
export function getUsageSummary() {
  return usageLog.reduce((acc, r) => ({ promptTokens: acc.promptTokens + r.promptTokens, completionTokens: acc.completionTokens + r.completionTokens, totalTokens: acc.totalTokens + r.totalTokens, calls: acc.calls + 1 }), { promptTokens: 0, completionTokens: 0, totalTokens: 0, calls: 0 });
}

let openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (openaiClient) return openaiClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const proxyUrl = process.env.PROXY_URL;
  let proxyFetch: OpenAI["fetch"] | undefined;
  if (proxyUrl) {
    const { ProxyAgent } = require("undici") as { ProxyAgent: typeof import("undici").ProxyAgent };
    const agent = new ProxyAgent(proxyUrl);
    proxyFetch = (url: string, options?: RequestInit) => fetch(url, { ...(options as any), duplex: "half", dispatcher: agent } as any);
  }
  openaiClient = new OpenAI({ apiKey, baseURL: process.env.LLM_BASE_URL ?? "https://api.openai.com/v1", fetch: proxyFetch });
  return openaiClient;
}

function getMockReply(session: InterviewSession): string {
  const dim = session.currentDimension;
  const lang = session.language ?? "en";
  const mocks: Record<string, Record<string, string>> = {
    en: { D1:"What made that feel like a real win for you?", D2:"Do you feel your position here is solid right now?", D3:"Is there someone at work you can genuinely count on?", D4:"How much say do you have in how you approach your work?", D5:"What part of your job actually pulls you in?", D6:"When did you last get feedback that actually helped?", D7:"Have you picked up anything genuinely new in the last few months?", D8:"Does what you do here feel like it matters beyond the tasks?", D9:"What's the biggest thing getting in the way of your best work?", D10:"Do you feel like you can actually speak up when you have a concern?" },
    ru: { D1:"Что именно сделало это победой лично для тебя?", D2:"Насколько ты чувствуешь себя устойчиво в своей роли?", D3:"Есть ли на работе кто-то, на кого ты реально можешь рассчитывать?", D4:"Насколько ты сам определяешь, как делать свою работу?", D5:"Какая часть работы по-настоящему захватывает тебя?", D6:"Когда последний раз ты получал обратную связь, которая реально помогла?", D7:"Ты узнал что-то по-настоящему новое за последние месяцы?", D8:"Ощущаешь ли ты, что твоя работа имеет значение?", D9:"Что больше всего мешает тебе работать на полную?", D10:"Чувствуешь ли ты, что можешь высказаться, когда есть беспокойство?" },
    tr: { D1:"Bu senin için neden bir kazanım gibi hissettirdi?", D2:"Şu an rolünde ne kadar yerleşik hissediyorsun?", D3:"İşte gerçekten güvenebileceğin biri var mı?", D4:"İşini nasıl yapacağın konusunda ne kadar söz hakkın var?", D5:"İşinin seni gerçekten içine çeken bir parçası var mı?", D6:"En son ne zaman gerçekten yardımcı olan bir geri bildirim aldın?", D7:"Son aylarda gerçekten yeni bir şey öğrendin mi?", D8:"Yaptığın işin önemli olduğunu hissediyor musun?", D9:"En iyi işini yapmanın önüne geçen en büyük şey nedir?", D10:"Bir endişen olduğunda sesini yükseltebileceğini hissediyor musun?" },
  };
  return mocks[lang]?.[dim] ?? "Can you tell me a bit more about that?";
}

function getFallbackQuestion(session: InterviewSession): string {
  const lang = (session.language ?? "en") as Language;
  const dim = getDimension(session.currentDimension);
  const cov = session.coverage[session.currentDimension];
  const pool = cov.turnCount > 0 ? dim.probeQuestions[lang] : dim.starterQuestions[lang];
  if (!pool || pool.length === 0) return getMockReply(session);
  const asked = new Set(session.history.filter(m => m.role === "assistant").map(m => m.content.trim().toLowerCase().slice(0, 40)));
  const unused = pool.filter(q => !asked.has(q.trim().toLowerCase().slice(0, 40)));
  const chosen = unused.length > 0 ? unused[Math.floor(Math.random() * unused.length)] : pool[Math.floor(Math.random() * pool.length)];
  return chosen ?? getMockReply(session);
}

const LLM_CONFIG = {
  temperature: 0.5,
  max_tokens: MAX_REPLY_TOKENS,
  frequency_penalty: 0.5,
  presence_penalty: 0.2,
  stop: ["\n\n", "?\n", "Human:", "User:", "Interviewer:"],
} as const;

export async function getLLMReply(session: InterviewSession): Promise<string> {
  if (process.env.MOCK_LLM === "true") return getMockReply(session);
  const ai = getOpenAIClient();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";
  const systemPrompt = buildSystemPrompt(session);
  const userMessage = buildUserMessage(buildLLMInput(session));
  try {
    const response = await ai.chat.completions.create({ model, max_tokens: LLM_CONFIG.max_tokens, temperature: LLM_CONFIG.temperature, frequency_penalty: LLM_CONFIG.frequency_penalty, presence_penalty: LLM_CONFIG.presence_penalty, stop: [...LLM_CONFIG.stop], messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }] });
    if (response.usage) {
      usageLog.push({ token: session.token, model, promptTokens: response.usage.prompt_tokens, completionTokens: response.usage.completion_tokens, totalTokens: response.usage.total_tokens, timestamp: Date.now() });
      logEvent(session.token, "llm_usage", `prompt=${response.usage.prompt_tokens} completion=${response.usage.completion_tokens}`);
    }
    const parsed = parseLLMOutput(response.choices[0]?.message?.content?.trim() ?? "");
    if (!isReplyDuplicate(parsed, session.history)) return parsed;
    return "";
  } catch (err: any) {
    console.error("[LLM REQUEST FAILED]", { status: err?.status, message: err?.message, code: err?.code });
    await logEvent(session.token, "llm_fallback_used", `error=${err?.message ?? "unknown"}`, session.currentDimension);
    return getFallbackQuestion(session);
  }
}

// Re-ask: LLM rephrases current dimension question — no coverage/signal/advance
export async function getLLMReAsk(session: InterviewSession): Promise<string> {
  if (process.env.MOCK_LLM === "true") return getFallbackQuestion(session);
  const ai = getOpenAIClient();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";
  const systemPrompt = buildSystemPrompt(session);
  const userMessage = buildUserMessage(buildLLMInput(session, "re_ask"));
  try {
    const response = await ai.chat.completions.create({ model, max_tokens: LLM_CONFIG.max_tokens, temperature: 0.7, frequency_penalty: 0.8, presence_penalty: 0.4, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }] });
    if (response.usage) {
      usageLog.push({ token: session.token, model, promptTokens: response.usage.prompt_tokens, completionTokens: response.usage.completion_tokens, totalTokens: response.usage.total_tokens, timestamp: Date.now() });
      logEvent(session.token, "llm_usage", `re_ask prompt=${response.usage.prompt_tokens} completion=${response.usage.completion_tokens}`);
    }
    const parsed = parseLLMOutput(response.choices[0]?.message?.content?.trim() ?? "");
    return parsed || getFallbackQuestion(session);
  } catch (err: any) {
    console.error("[LLM RE_ASK FAILED]", { message: err?.message });
    await logEvent(session.token, "llm_fallback_used", `re_ask error=${err?.message ?? "unknown"}`, session.currentDimension);
    return getFallbackQuestion(session);
  }
}
