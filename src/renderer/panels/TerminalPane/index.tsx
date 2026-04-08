import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

type ShellValue = 'powershell' | 'cmd' | 'wsl';

interface TermTab {
  id: string;
  label: string;
  shellType: ShellValue;
  color: string;
}

interface Props {
  isVisible?: boolean;
}

const SHELLS = [
  { value: 'powershell', label: 'PowerShell', color: '#7c6ee0' },
  { value: 'cmd', label: 'CMD', color: '#f0b429' },
  { value: 'wsl', label: 'WSL', color: '#3dd68c' },
] as const;

const theme = {
  background: '#0a0812',
  foreground: '#e8e4ff',
  cursor: '#7c6ee0',
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
  const [selectedShell, setSelectedShell] = useState<ShellValue>('powershell');
  const [copied, setCopied] = useState(false);
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const initialized = useRef(false);
  const tabsRef = useRef<TermTab[]>([]);
  const terminalRefs = useRef<Record<string, { terminal: Terminal; fitAddon: FitAddon; unsub?: () => void }>>({});
  const initTimers = useRef<Record<string, number>>({});

  const syncTabs = (next: TermTab[] | ((prev: TermTab[]) => TermTab[])) => {
    setTabs(prev => {
      const value = typeof next === 'function' ? next(prev) : next;
      tabsRef.current = value;
      return value;
    });
  };

  const updateWSLLabel = (id: string, output: string) => {
    const distro = output
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(line => line && !line.includes('echo $WSL_DISTRO_NAME') && !line.includes('PS '));
    if (!distro) return;

    syncTabs(prev => prev.map(tab => {
      if (tab.id !== id || tab.shellType !== 'wsl') return tab;
      const index = prev.findIndex(candidate => candidate.id === id) + 1;
      return { ...tab, label: `${distro} ${index}` };
    }));
  };

  const initTerminal = (id: string, shellType: string) => {
    const container = document.getElementById(`terminal-container-${id}`);
    if (!container || terminalRefs.current[id]) return;

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

    const unsub = (window as any).suki.onTerminalData((data: { id: string; output: string }) => {
      if (data.id !== id) return;
      term.write(data.output);
      if (shellType === 'wsl') updateWSLLabel(id, data.output);
    });

    setTimeout(() => {
      fitAddon.fit();
      (window as any).suki.spawnTerminal(id, shellType);
      (window as any).suki.resizeTerminal(id, term.cols, term.rows);
      if (shellType === 'wsl') {
        setTimeout(() => {
          (window as any).suki.writeTerminal(id, 'echo $WSL_DISTRO_NAME\r');
        }, 500);
      }
    }, 100);

    term.onData(data => {
      (window as any).suki.writeTerminal(id, data);
    });

    terminalRefs.current[id] = { terminal: term, fitAddon, unsub };
  };

  const createNewTab = (shellType: ShellValue = selectedShell) => {
    if (initialized.current && tabsRef.current.length === 0) return;

    const id = `terminal-${Date.now()}`;
    const shellInfo = SHELLS.find(shell => shell.value === shellType) ?? SHELLS[0];
    const label = `${shellInfo.label} ${tabsRef.current.length + 1}`;

    syncTabs(prev => [...prev, { id, label, shellType, color: shellInfo.color }]);
    setActiveTabId(id);

    initTimers.current[id] = window.setTimeout(() => {
      initTerminal(id, shellType);
      delete initTimers.current[id];
    }, 50);
  };

  const closeTab = (id: string) => {
    const ref = terminalRefs.current[id];
    if (initTimers.current[id]) {
      window.clearTimeout(initTimers.current[id]);
      delete initTimers.current[id];
    }
    ref?.unsub?.();
    ref?.terminal.dispose();
    delete terminalRefs.current[id];
    (window as any).suki.killTerminal(id);

    syncTabs(prev => {
      const next = prev.filter(tab => tab.id !== id);
      if (activeTabId === id) {
        setActiveTabId(next[next.length - 1]?.id ?? '');
      }
      return next;
    });
  };

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    createNewTab('powershell');
  }, []);

  useEffect(() => {
    if (!isVisible || !activeTabId) return;
    const ref = terminalRefs.current[activeTabId];
    if (!ref) return;
    setTimeout(() => {
      ref.fitAddon.fit();
      (window as any).suki.resizeTerminal(activeTabId, ref.terminal.cols, ref.terminal.rows);
    }, 50);
  }, [activeTabId, isVisible, tabs]);

  useEffect(() => () => {
    Object.values(initTimers.current).forEach(timer => window.clearTimeout(timer));
    Object.entries(terminalRefs.current).forEach(([id, ref]) => {
      ref.unsub?.();
      ref.terminal.dispose();
      (window as any).suki.killTerminal(id);
    });
  }, []);

  const copyOutput = async () => {
    if (!activeTabId) return;
    const output = await (window as any).suki.getTerminalOutput(activeTabId);
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1000);
  };

  return (
    <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: '#0a0812', overflow: 'hidden' }}>
      <div style={{ height: '36px', minHeight: '36px', maxHeight: '36px', flexShrink: 0, display: 'flex', alignItems: 'flex-end', background: '#0a0812', borderBottom: '1px solid #2d2850', paddingLeft: 8, gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', minWidth: 0 }}>
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
                  padding: '0 12px',
                  minWidth: 124,
                  maxWidth: 190,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: isActive ? '#1a1730' : isHovered ? '#110f1e' : 'transparent',
                  color: isActive ? '#e8e4ff' : '#9890c0',
                  borderBottom: isActive ? '1px solid #1a1730' : '1px solid #2d2850',
                  borderRadius: '8px 8px 0 0',
                  fontSize: 12,
                  transition: 'all 0.15s ease',
                  marginBottom: -1,
                }}
              >
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: tab.color, flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{tab.label}</span>
                <span
                  onClick={event => {
                    event.stopPropagation();
                    closeTab(tab.id);
                  }}
                  style={{ marginLeft: 'auto', color: isHovered ? '#e05c5c' : 'transparent', fontSize: 14, transition: 'color 0.15s ease' }}
                >
                  x
                </span>
              </button>
            );
          })}
        </div>

        <select
          value={selectedShell}
          onChange={event => setSelectedShell(event.target.value as ShellValue)}
          style={{
            marginLeft: 'auto',
            marginRight: 4,
            background: '#110f1e',
            border: '1px solid #2d2850',
            borderRadius: 4,
            color: '#9890c0',
            fontSize: 11,
            padding: '2px 6px',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {SHELLS.map(shell => (
            <option key={shell.value} value={shell.value}>{shell.label}</option>
          ))}
        </select>

        <button onClick={() => createNewTab(selectedShell)} style={{ width: 36, height: 32, color: '#5a5480', fontSize: 18, transition: 'all 0.15s ease', borderRadius: '8px 8px 0 0' }}>
          +
        </button>

        <button onClick={() => { void copyOutput(); }} style={{ height: 36, padding: '0 14px', color: copied ? '#3dd68c' : '#5a5480', fontSize: 12, transition: 'all 0.15s ease' }}>
          {copied ? 'Copied!' : '→ AI'}
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', background: '#0a0812' }}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            id={`terminal-container-${tab.id}`}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: activeTabId === tab.id ? 'block' : 'none',
              padding: '4px 0 0 4px',
            }}
          />
        ))}
      </div>
    </div>
  );
}

