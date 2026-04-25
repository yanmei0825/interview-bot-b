import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { ProxyAgent } from "undici";
import { InterviewSession } from "./types";
import { parseLLMOutput, isReplyDuplicate, MAX_REPLY_TOKENS } from "./prompt";
import { buildSystemPrompt, buildUserMessage, buildLLMInput } from "./llm-prompt";
import { logEvent } from "./session";

interface UsageRecord {
  token: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  timestamp: number;
}
const usageLog: UsageRecord[] = [];

export function getUsageLog(): UsageRecord[] { return usageLog; }

export function getUsageSummary() {
  return usageLog.reduce(
    (acc, r) => ({
      promptTokens: acc.promptTokens + r.promptTokens,
      completionTokens: acc.completionTokens + r.completionTokens,
      totalTokens: acc.totalTokens + r.totalTokens,
      calls: acc.calls + 1,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0, calls: 0 }
  );
}

function getProvider(): "claude" | "openai" | "groq" {
  const p = (process.env.LLM_PROVIDER ?? "").toLowerCase();
  if (p === "claude" || p === "anthropic") return "claude";
  if (p === "groq") return "groq";
  return "openai";
}

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (openaiClient) return openaiClient;

  const provider = getProvider();
  const apiKey = provider === "groq"
    ? process.env.GROQ_API_KEY
    : process.env.OPENAI_API_KEY;

  if (!apiKey) throw new Error(`${provider.toUpperCase()}_API_KEY is not configured.`);

  const proxyUrl = process.env.PROXY_URL;
  const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : null;

  const baseURL = provider === "groq"
    ? "https://api.groq.com/openai/v1"
    : (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1");

  openaiClient = new OpenAI({
    apiKey,
    baseURL,
    fetch: proxyAgent
      ? (url: string, options?: RequestInit) =>
          fetch(url, { ...(options as any), dispatcher: proxyAgent } as any)
      : undefined,
  });

  return openaiClient;
}

let claudeClient: Anthropic | null = null;

function getClaudeClient(): Anthropic {
  if (claudeClient) return claudeClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");
  claudeClient = new Anthropic({ apiKey });
  return claudeClient;
}

function getMockReply(session: InterviewSession): string {
  const dim = session.currentDimension;
  const lang = session.language ?? "en";
  const mocks: Record<string, Record<string, string>> = {
    en: {
      D1: "What made that feel like a real win for you?",
      D2: "Do you feel your position here is solid right now?",
      D3: "Is there someone at work you can genuinely count on?",
      D4: "How much say do you have in how you approach your work?",
      D5: "What part of your job actually pulls you in?",
      D6: "When did you last get feedback that actually helped?",
      D7: "Have you picked up anything genuinely new in the last few months?",
      D8: "Does what you do here feel like it matters beyond the tasks?",
      D9: "What's the biggest thing getting in the way of your best work?",
      D10: "Do you feel like you can actually speak up when you have a concern?",
    },
    ru: {
      D1: "Что именно сделало это победой лично для тебя?",
      D2: "Насколько ты чувствуешь себя устойчиво в своей роли?",
      D3: "Есть ли на работе кто-то, на кого ты реально можешь рассчитывать?",
      D4: "Насколько ты сам определяешь, как делать свою работу?",
      D5: "Какая часть работы по-настоящему захватывает тебя?",
      D6: "Когда последний раз ты получал обратную связь, которая реально помогла?",
      D7: "Ты узнал что-то по-настоящему новое за последние месяцы?",
      D8: "Ощущаешь ли ты, что твоя работа имеет значение?",
      D9: "Что больше всего мешает тебе работать на полную?",
      D10: "Чувствуешь ли ты, что можешь высказаться, когда есть беспокойство?",
    },
    tr: {
      D1: "Bu senin için neden bir kazanım gibi hissettirdi?",
      D2: "Şu an rolünde ne kadar yerleşik hissediyorsun?",
      D3: "İşte gerçekten güvenebileceğin biri var mı?",
      D4: "İşini nasıl yapacağın konusunda ne kadar söz hakkın var?",
      D5: "İşinin seni gerçekten içine çeken bir parçası var mı?",
      D6: "En son ne zaman gerçekten yardımcı olan bir geri bildirim aldın?",
      D7: "Son aylarda gerçekten yeni bir şey öğrendin mi?",
      D8: "Yaptığın işin önemli olduğunu hissediyor musun?",
      D9: "En iyi işini yapmanın önüne geçen en büyük şey nedir?",
      D10: "Bir endişen olduğunda sesini yükseltebileceğini hissediyor musun?",
    },
  };
  return mocks[lang]?.[dim] ?? "Can you tell me a bit more about that?";
}

const LLM_CONFIG = {
  temperature: 0.5,
  max_tokens: MAX_REPLY_TOKENS,
  frequency_penalty: 0.5,
  presence_penalty: 0.2,
  stop: ["\n\n", "?\n", "Human:", "User:", "Interviewer:"],
} as const;
export async function getLLMReply(session: InterviewSession): Promise<string> {
  if (process.env.MOCK_LLM === "true") {
    return getMockReply(session);
  }

  const provider = getProvider();
  
  const systemPrompt = buildSystemPrompt(session);
  
  const llmInput = buildLLMInput(session);
  const userMessage = buildUserMessage(llmInput);
  const messages = [{ role: "user" as const, content: userMessage }];

  if (provider === "claude") {
    return getLLMReplyFromClaude(session, systemPrompt, messages);
  }
  return getLLMReplyFromOpenAI(session, systemPrompt, messages);
}

async function getLLMReplyFromClaude(
  session: InterviewSession,
  systemPrompt: string,
  history: { role: "assistant" | "user"; content: string }[]
): Promise<string> {
  const ai = getClaudeClient();
  const model = process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-20241022";

  try {
    const response = await ai.messages.create({
      model,
      max_tokens: LLM_CONFIG.max_tokens,
      temperature: LLM_CONFIG.temperature,
      stop_sequences: ["\n\n", "Human:", "User:"],
      system: systemPrompt,
      messages: history,
    });

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    usageLog.push({
      token: session.token,
      model,
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
      timestamp: Date.now(),
    });
    logEvent(session.token, "llm_usage", `prompt=${inputTokens} completion=${outputTokens}`);

    const block = response.content[0];
    const raw = block?.type === "text" ? block.text.trim() : "";
    const parsed = parseLLMOutput(raw);
    if (!isReplyDuplicate(parsed, session.history)) {
      return parsed;
    }
    // duplicate — caller falls back to curated questions
    return "";
  } catch (err: any) {
    console.error("[Claude REQUEST FAILED]", {
      status: err?.status,
      message: err?.message,
      code: err?.error?.type,
    });
    throw err;
  }
}

async function getLLMReplyFromOpenAI(
  session: InterviewSession,
  systemPrompt: string,
  history: { role: "assistant" | "user"; content: string }[]
): Promise<string> {
  const ai = getOpenAIClient();
  const model = process.env.OPENAI_MODEL ?? (getProvider() === "groq" ? "llama-3.3-70b-versatile" : "gpt-4o");

  try {
    const response = await ai.chat.completions.create({
      model,
      max_tokens: LLM_CONFIG.max_tokens,
      temperature: LLM_CONFIG.temperature,
      frequency_penalty: LLM_CONFIG.frequency_penalty,
      presence_penalty: LLM_CONFIG.presence_penalty,
      stop: [...LLM_CONFIG.stop],
      messages: [{ role: "system", content: systemPrompt }, ...history],
    });

    if (response.usage) {
      usageLog.push({
        token: session.token,
        model,
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
        timestamp: Date.now(),
      });
      logEvent(session.token, "llm_usage", `prompt=${response.usage.prompt_tokens} completion=${response.usage.completion_tokens}`);
    }

    for (let i = 0; i < 2; i++) {
      const parsed = parseLLMOutput(
        response.choices[0]?.message?.content?.trim() ?? ""
      );

      if (!isReplyDuplicate(parsed, session.history)) {
        return parsed;
      }
    }

    return "";
  } catch (err: any) {
    console.error("[OpenAI REQUEST FAILED]", {
      status: err?.status,
      message: err?.message,
      code: err?.code,
      type: err?.type,
      headers: err?.headers,
      cause: err?.cause?.message ?? err?.cause,
    });
    throw err;
  }
}


