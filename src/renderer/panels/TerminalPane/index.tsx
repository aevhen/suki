import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface TermTab {
  id: string;
  label: string;
  terminal: Terminal | null;
  fitAddon: FitAddon | null;
}

interface Props {
  isVisible?: boolean;
}

const theme = {
  background: '#0a0812',
  foreground: '#e8e4ff',
  cursor: '#7c6ee0',
  cursorAccent: '#0a0812',
  black: '#0a0812',
  red: '#e05c5c',
  green: '#3dd68c',
  yellow: '#f0b429',
  blue: '#7c6ee0',
  magenta: '#a394f0',
  cyan: '#00c896',
  white: '#e8e4ff',
  brightBlack: '#5a5480',
  brightRed: '#e05c5c',
  brightGreen: '#3dd68c',
  brightYellow: '#f0b429',
  brightBlue: '#a394f0',
  brightMagenta: '#c4b8ff',
  brightCyan: '#4de8b8',
  brightWhite: '#ffffff',
};

export default function TerminalPane({ isVisible = true }: Props) {
  const [tabs, setTabs] = useState<TermTab[]>([]);
  const [activeTabId, setActiveTabId] = useState('');
  const [copied, setCopied] = useState(false);
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);

  const initialized = useRef(false);
  const tabsRef = useRef<TermTab[]>([]);
  const nextTabNumber = useRef(1);
  const terminalRefs = useRef(new Map<string, Terminal>());
  const fitAddonRefs = useRef(new Map<string, FitAddon>());
  const containerRefs = useRef(new Map<string, HTMLDivElement>());
  const observerRefs = useRef(new Map<string, ResizeObserver>());
  const spawnedSessionIds = useRef(new Set<string>());
  const initTimers = useRef(new Map<string, number>());

  const syncTabs = useCallback((updater: TermTab[] | ((prev: TermTab[]) => TermTab[])) => {
    setTabs(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      tabsRef.current = next;
      return next;
    });
  }, []);

  const fitTerminal = useCallback((id: string) => {
    const term = terminalRefs.current.get(id);
    const fitAddon = fitAddonRefs.current.get(id);
    if (!term || !fitAddon) return;

    try {
      fitAddon.fit();
      (window as any).suki?.resizeTerminal(id, term.cols, term.rows);
    } catch {
      // Hidden terminals briefly report zero dimensions while panels switch.
    }
  }, []);

  const createNewTab = useCallback(() => {
    const tabNumber = nextTabNumber.current;
    nextTabNumber.current += 1;

    const id = `terminal-${Date.now()}-${tabNumber}`;
    const tab: TermTab = {
      id,
      label: `Terminal ${tabNumber}`,
      terminal: null,
      fitAddon: null,
    };

    syncTabs(prev => [...prev, tab]);
    setActiveTabId(id);
  }, [syncTabs]);

  const closeTerminalTab = useCallback((id: string) => {
    const term = terminalRefs.current.get(id);
    const observer = observerRefs.current.get(id);
    const timer = initTimers.current.get(id);

    if (timer) window.clearTimeout(timer);
    initTimers.current.delete(id);
    observer?.disconnect();
    observerRefs.current.delete(id);
    terminalRefs.current.delete(id);
    fitAddonRefs.current.delete(id);
    containerRefs.current.delete(id);
    spawnedSessionIds.current.delete(id);
    term?.dispose();
    (window as any).suki?.killTerminal(id);

    syncTabs(prev => {
      const remaining = prev.filter(tab => tab.id !== id);
      setActiveTabId(current => {
        if (current !== id) return current;
        return remaining[remaining.length - 1]?.id ?? '';
      });
      return remaining;
    });
  }, [syncTabs]);

  const copyOutputToAI = useCallback(async () => {
    if (!activeTabId) return;
    const output = await (window as any).suki?.getTerminalOutput(activeTabId);
    if (!output) return;

    await navigator.clipboard.writeText(output);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1000);
  }, [activeTabId]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    createNewTab();
  }, [createNewTab]);

  useEffect(() => {
    const unsubscribe = (window as any).suki?.onTerminalData?.((data: { id: string; output: string }) => {
      terminalRefs.current.get(data.id)?.write(data.output);
    });

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    for (const tab of tabs) {
      if (terminalRefs.current.has(tab.id)) continue;

      const container = containerRefs.current.get(tab.id);
      if (!container) continue;

      const term = new Terminal({
        theme,
        fontFamily: 'JetBrains Mono, Fira Code, Cascadia Code, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: true,
        cursorStyle: 'block',
        scrollback: 5000,
      });
      const fitAddon = new FitAddon();

      term.loadAddon(fitAddon);
      term.open(container);
      terminalRefs.current.set(tab.id, term);
      fitAddonRefs.current.set(tab.id, fitAddon);

      term.onData(data => {
        (window as any).suki?.writeTerminal(tab.id, data);
      });

      const timer = window.setTimeout(() => {
        fitTerminal(tab.id);

        if (!spawnedSessionIds.current.has(tab.id)) {
          spawnedSessionIds.current.add(tab.id);
          (window as any).suki?.spawnTerminal(tab.id);
          (window as any).suki?.resizeTerminal(tab.id, term.cols, term.rows);
        }

        if (!observerRefs.current.has(tab.id)) {
          const observer = new ResizeObserver(() => {
            window.setTimeout(() => fitTerminal(tab.id), 50);
          });
          observer.observe(container);
          observerRefs.current.set(tab.id, observer);
        }

        initTimers.current.delete(tab.id);
      }, 100);
      initTimers.current.set(tab.id, timer);

      syncTabs(prev => prev.map(item => (
        item.id === tab.id ? { ...item, terminal: term, fitAddon } : item
      )));
    }
  }, [fitTerminal, syncTabs, tabs]);

  useEffect(() => {
    const tab = tabs.find(item => item.id === activeTabId);
    if (!isVisible || !tab?.fitAddon) return;

    window.setTimeout(() => {
      tab.fitAddon?.fit();
      const term = terminalRefs.current.get(activeTabId);
      if (term) (window as any).suki?.resizeTerminal(activeTabId, term.cols, term.rows);
    }, 50);
  }, [activeTabId, isVisible, tabs]);

  useEffect(() => {
    return () => {
      for (const timer of initTimers.current.values()) window.clearTimeout(timer);
      for (const observer of observerRefs.current.values()) observer.disconnect();
      for (const term of terminalRefs.current.values()) term.dispose();
      for (const id of spawnedSessionIds.current) (window as any).suki?.killTerminal(id);
      initTimers.current.clear();
      observerRefs.current.clear();
      terminalRefs.current.clear();
      fitAddonRefs.current.clear();
      containerRefs.current.clear();
      spawnedSessionIds.current.clear();
    };
  }, []);

  return (
    <div
      className="animate-fade-in-up"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: '#0a0812',
        color: '#e8e4ff',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '36px',
          minHeight: '36px',
          maxHeight: '36px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'flex-end',
          background: '#0a0812',
          borderBottom: '1px solid #2d2850',
          paddingLeft: 8,
          gap: 2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', minWidth: 0, flex: 1 }}>
          {tabs.map(tab => {
            const isActive = activeTabId === tab.id;
            const isHovered = hoveredTabId === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                onMouseEnter={() => setHoveredTabId(tab.id)}
                onMouseLeave={() => setHoveredTabId(null)}
                style={{
                  height: 32,
                  padding: '0 12px 0 16px',
                  minWidth: 124,
                  maxWidth: 180,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  background: isActive ? '#1a1730' : isHovered ? '#110f1e' : 'transparent',
                  color: isActive ? '#e8e4ff' : isHovered ? '#e8e4ff' : '#9890c0',
                  borderBottom: isActive ? '1px solid #1a1730' : '1px solid #2d2850',
                  borderRadius: '8px 8px 0 0',
                  fontSize: 12,
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                  marginBottom: -1,
                }}
                title={tab.label}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tab.label}
                </span>
                <span
                  onClick={event => {
                    event.stopPropagation();
                    closeTerminalTab(tab.id);
                  }}
                  style={{
                    width: 14,
                    height: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isHovered ? '#e05c5c' : 'transparent',
                    fontSize: 14,
                    lineHeight: '14px',
                    transition: 'color 0.15s ease',
                  }}
                >
                  ×
                </span>
              </button>
            );
          })}
          <button
            onClick={createNewTab}
            onMouseEnter={() => setHoveredButton('new')}
            onMouseLeave={() => setHoveredButton(null)}
            style={{
              width: 36,
              height: 32,
              flexShrink: 0,
              color: hoveredButton === 'new' ? '#7c6ee0' : '#5a5480',
              background: 'transparent',
              fontSize: 18,
              transition: 'all 0.15s ease',
              borderRadius: '8px 8px 0 0',
            }}
            title="New terminal"
          >
            +
          </button>
        </div>

        <button
          onClick={copyOutputToAI}
          disabled={!activeTabId}
          onMouseEnter={() => setHoveredButton('ai')}
          onMouseLeave={() => setHoveredButton(null)}
          style={{
            height: 36,
            padding: '0 14px',
            color: copied ? '#3dd68c' : hoveredButton === 'ai' ? '#7c6ee0' : '#5a5480',
            background: hoveredButton === 'ai' ? '#110f1e' : 'transparent',
            fontSize: 12,
            transition: 'all 0.15s ease',
            borderRadius: 0,
            opacity: activeTabId ? 1 : 0.4,
          }}
        >
          {copied ? 'Copied!' : '→ AI'}
        </button>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          overflow: 'hidden',
          background: '#0a0812',
        }}
      >
        {tabs.map(tab => (
          <div
            key={tab.id}
            id={`terminal-container-${tab.id}`}
            ref={node => {
              if (node) containerRefs.current.set(tab.id, node);
              else containerRefs.current.delete(tab.id);
            }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: activeTabId === tab.id ? 'block' : 'none',
              padding: '4px 0 0 4px',
              background: '#0a0812',
            }}
          />
        ))}
      </div>
    </div>
  );
}
