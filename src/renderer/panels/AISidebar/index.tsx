import React, { useEffect, useMemo, useRef, useState } from 'react';
import { stripAnsi } from '../../utils/stripAnsi';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
};

type ChatRole = 'system' | 'user' | 'assistant';

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type ContextToggleKey = 'webSearch' | 'screenshot' | 'dom' | 'network' | 'terminal';

type ContextToggles = Record<ContextToggleKey, boolean>;

interface UploadedFile {
  name: string;
  path: string;
  content: string;
  type: 'text' | 'image' | 'pdf';
}

interface ToolCall {
  id: string;
  tool: 'run_command' | 'run_wsl_command' | 'search_web' | 'read_file';
  args: Record<string, string>;
  status: 'pending' | 'approved' | 'denied' | 'running' | 'complete';
  output?: string;
}

interface AISidebarProps {
  activePanel: string;
}

const SYSTEM_PROMPT = `You are Suki, an AI assistant integrated into a desktop workspace with access to tools.

You have access to these tools. To use a tool, output a JSON block in your response like this:
<tool>
{
  "tool": "run_command",
  "args": { "command": "npm --version" }
}
</tool>

Available tools:
- run_command: Run a PowerShell command. Args: { "command": string }
- run_wsl_command: Run a command in WSL/Linux. Args: { "command": string }
- search_web: Search the web. Args: { "query": string }
- read_file: Read a file. Args: { "path": string }

Rules:
- Use tools when you need real information (current data, file contents, system info)
- Always explain what you are doing and why before using a tool
- After getting tool output, use it to give a complete answer
- For multi-step tasks, use multiple tools in sequence
- Never run destructive commands (rm -rf, format, delete) without explicit user confirmation`;

const CONTEXT_SOURCES: Array<{ key: ContextToggleKey; label: string; tokens: number }> = [
  { key: 'webSearch', label: 'Web search', tokens: 6 },
  { key: 'screenshot', label: 'Browser screenshot', tokens: 8 },
  { key: 'dom', label: 'Page HTML', tokens: 12 },
  { key: 'network', label: 'Network log', tokens: 4 },
  { key: 'terminal', label: 'Terminal output', tokens: 2 },
];

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
const PDF_EXTS = ['pdf'];

function getCodeFence(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'ts',
    tsx: 'tsx',
    js: 'js',
    jsx: 'jsx',
    py: 'python',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    css: 'css',
    html: 'html',
    md: 'md',
    sh: 'sh',
    rs: 'rust',
    go: 'go',
    txt: 'text',
  };
  return map[ext] ?? ext;
}

function truncateName(name: string): string {
  return name.length > 20 ? `${name.slice(0, 17)}...` : name;
}

function needsWebSearch(message: string): boolean {
  const webKeywords = [
    'search', 'look up', 'find', 'what is', 'who is', 'when did', 'latest',
    'current', 'news', 'today', 'price', 'weather', 'how to', 'what are',
    'recent', 'new', 'update', 'release', 'version', 'best', 'top',
  ];
  const lower = message.toLowerCase();
  return webKeywords.some(keyword => lower.includes(keyword));
}

function parseToolCalls(response: string): { text: string; toolCalls: Omit<ToolCall, 'id' | 'status'>[] } {
  const toolCalls: Omit<ToolCall, 'id' | 'status'>[] = [];
  const toolRegex = /<tool>([\s\S]*?)<\/tool>/g;
  let match: RegExpExecArray | null = toolRegex.exec(response);

  while (match !== null) {
    try {
      const parsed = JSON.parse(match[1].trim()) as Omit<ToolCall, 'id' | 'status'>;
      if (parsed.tool && parsed.args) toolCalls.push(parsed);
    } catch {
    }
    match = toolRegex.exec(response);
  }

  const text = response.replace(/<tool>[\s\S]*?<\/tool>/g, '').trim();
  return { text, toolCalls };
}

function isDestructiveCommand(command: string): boolean {
  return /\b(rm\s+-rf|rm\s+-r|del\s+\/[sq]|remove-item|format|mkfs|shutdown|reboot|poweroff|rd\s+\/s|rmdir\s+\/s)\b/i.test(command);
}

