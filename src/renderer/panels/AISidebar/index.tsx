import React, { useMemo, useRef, useState } from 'react';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
};

type ContextToggles = {
  screenshot: boolean;
  dom: boolean;
  network: boolean;
  terminal: boolean;
  notes: boolean;
};

const CONTEXT_SOURCES: Array<{ key: keyof ContextToggles; label: string; title: string; tokens: number }> = [
  { key: 'screenshot', label: '\uD83D\uDCF7', title: 'Screenshot', tokens: 8 },
  { key: 'dom', label: '</>', title: 'DOM', tokens: 12 },
  { key: 'network', label: '\u301c', title: 'Network', tokens: 4 },
  { key: 'terminal', label: '>', title: 'Terminal', tokens: 2 },
  { key: 'notes', label: '\u2726', title: 'Notes', tokens: 3 },
];

export default function AISidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [thinkingMode, setThinkingMode] = useState(false);
  const [contextToggles, setContextToggles] = useState<ContextToggles>({
    screenshot: true,
    dom: false,
    network: false,
    terminal: false,
    notes: false,
  });
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [draggingFile, setDraggingFile] = useState(false);
  const [hoveredMessage, setHoveredMessage] = useState<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const tokenCount = useMemo(() => {
    const contextTokens = CONTEXT_SOURCES.reduce((sum, source) => sum + (contextToggles[source.key] ? source.tokens : 0), 0);
    const messageTokens = Math.ceil(messages.reduce((sum, msg) => sum + msg.content.length, 0) / 4 / 1000);
    const fileTokens = uploadedFiles.length * 2;
    return contextTokens + messageTokens + fileTokens;
  }, [contextToggles, messages, uploadedFiles]);

  const tokenFill = Math.min(100, (tokenCount / 128) * 100);
  const tokenColor = tokenCount < 80 ? '#7c6ee0' : tokenCount <= 110 ? '#f0b429' : '#e05c5c';

  const openSidebar = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setIsOpen(true);
  };

  const scheduleClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setIsOpen(false), 400);
  };

  const resizeTextarea = (value: string) => {
    setInput(value);
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.style.height = '40px';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    });
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: 'user', content: input.trim(), timestamp: Date.now() };
    const previousMessages = messages;
    setMessages(prev => [...prev, userMsg]);
    resizeTextarea('');
    setLoading(true);

    try {
      const contextParts: string[] = [];
      const images: string[] = [];

      if (contextToggles.screenshot) {
        const img = await (window as any).suki.screenshot();
        if (img) images.push(`data:image/png;base64,${img}`);
      }
      if (contextToggles.dom) {
        const dom = await (window as any).suki.getDOM();
        if (dom) contextParts.push(`Page HTML:\n${dom.slice(0, 8000)}`);
      }
      if (contextToggles.network) {
        const net = await (window as any).suki.getNetworkLog();
        if (net?.length) contextParts.push(`Network log:\n${JSON.stringify(net.slice(-10), null, 2)}`);
      }
      if (contextToggles.terminal) {
        const term = await (window as any).suki.getTerminalOutput?.('terminal-1');
        if (term) contextParts.push(`Terminal output:\n${term.slice(-2000)}`);
      }
      if (contextToggles.notes && uploadedFiles.length > 0) {
        contextParts.push(`Attached files:\n${uploadedFiles.map(file => file.name).join('\n')}`);
      }

      const systemPrompt = contextParts.length > 0
        ? `You are Suki, an AI assistant with access to the user's workspace context.\n\n${contextParts.join('\n\n')}`
        : 'You are Suki, an AI assistant.';

      const allMessages = [
        { role: 'system' as const, content: thinkingMode ? `${systemPrompt}\nThink carefully before answering.` : systemPrompt },
        ...previousMessages.map(msg => ({ role: msg.role, content: msg.content })),
        { role: userMsg.role, content: userMsg.content },
      ];

      const taskType = images.length > 0 ? 'vision' : 'general';
      const response = await (window as any).suki.query(taskType, allMessages, images.length > 0 ? images : undefined);
      setMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: Date.now() }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please check your API keys in Settings.', timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDraggingFile(false);
    setUploadedFiles(prev => [...prev, ...Array.from(event.dataTransfer.files)]);
  };

  return (
    <>
      <div
        onMouseEnter={openSidebar}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: 12,
          height: '100%',
          zIndex: 101,
          background: 'transparent',
        }}
      />
      <aside
        onMouseEnter={openSidebar}
        onMouseLeave={scheduleClose}
        onDragEnter={event => { event.preventDefault(); setDraggingFile(true); openSidebar(); }}
        onDragOver={event => event.preventDefault()}
        onDragLeave={() => setDraggingFile(false)}
        onDrop={handleDrop}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          height: '100%',
          width: 360,
          background: '#0e0c1a',
          borderLeft: '1px solid #2d2850',
          zIndex: 100,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex',
          flexDirection: 'column',
          color: '#e8e4ff',
        }}
      >
        <header style={{
          height: 40,
          background: '#0a0812',
          borderBottom: '1px solid #2d2850',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          flexShrink: 0,
        }}>
          <div style={{ color: '#7c6ee0', fontSize: 13, fontWeight: 500 }}>Suki AI</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {CONTEXT_SOURCES.map(source => (
              <button
                key={source.key}
                title={source.title}
                onClick={() => setContextToggles(prev => ({ ...prev, [source.key]: !prev[source.key] }))}
                style={{
                  width: 18,
                  height: 18,
                  color: contextToggles[source.key] ? '#7c6ee0' : '#5a5480',
                  fontSize: 12,
                  transition: 'color 0.15s ease, transform 0.1s ease',
                }}
              >
                {source.label}
              </button>
            ))}
            <button
              onClick={() => setThinkingMode(v => !v)}
              style={{
                padding: '3px 8px',
                borderRadius: 999,
                background: thinkingMode ? '#2d2850' : 'transparent',
                color: thinkingMode ? '#a394f0' : '#5a5480',
                fontSize: 12,
                transition: 'all 0.15s ease',
              }}
            >
              {'\u2726'} Think
            </button>
          </div>
        </header>

        <div style={{ height: 24, background: '#0a0812', borderBottom: '1px solid #2d2850', flexShrink: 0, position: 'relative', padding: '3px 12px' }}>
          <div style={{ color: '#5a5480', fontSize: 11 }}>~{tokenCount}k tokens</div>
          <div style={{ position: 'absolute', left: 12, right: 12, bottom: 0, height: 3, background: '#2d2850', overflow: 'hidden' }}>
            <div style={{ width: `${tokenFill}%`, height: '100%', background: tokenColor, transition: 'background 0.15s ease' }} />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.length === 0 && (
            <div className="animate-fade-in" style={{ color: '#5a5480', fontSize: 13, lineHeight: 1.5 }}>
              Ask about the current browser tab, workspace context, or terminal output.
            </div>
          )}
          {messages.map((message, index) => (
            <div
              key={`${message.timestamp}-${index}`}
              onMouseEnter={() => setHoveredMessage(index)}
              onMouseLeave={() => setHoveredMessage(null)}
              style={{
                alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: message.role === 'user' ? '80%' : '100%',
              }}
            >
              <div
                className={message.role === 'user' ? 'animate-fade-in-right' : 'animate-fade-in-left'}
                style={{
                  background: message.role === 'user' ? '#1a1730' : 'transparent',
                  borderLeft: message.role === 'assistant' ? '2px solid #7c6ee0' : 'none',
                  borderRadius: message.role === 'user' ? '12px 12px 4px 12px' : 0,
                  padding: message.role === 'user' ? '10px 14px' : '8px 12px',
                  color: '#e8e4ff',
                  fontSize: 13,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {message.content}
              </div>
              {hoveredMessage === index && (
                <div style={{ marginTop: 4, color: '#5a5480', fontSize: 10, textAlign: message.role === 'user' ? 'right' : 'left' }}>
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="animate-fade-in-left" style={{ alignSelf: 'flex-start', borderLeft: '2px solid #7c6ee0', padding: '8px 12px', color: '#e8e4ff', fontSize: 13 }}>
              Thinking<span className="cursor">_</span>
            </div>
          )}
        </div>

        {draggingFile && (
          <div style={{ margin: '0 12px 10px', background: 'rgba(124, 110, 224, 0.1)', border: '1px dashed #7c6ee0', borderRadius: 8, color: '#7c6ee0', fontSize: 12, textAlign: 'center', padding: 12 }}>
            Drop file to add context
          </div>
        )}

        <div style={{ minHeight: 64, background: '#0a0812', borderTop: '1px solid #2d2850', padding: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={event => resizeTextarea(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Ask Suki..."
              className="ai-sidebar-input"
              style={{
                flex: 1,
                minHeight: 40,
                maxHeight: 120,
                resize: 'none',
                background: '#110f1e',
                border: '1px solid #2d2850',
                borderRadius: 8,
                color: '#e8e4ff',
                fontSize: 13,
                padding: '10px 12px',
                outline: 'none',
                transition: 'all 0.15s ease',
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              style={{
                background: '#7c6ee0',
                color: 'white',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 12,
                opacity: !input.trim() || loading ? 0.4 : 1,
                cursor: !input.trim() || loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={event => {
                if (!input.trim() || loading) return;
                event.currentTarget.style.background = '#a394f0';
              }}
              onMouseLeave={event => {
                event.currentTarget.style.background = '#7c6ee0';
              }}
            >
              Send
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
