import { loadKeys } from './KeysService';
import { sqliteManager } from './SQLiteManager';
import { EventEmitter } from 'events';

export type TaskType = 'vision' | 'coding' | 'reasoning' | 'embedding' | 'edge' | 'general';
export type ProviderKey = 'primary' | 'groq' | 'gemini' | 'mistral' | 'openrouter' | 'cloudflare';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

interface ProviderConfig {
  url: string;
  model: string;
  limitPerDay: number;
  strengths: TaskType[];
}

export const routerEvents = new EventEmitter();

const PROVIDERS: Record<ProviderKey, ProviderConfig> = {
  primary: {
    url: 'http://localhost:11434/v1',
    model: 'gemma4:e4b',
    limitPerDay: 999999,
    strengths: ['vision', 'general', 'coding', 'reasoning'],
  },
  groq: {
    url: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    limitPerDay: 500000,
    strengths: ['coding', 'general', 'reasoning'],
  },
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-2.5-flash',
    limitPerDay: 250,
    strengths: ['vision', 'reasoning', 'general'],
  },
  mistral: {
    url: 'https://api.mistral.ai/v1',
    model: 'codestral-latest',
    limitPerDay: 999999,
    strengths: ['coding'],
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1',
    model: 'deepseek/deepseek-r1:free',
    limitPerDay: 200,
    strengths: ['reasoning'],
  },
  cloudflare: {
    url: 'https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/v1',
    model: '@cf/meta/llama-3.1-8b-instruct',
    limitPerDay: 10000,
    strengths: ['edge', 'general'],
  },
};

const PARALLEL_AGENTS: Record<TaskType, ProviderKey[]> = {
  vision: ['primary', 'gemini'],
  coding: ['primary', 'groq', 'mistral'],
  reasoning: ['primary', 'groq', 'gemini', 'openrouter'],
  embedding: ['primary'],
  edge: ['primary', 'cloudflare'],
  general: ['primary', 'groq', 'gemini'],
};

function getApiKey(keys: Record<string, string>, provider: ProviderKey): string {
  const map: Record<ProviderKey, string> = {
    primary: '',
    groq: keys.groq ?? '',
    gemini: keys.gemini ?? '',
    mistral: keys.mistral ?? '',
    openrouter: keys.openrouter ?? '',
    cloudflare: keys.cloudflareToken ?? '',
  };
  return map[provider];
}

async function callProvider(
  provider: ProviderKey,
  taskType: TaskType,
  messages: Message[],
  images?: string[]
): Promise<{ provider: ProviderKey; content: string; latencyMs: number } | null> {
  const keys = loadKeys();
  const config = { ...PROVIDERS[provider] };

  const quota = sqliteManager.getQuota(provider);
  if (quota && quota.tokens_today >= config.limitPerDay) return null;

  const apiKey = getApiKey(keys, provider);
  if (provider !== 'primary' && !apiKey) return null;

  if (provider === 'cloudflare') {
    config.url = config.url.replace('ACCOUNT_ID', keys.cloudflareAccountId ?? '');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };

  const formattedMessages = messages.map(message => {
    if (images && images.length > 0 && message.role === 'user') {
      return {
        role: message.role,
        content: [
          ...images.map(image => ({
            type: 'image_url',
            image_url: { url: image.startsWith('data:') ? image : `data:image/png;base64,${image}` },
          })),
          { type: 'text', text: typeof message.content === 'string' ? message.content : '' },
        ],
      };
    }
    return message;
  });

  const startTime = Date.now();
  routerEvents.emit('provider:start', { provider, taskType });

  try {
    const res = await fetch(`${config.url}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: formattedMessages,
        stream: false,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) return null;

    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices?.[0]?.message?.content ?? '';
    if (!content) return null;

    const latencyMs = Date.now() - startTime;
    sqliteManager.incrementQuota(provider, content.length);
    routerEvents.emit('provider:done', { provider, latencyMs, success: true });

    return { provider, content, latencyMs };
  } catch {
    routerEvents.emit('provider:done', { provider, latencyMs: Date.now() - startTime, success: false });
    return null;
  }
}

async function judgeResponses(
  results: Array<{ provider: ProviderKey; content: string; latencyMs: number }>,
  taskType: TaskType,
  originalPrompt: string
): Promise<string> {
  if (results.length === 1) {
    routerEvents.emit('provider:winner', { provider: results[0].provider });
    return results[0].content;
  }

  if (taskType === 'edge' || taskType === 'embedding') {
    const selected = [...results].sort((a, b) => a.latencyMs - b.latencyMs)[0];
    routerEvents.emit('provider:winner', { provider: selected.provider });
    return selected.content;
  }

  const judgePrompt = `You are evaluating ${results.length} AI responses to select the best one.

Original request (last user message): ${originalPrompt.slice(0, 500)}

${results.map((result, index) => `--- Response ${index + 1} (from ${result.provider}, ${result.latencyMs}ms) ---\n${result.content.slice(0, 1000)}`).join('\n\n')}

Reply with ONLY a number (1, 2, ${results.length > 2 ? '3, ' : ''}etc.) indicating which response is most accurate, complete, and helpful. Nothing else.`;

  try {
    const judgeResult = await callProvider('primary', taskType, [{ role: 'user', content: judgePrompt }]);
    if (judgeResult) {
      const num = parseInt(judgeResult.content.trim(), 10);
      if (!Number.isNaN(num) && num >= 1 && num <= results.length) {
        const selected = results[num - 1];
        routerEvents.emit('provider:winner', { provider: selected.provider });
        return selected.content;
      }
    }
  } catch {
    // Fall through to heuristic fallback.
  }

  const selected = [...results].sort((a, b) => b.content.length - a.content.length)[0];
  routerEvents.emit('provider:winner', { provider: selected.provider });
  return selected.content;
}

export async function query(
  type: TaskType,
  messages: Message[],
  images?: string[]
): Promise<string> {
  const agents = PARALLEL_AGENTS[type];
  const lastUserMessage = [...messages].reverse().find(message => message.role === 'user');
  const promptText = typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '';

  const promises = agents.map(provider => callProvider(provider, type, messages, images));
  const settled = await Promise.allSettled(promises);

  const results = settled
    .filter((result): result is PromiseFulfilledResult<{ provider: ProviderKey; content: string; latencyMs: number }> => (
      result.status === 'fulfilled' && result.value !== null
    ))
    .map(result => result.value);

  if (results.length === 0) {
    const fallback = await callProvider('primary', type, messages, images);
    if (fallback) return fallback.content;
    throw new Error('All AI providers failed or have no API keys configured');
  }

  return judgeResponses(results, type, promptText);
}

export async function queryAll(
  type: TaskType,
  messages: Message[],
  providers: ProviderKey[]
): Promise<string[]> {
  const fallbackProviders = providers.length > 0 ? providers : PARALLEL_AGENTS[type];
  const results = await Promise.allSettled(
    fallbackProviders.map(provider => callProvider(provider, type, messages))
  );

  return results
    .filter((result): result is PromiseFulfilledResult<{ provider: ProviderKey; content: string; latencyMs: number }> => (
      result.status === 'fulfilled' && result.value !== null
    ))
    .map(result => result.value.content);
}

export async function judge(task: string, implementations: string[]): Promise<string> {
  const prompt = `You are a senior engineer reviewing ${implementations.length} implementations of the same task.
Task: ${task}
${implementations.map((implementation, index) => `--- Implementation ${index + 1} ---\n${implementation}`).join('\n\n')}
Select the best implementation or merge the strongest parts. Output only the final code, no explanation.`;
  return query('reasoning', [{ role: 'user', content: prompt }]);
}