export default function AISidebar({ activePanel }: AISidebarProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [webSearching, setWebSearching] = useState(false);
  const [lastSearchQuery, setLastSearchQuery] = useState('');
  const [thinkingMode, setThinkingMode] = useState(false);
  const [autoApproveTools, setAutoApproveTools] = useState(false);
  const [contextToggles, setContextToggles] = useState<ContextToggles>({
    webSearch: true,
    screenshot: true,
    dom: false,
    network: false,
    terminal: false,
  });
  const [contextExpanded, setContextExpanded] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [pendingToolCalls, setPendingToolCalls] = useState<ToolCall[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredMessage, setHoveredMessage] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const approvalCallbacks = useRef<Map<string, (approved: boolean) => void>>(new Map());

  useEffect(() => () => {
    for (const callback of approvalCallbacks.current.values()) callback(false);
    approvalCallbacks.current.clear();
  }, []);

  const tokenCount = useMemo(() => {
    const contextTokens = CONTEXT_SOURCES.reduce((sum, source) => sum + (contextToggles[source.key] ? source.tokens : 0), 0);
    const messageTokens = Math.ceil(messages.reduce((sum, msg) => sum + msg.content.length, 0) / 4 / 1000);
    const fileTokens = uploadedFiles.reduce((sum, file) => sum + (file.type === 'image' ? 8 : file.type === 'pdf' ? 2 : 3), 0);
    return contextTokens + messageTokens + fileTokens;
  }, [contextToggles, messages, uploadedFiles]);

  const tokenFill = Math.min(100, (tokenCount / 128) * 100);
  const tokenColor = tokenCount < 80 ? '#7c6ee0' : tokenCount <= 110 ? '#f0b429' : '#e05c5c';

  const resizeTextarea = (value: string) => {
    setInput(value);
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.style.height = '40px';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    });
  };

  const processFile = async (filePath: string, fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

    try {
      if (IMAGE_EXTS.includes(ext)) {
        const base64 = await (window as any).suki.readFileBase64(filePath);
        setUploadedFiles(prev => [...prev, { name: fileName, path: filePath, content: base64, type: 'image' }]);
        return;
      }

      if (PDF_EXTS.includes(ext)) {
        setUploadedFiles(prev => [...prev, { name: fileName, path: filePath, content: 'PDF attached', type: 'pdf' }]);
        return;
      }

      const content = await (window as any).suki.readFile(filePath);
      const truncated = content.length > 8000 ? `${content.slice(0, 8000)}\n... (truncated)` : content;
      setUploadedFiles(prev => [...prev, { name: fileName, path: filePath, content: truncated, type: 'text' }]);
    } catch (error) {
      console.error('Failed to read file:', error);
    }
  };

  const handleFileSelect = async () => {
    const filePath = await (window as any).suki.openFile?.();
    if (!filePath) return;
    const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
    await processFile(filePath, fileName);
  };

  const buildContextWithFiles = (userMessage: string): { text: string; images: string[] } => {
    const textFiles = uploadedFiles.filter(file => file.type === 'text');
    const pdfFiles = uploadedFiles.filter(file => file.type === 'pdf');
    const imageFiles = uploadedFiles.filter(file => file.type === 'image');

    let contextText = userMessage;
    if (textFiles.length > 0 || pdfFiles.length > 0) {
      const fileContext = [
        ...textFiles.map(file => `File: ${file.name}\n\`\`\`${getCodeFence(file.name)}\n${file.content}\n\`\`\``),
        ...pdfFiles.map(file => `PDF attached: ${file.name}\n${file.content}`),
      ].join('\n\n');
      contextText = `${fileContext}\n\nUser: ${userMessage}`;
    }

    const images = imageFiles.map(file => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      return file.content.startsWith('data:') ? file.content : `data:image/${ext};base64,${file.content}`;
    });

    return { text: contextText, images };
  };

  const removeUploadedFile = (path: string) => {
    setUploadedFiles(prev => prev.filter(file => file.path !== path));
  };

  const searchAndFetch = async (query: string): Promise<string> => {
    setWebSearching(true);
    setLastSearchQuery(query);

    try {
      const results = await (window as any).suki.browserSearch?.(query);
      if (!results || results.length === 0) return '';

      let fullContent = '';
      if (results[0]?.url && results[0].url.startsWith('http')) {
        try {
          const page = await (window as any).suki.browserFetch?.(results[0].url);
          fullContent = page?.text ? `\nFull content from ${results[0].url}:\n${page.text}` : '';
        } catch {
        }
      }

      const formatted = results.map((result: { title: string; url: string; snippet: string }, index: number) =>
        `${index + 1}. ${result.title}\n   ${result.url}\n   ${result.snippet}`
      ).join('\n\n');

      return `Web search results for "${query}":\n\n${formatted}${fullContent}`;
    } finally {
      setWebSearching(false);
    }
  };

  const waitForApproval = (toolId: string): Promise<boolean> => {
    return new Promise(resolve => {
      approvalCallbacks.current.set(toolId, resolve);
    });
  };

  const handleApprove = (toolId: string) => {
    approvalCallbacks.current.get(toolId)?.(true);
    approvalCallbacks.current.delete(toolId);
  };

  const handleDeny = (toolId: string) => {
    approvalCallbacks.current.get(toolId)?.(false);
    approvalCallbacks.current.delete(toolId);
  };
  const executeTool = async (toolCall: Omit<ToolCall, 'id' | 'status'>): Promise<string> => {
    const suki = (window as any).suki;

    switch (toolCall.tool) {
      case 'run_command': {
        const result = await suki.execInPowerShell(toolCall.args.command);
        return stripAnsi(result.output) || '(no output)';
      }
      case 'run_wsl_command': {
        const result = await suki.execInWSL(toolCall.args.command);
        return stripAnsi(result.output) || '(no output)';
      }
      case 'search_web': {
        const webContext = await searchAndFetch(toolCall.args.query);
        return webContext || 'No results found';
      }
      case 'read_file': {
        const content = await suki.readFile(toolCall.args.path);
        return content || '(empty file)';
      }
      default:
        return 'Unknown tool';
    }
  };

  const runAgentLoop = async (history: ChatMessage[], originalRequest: string, depth = 0): Promise<void> => {
    if (depth > 10) return;

    const contextParts: string[] = [];

    if (contextToggles.webSearch && needsWebSearch(originalRequest)) {
      const webContext = await searchAndFetch(originalRequest);
      if (webContext) contextParts.push(webContext);
    }

    if (contextToggles.dom && activePanel === 'browser') {
      const dom = await (window as any).suki.getDOM?.();
      if (dom) contextParts.push(`Current page HTML:\n${dom.slice(0, 4000)}`);
    }

    if (contextToggles.network && activePanel === 'browser') {
      const net = await (window as any).suki.getNetworkLog?.();
      if (net?.length) contextParts.push(`Network log:\n${JSON.stringify(net.slice(-5), null, 2)}`);
    }

    if (contextToggles.terminal) {
      const term = await (window as any).suki.getTerminalOutput?.('terminal-1');
      if (term) contextParts.push(`Terminal output:\n${term.slice(-1000)}`);
    }

    const systemContent = SYSTEM_PROMPT + (contextParts.length > 0 ? `\n\nContext:\n${contextParts.join('\n\n')}` : '');

    const allMessages: ChatMessage[] = [
      { role: 'system', content: thinkingMode ? `${systemContent}\nThink carefully before answering.` : systemContent },
      ...history,
    ];

    const images: string[] = [];
    if (contextToggles.screenshot && activePanel === 'browser') {
      const screenshot = await (window as any).suki.screenshot?.();
      if (screenshot) images.push(`data:image/png;base64,${screenshot}`);
    }

    const rawResponse = await (window as any).suki.query(
      images.length > 0 ? 'vision' : 'general',
      allMessages,
      images.length > 0 ? images : undefined,
    );

    const { text, toolCalls } = parseToolCalls(rawResponse);

    if (text) {
      setMessages(prev => [...prev, { role: 'assistant', content: text, timestamp: Date.now() }]);
    }

    if (toolCalls.length === 0) return;

    for (const toolRequest of toolCalls) {
      const toolCall: ToolCall = {
        id: Math.random().toString(36).slice(2),
        ...toolRequest,
        status: 'pending',
      };

      const command = toolRequest.args.command ?? '';
      const mustApprove = !autoApproveTools
        || ((toolRequest.tool === 'run_command' || toolRequest.tool === 'run_wsl_command') && isDestructiveCommand(command));

      setPendingToolCalls(prev => [...prev, { ...toolCall, status: mustApprove ? 'pending' : 'running' }]);

      let approved = true;
      if (mustApprove) approved = await waitForApproval(toolCall.id);

      if (!approved) {
        setPendingToolCalls(prev => prev.map(item => (item.id === toolCall.id ? { ...item, status: 'denied' } : item)));
        history.push({ role: 'assistant', content: rawResponse });
        history.push({ role: 'user', content: `Tool "${toolRequest.tool}" was denied by user.` });
        continue;
      }

      setPendingToolCalls(prev => prev.map(item => (item.id === toolCall.id ? { ...item, status: 'running' } : item)));

      let toolOutput = '';
      try {
        toolOutput = await executeTool(toolRequest);
      } catch (error) {
        toolOutput = `Error: ${error instanceof Error ? error.message : 'Tool execution failed.'}`;
      }

      setPendingToolCalls(prev => prev.map(item => (item.id === toolCall.id ? { ...item, status: 'complete', output: toolOutput } : item)));

      history.push({ role: 'assistant', content: rawResponse });
      history.push({ role: 'user', content: `Tool output for ${toolRequest.tool}(${JSON.stringify(toolRequest.args)}):\n\`\`\`\n${toolOutput.slice(0, 3000)}\n\`\`\`` });

      await runAgentLoop(history, originalRequest, depth + 1);
      return;
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userInput = input.trim();
    const { text } = buildContextWithFiles(userInput);
    const visibleUserMessage: Message = { role: 'user', content: userInput, timestamp: Date.now() };

    const history: ChatMessage[] = [
      ...messages.map(message => ({ role: message.role, content: message.content })),
      { role: 'user', content: text },
    ];

    setMessages(prev => [...prev, visibleUserMessage]);
    resizeTextarea('');
    setLoading(true);

    try {
      await runAgentLoop(history, userInput);
    } finally {
      setLoading(false);
      setUploadedFiles([]);
    }
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const files = Array.from(event.dataTransfer.files);
    for (const file of files) {
      const filePath = (file as File & { path?: string }).path;
      if (!filePath) continue;
      await processFile(filePath, file.name);
    }
  };
  return (
    <div
      onDragEnter={event => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragOver={event => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={event => {
        event.preventDefault();
        if (event.currentTarget === event.target) setIsDragging(false);
      }}
      onDrop={(event) => { void handleDrop(event); }}
      style={{
        width: 300,
        minWidth: 300,
        height: '100%',
        background: '#0e0c1a',
        borderLeft: `1px solid ${isDragging ? '#7c6ee0' : '#2d2850'}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
        color: '#e8e4ff',
        transition: 'border-color 0.15s ease',
      }}
    >
      <header style={{ height: 40, background: '#0a0812', borderBottom: '1px solid #2d2850', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0 }}>
        <div style={{ color: '#7c6ee0', fontSize: 13, fontWeight: 500 }}>Suki AI</div>
        <button onClick={() => setThinkingMode(value => !value)} style={{ padding: '3px 8px', borderRadius: 999, background: thinkingMode ? '#2d2850' : 'transparent', color: thinkingMode ? '#a394f0' : '#5a5480', fontSize: 12, transition: 'all 0.15s ease' }}>
          Think
        </button>
      </header>

      <div style={{ height: 24, background: '#0a0812', borderBottom: '1px solid #2d2850', flexShrink: 0, position: 'relative', padding: '3px 12px' }}>
        <div style={{ color: '#5a5480', fontSize: 11 }}>~{tokenCount}k tokens</div>
        <div style={{ position: 'absolute', left: 12, right: 12, bottom: 0, height: 3, background: '#2d2850', overflow: 'hidden' }}>
          <div style={{ width: `${tokenFill}%`, height: '100%', background: tokenColor, transition: 'background 0.15s ease' }} />
        </div>
      </div>

      <section style={{ background: '#0a0812', borderBottom: '1px solid #2d2850', flexShrink: 0 }}>
        <button onClick={() => setContextExpanded(open => !open)} style={{ width: '100%', padding: '6px 12px', textAlign: 'left', color: '#5a5480', fontSize: 11, transition: 'color 0.15s ease' }} onMouseEnter={event => { event.currentTarget.style.color = '#7c6ee0'; }} onMouseLeave={event => { event.currentTarget.style.color = '#5a5480'; }}>
          Context {contextExpanded ? 'v' : '>'}
        </button>
        <div style={{ maxHeight: contextExpanded ? 220 : 0, overflow: 'hidden', transition: 'max-height 0.2s ease' }}>
          <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CONTEXT_SOURCES.map(source => (
              <label key={source.key} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9890c0', fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={contextToggles[source.key]} onChange={() => setContextToggles(prev => ({ ...prev, [source.key]: !prev[source.key] }))} style={{ width: 12, height: 12, accentColor: '#7c6ee0' }} />
                {source.label}
              </label>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9890c0', fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={autoApproveTools} onChange={() => setAutoApproveTools(value => !value)} style={{ width: 12, height: 12, accentColor: '#7c6ee0' }} />
              Auto-run tools
            </label>
          </div>
        </div>
      </section>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((message, index) => (
          <div key={`${message.timestamp}-${index}`} onMouseEnter={() => setHoveredMessage(index)} onMouseLeave={() => setHoveredMessage(null)} style={{ alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: message.role === 'user' ? '80%' : '100%' }}>
            <div className={message.role === 'user' ? 'animate-fade-in-right' : 'animate-fade-in-left'} style={{ background: message.role === 'user' ? '#1a1730' : 'transparent', borderLeft: message.role === 'assistant' ? '2px solid #7c6ee0' : 'none', borderRadius: message.role === 'user' ? '12px 12px 4px 12px' : 0, padding: message.role === 'user' ? '10px 14px' : '8px 12px', color: '#e8e4ff', fontSize: 13, whiteSpace: 'pre-wrap' }}>
              {message.content}
            </div>
            {hoveredMessage === index && <div style={{ marginTop: 4, color: '#5a5480', fontSize: 10, textAlign: message.role === 'user' ? 'right' : 'left' }}>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>}
          </div>
        ))}

        {pendingToolCalls.map(toolCall => (
          <div key={toolCall.id} className="animate-fade-in-up" style={{ margin: '8px 0', background: '#0e0c1a', border: `1px solid ${toolCall.status === 'complete' ? '#3dd68c' : toolCall.status === 'denied' ? '#e05c5c' : toolCall.status === 'running' ? '#f0b429' : '#2d2850'}`, borderRadius: 8, overflow: 'hidden', transition: 'border-color 0.2s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #2d2850', background: '#110f1e' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: toolCall.status === 'complete' ? '#3dd68c' : toolCall.status === 'denied' ? '#e05c5c' : toolCall.status === 'running' ? '#f0b429' : '#5a5480', animation: toolCall.status === 'running' ? 'pulse 0.35s ease-in-out infinite' : 'none' }} />
              <span style={{ fontSize: 11, color: '#9890c0', fontFamily: 'monospace' }}>{toolCall.tool === 'run_command' ? 'PowerShell' : toolCall.tool === 'run_wsl_command' ? 'WSL' : toolCall.tool === 'search_web' ? 'Web Search' : toolCall.tool === 'read_file' ? 'Read File' : toolCall.tool}</span>
              <span style={{ fontSize: 11, color: '#5a5480', marginLeft: 'auto', textTransform: 'capitalize' }}>{toolCall.status}</span>
            </div>
            <div style={{ padding: '8px 12px' }}><code style={{ fontSize: 12, color: '#e8e4ff', fontFamily: 'JetBrains Mono, monospace', wordBreak: 'break-all' }}>{toolCall.args.command || toolCall.args.query || toolCall.args.path}</code></div>
            {toolCall.output && <div style={{ padding: '8px 12px', borderTop: '1px solid #2d2850', maxHeight: 200, overflowY: 'auto' }}><pre style={{ fontSize: 11, color: '#9890c0', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>{toolCall.output}</pre></div>}
            {toolCall.status === 'pending' && <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderTop: '1px solid #2d2850' }}>
              <button onClick={() => handleApprove(toolCall.id)} style={{ flex: 1, padding: '5px 0', background: '#7c6ee0', color: 'white', borderRadius: 4, fontSize: 12, cursor: 'pointer', transition: 'background 0.15s ease' }} onMouseEnter={event => { event.currentTarget.style.background = '#a394f0'; }} onMouseLeave={event => { event.currentTarget.style.background = '#7c6ee0'; }}>Run</button>
              <button onClick={() => handleDeny(toolCall.id)} style={{ padding: '5px 12px', background: 'transparent', color: '#9890c0', border: '1px solid #2d2850', borderRadius: 4, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s ease' }} onMouseEnter={event => { event.currentTarget.style.borderColor = '#e05c5c'; event.currentTarget.style.color = '#e05c5c'; }} onMouseLeave={event => { event.currentTarget.style.borderColor = '#2d2850'; event.currentTarget.style.color = '#9890c0'; }}>Deny</button>
            </div>}
          </div>
        ))}

        {webSearching && <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 11, color: '#7c6ee0', animation: 'pulse 0.35s ease-in-out infinite' }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: '#7c6ee0', animation: 'pulse 0.35s ease-in-out infinite' }} />Searching the web for "{lastSearchQuery}"...</div>}
        {loading && !webSearching && <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 11, color: '#5a5480' }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: '#5a5480', animation: 'pulse 0.35s ease-in-out infinite' }} />Thinking...</div>}
      </div>
      {isDragging && <div style={{ margin: '0 12px 10px', background: 'rgba(124, 110, 224, 0.1)', border: '1px dashed #7c6ee0', borderRadius: 8, color: '#7c6ee0', fontSize: 12, textAlign: 'center', padding: 12 }}>Drop file to add context</div>}

      <div style={{ minHeight: 64, background: '#0a0812', borderTop: '1px solid #2d2850', padding: 12, flexShrink: 0 }}>
        {uploadedFiles.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {uploadedFiles.map(file => (
              <div key={file.path} className="animate-fade-in-up" style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: '100%', background: '#1a1730', border: '1px solid #2d2850', borderRadius: 12, padding: '3px 10px' }} title={file.name}>
                {file.type === 'image' && <img src={`data:image/${file.name.split('.').pop()?.toLowerCase() ?? 'png'};base64,${file.content}`} alt={file.name} style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />}
                <span style={{ color: '#9890c0', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{truncateName(file.name)}</span>
                <button onClick={() => removeUploadedFile(file.path)} style={{ color: '#5a5480', fontSize: 12, transition: 'color 0.15s ease' }} onMouseEnter={event => { event.currentTarget.style.color = '#e05c5c'; }} onMouseLeave={event => { event.currentTarget.style.color = '#5a5480'; }}>x</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <button onClick={() => { void handleFileSelect(); }} style={{ color: '#5a5480', fontSize: 12, padding: '8px 6px', transition: 'all 0.15s ease', flexShrink: 0 }} onMouseEnter={event => { event.currentTarget.style.color = '#7c6ee0'; }} onMouseLeave={event => { event.currentTarget.style.color = '#5a5480'; }} title="Attach file">Attach</button>
          <textarea ref={textareaRef} value={input} onChange={event => resizeTextarea(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder="Ask Suki..." className="ai-sidebar-input" style={{ flex: 1, minHeight: 40, maxHeight: 120, resize: 'none', background: '#110f1e', border: '1px solid #2d2850', borderRadius: 8, color: '#e8e4ff', fontSize: 13, padding: '10px 12px', outline: 'none', transition: 'all 0.15s ease' }} />
          <button onClick={() => { void sendMessage(); }} disabled={!input.trim() || loading} style={{ background: '#7c6ee0', color: 'white', borderRadius: 6, padding: '6px 12px', fontSize: 12, opacity: !input.trim() || loading ? 0.4 : 1, cursor: !input.trim() || loading ? 'not-allowed' : 'pointer', transition: 'all 0.15s ease' }} onMouseEnter={event => { if (!input.trim() || loading) return; event.currentTarget.style.background = '#a394f0'; }} onMouseLeave={event => { event.currentTarget.style.background = '#7c6ee0'; }}>Send</button>
        </div>
      </div>
    </div>
  );
}
