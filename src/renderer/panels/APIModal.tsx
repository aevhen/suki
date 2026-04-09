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
] as const;

export default function APIModal({ onClose }: Props) {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [originalKeys, setOriginalKeys] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    background: '#1a1730',
    border: '1px solid #2d2850',
    borderRadius: 6,
    color: '#e8e4ff',
    fontSize: 13,
    outline: 'none',
    transition: 'all 0.15s ease',
    boxSizing: 'border-box',
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const load = async () => {
      try {
        const existing = await (window as any).suki?.getKeys?.() ?? {};
        setKeys(existing);
        setOriginalKeys(existing);
      } catch {
        setKeys({});
        setOriginalKeys({});
      } finally {
        setLoading(false);
      }
    };

    void load();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const suki = (window as any).suki;
      if (!suki) throw new Error('Suki API not available');

      const existing = await suki.getKeys?.() ?? {};
      const merged: Record<string, string> = { ...existing };

      for (const [key, value] of Object.entries(keys)) {
        const trimmed = String(value ?? '').trim();
        if (trimmed.length > 0) {
          merged[key] = trimmed;
        } else if (key in merged && originalKeys[key]) {
          delete merged[key];
        }
      }

      const result = await suki.saveKeys(merged);
      console.log('[APIModal] saveKeys result:', result);

      if (!result?.success) {
        throw new Error(result?.error ?? 'Unknown save error');
      }

      setOriginalKeys(merged);
      setKeys(merged);
      setSaveStatus('success');
      setTimeout(() => {
        setSaveStatus('idle');
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Failed to save keys:', err);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
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
        <p style={{ color: '#9890c0', marginBottom: 24, fontSize: 14 }}>
          Add cloud AI fallback keys. All keys are encrypted locally.
        </p>

        {loading ? (
          <div style={{ color: '#5a5480', fontSize: 13, marginBottom: 12 }}>Loading saved keys...</div>
        ) : null}

        {PROVIDERS.map(provider => {
          const hasSavedValue = Boolean(originalKeys[provider.key]);
          return (
            <div key={provider.key} className="api-modal-field" style={{ marginBottom: 16, borderRadius: 6, transition: 'background 0.15s ease' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                <label style={{ color: '#e8e4ff', fontSize: 13 }}>{provider.label}</label>
                <a className="api-modal-link" href={provider.url} target="_blank" rel="noreferrer" style={{ color: '#a394f0', fontSize: 12 }}>
                  {provider.hint} -&gt;
                </a>
              </div>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type="password"
                    placeholder={hasSavedValue ? '••••••••••• (click to change)' : 'Paste key here...'}
                    value={keys[provider.key] ?? ''}
                    onChange={event => setKeys(prev => ({ ...prev, [provider.key]: event.target.value }))}
                    style={{
                      ...inputStyle,
                      borderColor: hasSavedValue ? '#3dd68c44' : '#2d2850',
                    }}
                  />
                  {hasSavedValue ? (
                    <span
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: 10,
                        color: '#3dd68c',
                      }}
                    >
                      ✓
                    </span>
                  ) : null}
                </div>

                {hasSavedValue ? (
                  <button
                    onClick={() => setKeys(prev => ({ ...prev, [provider.key]: '' }))}
                    title="Clear this key"
                    style={{ background: 'transparent', border: '1px solid #2d2850', borderRadius: 4, color: '#5a5480', cursor: 'pointer', padding: '4px 8px', fontSize: 11, flexShrink: 0 }}
                    onMouseEnter={event => { event.currentTarget.style.color = '#e05c5c'; }}
                    onMouseLeave={event => { event.currentTarget.style.color = '#5a5480'; }}
                  >
                    x
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}

        <button
          onClick={save}
          disabled={saving || loading}
          style={{
            width: '100%',
            marginTop: 8,
            padding: '10px 0',
            background: saveStatus === 'success' ? '#3dd68c' : saveStatus === 'error' ? '#e05c5c' : '#7c6ee0',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            cursor: saving || loading ? 'wait' : 'pointer',
            fontSize: 14,
            transition: 'background 0.2s ease',
          }}
        >
          {saving ? 'Saving...' : saveStatus === 'success' ? 'Saved!' : saveStatus === 'error' ? 'Error' : 'Save & Close'}
        </button>
      </div>
    </div>
  );
}
