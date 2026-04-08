import React, { useState } from 'react';

interface Props { onComplete: () => void; }

const PROVIDERS = [
  { key: 'groq', label: 'Groq API Key', url: 'https://console.groq.com', hint: 'Free, no credit card' },
  { key: 'gemini', label: 'Google Gemini API Key', url: 'https://aistudio.google.com', hint: 'Free' },
  { key: 'mistral', label: 'Mistral API Key', url: 'https://console.mistral.ai', hint: 'Free Experiment tier' },
  { key: 'openrouter', label: 'OpenRouter API Key', url: 'https://openrouter.ai/keys', hint: 'Free models available' },
  { key: 'cloudflareAccountId', label: 'Cloudflare Account ID', url: 'https://dash.cloudflare.com', hint: 'Free' },
  { key: 'cloudflareToken', label: 'Cloudflare API Token', url: 'https://dash.cloudflare.com', hint: 'Free' },
  { key: 'cohere', label: 'Cohere API Key', url: 'https://dashboard.cohere.com', hint: 'Free tier' },
];

export default function SetupScreen({ onComplete }: Props) {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await (window as any).suki.saveKeys(keys);
    onComplete();
  };

  return (
    <div style={{ height: '100vh', background: '#0a0812', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#110f1e', border: '1px solid #2d2850', borderRadius: 8, padding: 24 }}>
        <h1 style={{ color: '#7c6ee0', fontSize: 28, fontWeight: 600, marginBottom: 8 }}>Welcome to Suki</h1>
        <p style={{ color: '#9890c0', marginBottom: 32, fontSize: 14 }}>
          Enter your API keys to enable cloud AI fallbacks. All keys are encrypted locally. All fields are optional. Ollama runs locally with no key needed.
        </p>

        {PROVIDERS.map(p => (
          <div key={p.key} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <label style={{ color: '#e8e4ff', fontSize: 13 }}>{p.label}</label>
              <a href={p.url} target="_blank" rel="noreferrer" style={{ color: '#a394f0', fontSize: 12 }}>{p.hint} -&gt;</a>
            </div>
            <input
              type="password"
              placeholder="Paste key here..."
              value={keys[p.key] ?? ''}
              onChange={e => setKeys(prev => ({ ...prev, [p.key]: e.target.value }))}
              style={{
                width: '100%', padding: '8px 12px', background: '#1a1730',
                border: '1px solid #2d2850', borderRadius: 6, color: '#e8e4ff',
                fontSize: 13, outline: 'none',
              }}
            />
          </div>
        ))}

        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button
            onClick={save}
            disabled={saving}
            style={{ flex: 1, padding: '10px 0', background: '#7c6ee0', color: '#ffffff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
          >
            {saving ? 'Saving...' : 'Save & Launch'}
          </button>
          <button
            onClick={onComplete}
            style={{ padding: '10px 20px', background: 'transparent', color: '#9890c0', border: '1px solid #2d2850', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
