import React, { useEffect, useState } from 'react';
import { useTabs } from '../../hooks/useTabs';

export default function NavBar() {
  const { tabs, activeTabId, navigate } = useTabs();
  const activeTab = tabs.find(t => t.id === activeTabId);
  const [inputValue, setInputValue] = useState(activeTab?.url ?? '');

  useEffect(() => {
    setInputValue(activeTab?.url ?? '');
  }, [activeTab?.url, activeTabId]);

  const handleNavigate = () => {
    let url = inputValue.trim();
    if (!url) return;

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (url.includes('.') && !url.includes(' ')) {
        url = `https://${url}`;
      } else {
        url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
      }
    }

    navigate(url);
    setInputValue(url);
  };

  const controlButtonStyle: React.CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: 6,
    color: activeTabId ? '#9890c0' : '#5a5480',
    background: 'transparent',
    fontSize: 13,
    transition: 'all 0.15s ease',
    cursor: activeTabId ? 'pointer' : 'default',
  };

  return (
    <div style={{ height: 44, flex: 1, background: '#0a0812', borderBottom: '1px solid #2d2850', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          aria-label="Go back"
          disabled={!activeTabId}
          onClick={() => activeTabId && (window as any).suki.goBack(activeTabId)}
          style={controlButtonStyle}
          onMouseEnter={event => { if (activeTabId) event.currentTarget.style.background = '#110f1e'; }}
          onMouseLeave={event => { event.currentTarget.style.background = 'transparent'; }}
        >
          {'<'}
        </button>
        <button
          aria-label="Go forward"
          disabled={!activeTabId}
          onClick={() => activeTabId && (window as any).suki.goForward(activeTabId)}
          style={controlButtonStyle}
          onMouseEnter={event => { if (activeTabId) event.currentTarget.style.background = '#110f1e'; }}
          onMouseLeave={event => { event.currentTarget.style.background = 'transparent'; }}
        >
          {'>'}
        </button>
        <button
          aria-label="Reload"
          disabled={!activeTabId}
          onClick={() => activeTabId && (window as any).suki.reload(activeTabId)}
          style={controlButtonStyle}
          onMouseEnter={event => { if (activeTabId) event.currentTarget.style.background = '#110f1e'; }}
          onMouseLeave={event => { event.currentTarget.style.background = 'transparent'; }}
        >
          R
        </button>
      </div>
      <input
        placeholder="Search or enter URL"
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') handleNavigate();
        }}
        onFocus={e => e.target.select()}
        onBlur={() => setInputValue(activeTab?.url ?? '')}
        style={{ width: '100%', height: 28, background: '#110f1e', color: '#e8e4ff', border: '1px solid #2d2850', borderRadius: 6, padding: '0 10px', outline: 'none', fontSize: 13 }}
      />
    </div>
  );
}
