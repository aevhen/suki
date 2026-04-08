import React, { useEffect, useState } from 'react';

interface Props {
  onClose: () => void;
}

const PROVIDERS = [
  { key: 'groq', label: 'Groq API Key', url: 'https://console.groq.com', hint: 'Free, no credit card' },
  { key: 'gemini', label: 'Google Gemini API Key', url: 'https://aistudio.google.com', hint: 'Free' },
  { key: 'mistral', label: 'Mistral API Key', url: 'https://console.mistral.ai', hint: 'Free Experiment tier' },
  { key: 'openrouter', label: 'OpenRouter API Key', url: 'https://openrouter.ai/keys', hint: 'Free models available' },
  { key: 'cloudflareAccountId', label: 'Cloudflare Account ID', url: 'https://dash.cloudflare.com', hint: 'Free' },
  { key: 'cloudflareToken', label: 'Cloudflare API Token', url: 'https://dash.cloudflare.com', hint: 'Free' },
  { key: 'cohere', label: 'Cohere API Key', url: 'https://dashboard.cohere.com', hint: 'Free tier' },
];

export default function APIModal({ onClose }: Props) {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (window as any).suki?.hasKeys().then((has: boolean) => {
      if (has) setStatus('Keys saved');
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    await (window as any).suki.saveKeys(keys);
    setStatus('Saved!');
    setSaving(false);
    setTimeout(onClose, 2000);
  };

  return (
    <div
      className="animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="API keys"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10, 8, 18, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 100,
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        className="animate-scale-in"
        style={{
          width: '100%',
          maxWidth: 480,
          maxHeight: 'calc(100vh - 48px)',
          overflowY: 'auto',
          position: 'relative',
          background: '#110f1e',
          border: '1px solid #2d2850',
          borderRadius: 12,
          padding: 32,
          animation: 'scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <button
          className="api-modal-close"
          aria-label="Close API keys modal"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 28,
            height: 28,
            color: '#9890c0',
            borderRadius: 4,
            fontSize: 18,
            lineHeight: '28px',
            transition: 'all 0.15s ease',
          }}
        >
          x
        </button>

        <h1 style={{ color: '#e8e4ff', fontSize: 24, fontWeight: 600, marginBottom: 8 }}>API Keys</h1>
        <p style={{ color: '#9890c0', marginBottom: 10, fontSize: 14 }}>
          Add cloud AI fallback keys. All keys are encrypted locally.
        </p>
        {status && <p style={{ color: status === 'Saved!' ? '#3dd68c' : '#a394f0', marginBottom: 24, fontSize: 13 }}>{status}</p>}

        {PROVIDERS.map(p => (
          <div key={p.key} className="api-modal-field" style={{ marginBottom: 16, borderRadius: 6, transition: 'background 0.15s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
              <label style={{ color: '#e8e4ff', fontSize: 13 }}>{p.label}</label>
              <a className="api-modal-link" href={p.url} target="_blank" rel="noreferrer" style={{ color: '#a394f0', fontSize: 12 }}>{p.hint} -&gt;</a>
            </div>
            <input
              className="api-modal-input"
              type="password"
              placeholder="Paste key here..."
              value={keys[p.key] ?? ''}
              onChange={event => setKeys(prev => ({ ...prev, [p.key]: event.target.value }))}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#1a1730',
                border: '1px solid #2d2850',
                borderRadius: 6,
                color: '#e8e4ff',
                fontSize: 13,
                outline: 'none',
                transition: 'all 0.15s ease',
              }}
            />
          </div>
        ))}

        <button
          className="api-modal-save"
          onClick={save}
          disabled={saving}
          style={{
            width: '100%',
            marginTop: 8,
            padding: '10px 0',
            background: saving ? '#5548b0' : '#7c6ee0',
            color: '#ffffff',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            cursor: saving ? 'default' : 'pointer',
            fontSize: 14,
            transition: 'all 0.15s ease',
          }}
        >
          {saving ? 'Saving...' : 'Save Keys'}
        </button>
      </div>
    </div>
  );
}
