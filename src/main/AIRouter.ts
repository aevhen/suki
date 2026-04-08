import { loadKeys } from './KeysService';
import { sqliteManager } from './SQLiteManager';

export type TaskType = 'vision' | 'coding' | 'reasoning' | 'embedding' | 'edge' | 'general';
export type ProviderKey = 'primary' | 'groq' | 'gemini' | 'mistral' | 'openrouter' | 'cloudflare';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

const PROVIDERS: Record<ProviderKey, { url: string; model: string; limitPerDay: number }> = {
  primary:    { url: 'http://localhost:11434/v1',                                          model: 'gemma4:e4b',                     limitPerDay: 999999 },
  groq:       { url: 'https://api.groq.com/openai/v1',                                   model: 'llama-3.3-70b-versatile',        limitPerDay: 500000 },
  gemini:     { url: 'https://generativelanguage.googleapis.com/v1beta/openai/',          model: 'gemini-2.5-flash',               limitPerDay: 250 },
  mistral:    { url: 'https://api.mistral.ai/v1',                                         model: 'codestral-latest',               limitPerDay: 999999 },
  openrouter: { url: 'https://openrouter.ai/api/v1',                                     model: 'deepseek/deepseek-r1:free',      limitPerDay: 200 },
  cloudflare: { url: 'https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/v1',   model: '@cf/meta/llama-3.1-8b-instruct', limitPerDay: 10000 },
};

const FALLBACK_CHAINS: Record<TaskType, ProviderKey[]> = {
  vision:    ['primary', 'gemini', 'openrouter'],
  coding:    ['primary', 'groq', 'mistral'],
  reasoning: ['primary', 'openrouter', 'groq'],
  embedding: ['primary'],
  edge:      ['cloudflare', 'primary'],
  general:   ['primary', 'groq', 'gemini'],
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
  messages: Message[],
  images?: string[],
  stream = true
): Promise<Response> {
  const keys = loadKeys();
  const config = { ...PROVIDERS[provider] };

  if (provider === 'cloudflare') {
    config.url = config.url.replace('ACCOUNT_ID', keys.cloudflareAccountId ?? '');
  }

  const apiKey = getApiKey(keys, provider);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };

  const formattedMessages = messages.map(m => {
    if (images && images.length > 0 && m.role === 'user') {
      return {
        role: m.role,
        content: [
          ...images.map(img => ({ type: 'image_url', image_url: { url: img.startsWith('data:') ? img : `data:image/png;base64,${img}` } })),
          { type: 'text', text: typeof m.content === 'string' ? m.content : '' },
        ],
      };
    }
    return m;
  });

  return fetch(`${config.url}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: config.model, messages: formattedMessages, stream }),
  });
}

export async function query(
  type: TaskType,
  messages: Message[],
  images?: string[]
): Promise<string> {
  const chain = FALLBACK_CHAINS[type];
  for (const provider of chain) {
    try {
      const quota = sqliteManager.getQuota(provider);
      if (quota && quota.tokens_today >= PROVIDERS[provider].limitPerDay) continue;

      const res = await callProvider(provider, messages, images, false);
      if (!res.ok) continue;

      const data = await res.json() as { choices: Array<{ message: { content: string } }> };
      const content = data.choices?.[0]?.message?.content ?? '';
      sqliteManager.incrementQuota(provider, content.length);
      return content;
    } catch {
      continue;
    }
  }
  throw new Error('All providers failed or quota exceeded');
}

export async function queryAll(
  type: TaskType,
  messages: Message[],
  providers: ProviderKey[]
): Promise<string[]> {
  const results = await Promise.allSettled(
    providers.map(p => query(type, messages))
  );
  return results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
    .map(r => r.value);
}

export async function judge(task: string, implementations: string[]): Promise<string> {
  const prompt = `You are a senior engineer reviewing ${implementations.length} implementations of the same task.
Task: ${task}
${implementations.map((impl, i) => `--- Implementation ${i + 1} ---\n${impl}`).join('\n\n')}
Select the best implementation or merge the strongest parts. Output only the final code, no explanation.`;
  return query('reasoning', [{ role: 'user', content: prompt }]);
}
