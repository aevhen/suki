import React, { useEffect, useMemo, useRef, useState } from 'react';
import { stripAnsi } from '../../utils/stripAnsi';

type CTFCategory = 'web' | 'crypto' | 'forensics' | 'pwn' | 'reverse' | 'osint' | 'misc' | 'unknown';
type SolveStatus = 'unsolved' | 'solving' | 'solved' | 'failed';

interface CTFChallenge {
  id: string;
  title: string;
  description: string;
  url?: string;
  attachments: string[];
  wrongFlags: string[];
  category: CTFCategory;
  flagFormat: string;
  customFlagFormat: string;
  points?: number;
  status: SolveStatus;
  flag?: string;
  createdAt: number;
  solvedAt?: number;
}

interface SolveStep {
  id: string;
  type: 'reasoning' | 'tool_call' | 'tool_output' | 'flag_found' | 'error' | 'strategy';
  content: string;
  tool?: string;
  command?: string;
  output?: string;
  timestamp: number;
}

interface CTFKnowledge {
  id: string;
  category: CTFCategory;
  source: 'writeup' | 'self_solved' | 'failed_attempt';
  title: string;
  summary: string;
  techniques: string[];
  tools: string[];
  flagFormat: string;
  url?: string;
  challengeId?: string;
  createdAt: number;
  useCount: number;
}

const FLAG_FORMATS = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'n/a', label: 'N/A (no standard format)' },
  { value: 'CTF{', label: 'CTF{...}' },
  { value: 'flag{', label: 'flag{...}' },
  { value: 'picoCTF{', label: 'picoCTF{...}' },
  { value: 'HTB{', label: 'HTB{...}' },
  { value: 'THM{', label: 'THM{...}' },
  { value: 'DUCTF{', label: 'DUCTF{...}' },
  { value: 'corCTF{', label: 'corCTF{...}' },
  { value: 'custom', label: 'Custom...' },
] as const;

const CATEGORIES = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'web', label: 'Web', color: '#7c6ee0' },
  { value: 'crypto', label: 'Crypto', color: '#f0b429' },
  { value: 'forensics', label: 'Forensics', color: '#60a8e0' },
  { value: 'pwn', label: 'Pwn', color: '#e05c5c' },
  { value: 'reverse', label: 'Reverse', color: '#f0b429' },
  { value: 'osint', label: 'OSINT', color: '#3dd68c' },
  { value: 'misc', label: 'Misc', color: '#9890c0' },
] as const;

const CATEGORY_COLORS: Record<CTFCategory, string> = {
  web: '#7c6ee0',
  crypto: '#f0b429',
  forensics: '#60a8e0',
  pwn: '#e05c5c',
  reverse: '#f0b429',
  osint: '#3dd68c',
  misc: '#9890c0',
  unknown: '#5a5480',
};

const CATEGORY_TOOLS: Record<CTFCategory, string[]> = {
  web: ['curl', 'wget', 'sqlmap', 'nikto', 'gobuster', 'wfuzz', 'base64', 'python3'],
  crypto: ['python3', 'openssl', 'base64', 'xxd', 'hashcat', 'john'],
  forensics: ['file', 'strings', 'xxd', 'binwalk', 'exiftool', 'steghide', 'foremost', 'tshark'],
  pwn: ['gdb', 'python3', 'checksec', 'readelf', 'objdump', 'strace', 'ltrace'],
  reverse: ['file', 'strings', 'objdump', 'gdb', 'radare2', 'ltrace', 'strace'],
  osint: ['whois', 'dig', 'nslookup', 'nmap', 'python3'],
  misc: ['python3', 'bash', 'file', 'strings', 'base64', 'xxd'],
  unknown: ['file', 'strings', 'base64', 'python3'],
};

const saveKnowledge = (kb: CTFKnowledge[]) => {
  localStorage.setItem('suki_ctf_knowledge', JSON.stringify(kb));
};

const loadKnowledge = (): CTFKnowledge[] => {
  try {
    return JSON.parse(localStorage.getItem('suki_ctf_knowledge') ?? '[]') as CTFKnowledge[];
  } catch {
    return [];
  }
};

const detectFlag = (text: string, flagFormat: string, customFormat: string): string | null => {
  const explicitMatch = text.match(/FLAG_FOUND:\s*([^\s\n",]+)/i);
  if (explicitMatch) {
    const candidate = explicitMatch[1].trim();
    if (candidate.length < 4) return null;
    if (/^[",.\-_:;]+$/.test(candidate)) return null;
    return candidate;
  }

  const answerMatch = text.match(/ANSWER_FOUND:\s*(.{4,})/i);
  if (answerMatch) {
    const candidate = answerMatch[1].split('\n')[0].trim();
    if (candidate.length < 2) return null;
    return candidate;
  }

  if (flagFormat === 'n/a') return null;

  if (flagFormat === 'auto') {
    const patterns = [
      /CTF\{[^}]{3,}\}/i,
      /flag\{[^}]{3,}\}/i,
      /picoCTF\{[^}]{3,}\}/i,
      /HTB\{[^}]{3,}\}/i,
      /THM\{[^}]{3,}\}/i,
      /DUCTF\{[^}]{3,}\}/i,
      /corCTF\{[^}]{3,}\}/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[0];
    }
    return null;
  }

  const format = flagFormat === 'custom' ? customFormat : flagFormat;
  if (!format) return null;
  const escaped = format.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped + '[^}]{3,}\\}', 'i');
  const match = text.match(pattern);
  return match ? match[0] : null;
};

const isValidFlag = (flag: string, flagFormat: string, customFormat: string): boolean => {
  if (flag.length < 5) return false;
  if (/^[\s",.\-_:;!?]+$/.test(flag)) return false;

  if (flagFormat !== 'n/a') {
    if (!flag.includes('{') || !flag.includes('}')) return false;
    const inner = flag.match(/\{([^}]+)\}/);
    if (!inner || inner[1].length < 3) return false;

    if (flagFormat !== 'auto') {
      const format = flagFormat === 'custom' ? customFormat : flagFormat;
      if (format && !flag.startsWith(format)) return false;
    }
  }

  return true;
};

const stepColors: Record<SolveStep['type'], { color: string; label: string; bg: string }> = {
  reasoning: { color: '#9890c0', label: 'Reasoning', bg: 'transparent' },
  strategy: { color: '#7c6ee0', label: 'Strategy', bg: 'rgba(124,110,224,0.05)' },
  tool_call: { color: '#f0b429', label: 'Tool', bg: 'rgba(240,180,41,0.05)' },
  tool_output: { color: '#5a5480', label: 'Output', bg: '#0e0c1a' },
  flag_found: { color: '#3dd68c', label: 'FLAG', bg: 'rgba(61,214,140,0.10)' },
  error: { color: '#e05c5c', label: 'Error', bg: 'rgba(224,92,92,0.05)' },
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#110f1e',
  border: '1px solid #2d2850',
  borderRadius: 6,
  color: '#e8e4ff',
  padding: '7px 10px',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

export default function CTFPane() {
  const [challenges, setChallenges] = useState<CTFChallenge[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('suki_ctf_challenges') ?? '[]') as CTFChallenge[];
    } catch {
      return [];
    }
  });
  const [knowledgeBase, setKnowledgeBase] = useState<CTFKnowledge[]>(() => loadKnowledge());
  const [currentChallenge, setCurrentChallenge] = useState<CTFChallenge | null>(null);
  const [solveSteps, setSolveSteps] = useState<SolveStep[]>([]);
  const [solving, setSolving] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [view, setView] = useState<'challenges' | 'knowledge'>('challenges');
  const [expandedOutputs, setExpandedOutputs] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({
    title: '',
    description: '',
    url: '',
    category: 'auto',
    flagFormat: 'auto',
    customFlagFormat: '',
    points: '',
    attachments: [] as string[],
  });
  const stopSolveRef = useRef(false);
  const solveLogRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<SolveStep[]>([]);

  useEffect(() => {
    localStorage.setItem('suki_ctf_challenges', JSON.stringify(challenges));
  }, [challenges]);

  useEffect(() => {
    saveKnowledge(knowledgeBase);
  }, [knowledgeBase]);

  useEffect(() => {
    stepsRef.current = solveSteps;
    if (solveLogRef.current) {
      solveLogRef.current.scrollTop = solveLogRef.current.scrollHeight;
    }
  }, [solveSteps]);

  const addStep = (step: Omit<SolveStep, 'id' | 'timestamp'>) => {
    const newStep: SolveStep = {
      id: Math.random().toString(36).slice(2),
      timestamp: Date.now(),
      ...step,
    };
    setSolveSteps(prev => [...prev, newStep]);
    return newStep;
  };

  const handleWrongFlag = () => {
    if (!currentChallenge) return;

    const wrongFlag = currentChallenge.flag ?? '';
    const updated: CTFChallenge = {
      ...currentChallenge,
      status: 'unsolved',
      flag: '',
      wrongFlags: [...(currentChallenge.wrongFlags ?? []), wrongFlag].filter(Boolean),
    };

    setCurrentChallenge(updated);
    setChallenges(prev => prev.map(challenge => challenge.id === updated.id ? updated : challenge));
    setSolveSteps([]);
    setExpandedOutputs({});

    window.setTimeout(() => {
      void solveCTF(updated);
    }, 100);
  };

  const classifyChallenge = async (title: string, description: string, url: string): Promise<CTFCategory> => {
    try {
      const response = await (window as any).suki.query('reasoning', [{
        role: 'user',
        content: `Classify this CTF challenge. Reply with ONLY one word: web, crypto, forensics, pwn, reverse, osint, or misc.\n\nTitle: ${title}\nDescription: ${description}\nURL: ${url || 'none'}`,
      }]);
      const normalized = String(response).trim().toLowerCase();
      const valid: CTFCategory[] = ['web', 'crypto', 'forensics', 'pwn', 'reverse', 'osint', 'misc'];
      return valid.includes(normalized as CTFCategory) ? normalized as CTFCategory : 'unknown';
    } catch {
      return 'unknown';
    }
  };

  const learnFromWriteups = async (challenge: CTFChallenge) => {
    addStep({ type: 'reasoning', content: 'Learning from online writeups in background...' });
    const queries = [
      `CTF writeup ${challenge.category} ${challenge.title}`,
      `CTF ${challenge.category} technique writeup site:github.com OR site:medium.com OR site:ctftime.org`,
      `${challenge.category} CTF challenge solution walkthrough`,
    ];

    for (const query of queries) {
      try {
        const results = await (window as any).suki.browserSearch?.(query);
        for (const result of (results ?? []).slice(0, 3)) {
          if (!result?.url) continue;
          const isWriteupSite = /github|medium|ctftime|hackthebox|tryhackme|ctflearn|writeup|blog/i.test(result.url);
          if (!isWriteupSite || knowledgeBase.some(item => item.url === result.url)) continue;

          let content = '';
          try {
            const page = await (window as any).suki.browserFetch?.(result.url);
            content = page?.text ?? result.snippet ?? '';
          } catch {
            content = result.snippet ?? '';
          }

          if (!content || content.length < 100) continue;

          const extractPrompt = `Extract CTF knowledge from this writeup for a ${challenge.category} challenge.\n\nWriteup content:\n${content.slice(0, 3000)}\n\nRespond with ONLY valid JSON in this exact format:\n{\n  "summary": "one paragraph summary of the approach",\n  "techniques": ["technique1", "technique2"],\n  "tools": ["tool1", "tool2"],\n  "applicable": true/false\n}\n\nSet applicable to false if this is not relevant to ${challenge.category} CTF challenges.`;

          try {
            const response = await (window as any).suki.query('reasoning', [{ role: 'user', content: extractPrompt }]);
            const jsonMatch = String(response).match(/\{[\s\S]+\}/);
            if (!jsonMatch) continue;
            const extracted = JSON.parse(jsonMatch[0]) as { summary?: string; techniques?: string[]; tools?: string[]; applicable?: boolean };
            if (!extracted.applicable) continue;

            const knowledge: CTFKnowledge = {
              id: Math.random().toString(36).slice(2),
              category: challenge.category,
              source: 'writeup',
              title: result.title || query,
              summary: extracted.summary ?? 'Relevant writeup indexed.',
              techniques: extracted.techniques ?? [],
              tools: extracted.tools ?? [],
              flagFormat: challenge.flagFormat,
              url: result.url,
              createdAt: Date.now(),
              useCount: 0,
            };

            setKnowledgeBase(prev => (prev.some(item => item.url === result.url) ? prev : [...prev, knowledge]));
            addStep({ type: 'reasoning', content: `Indexed writeup: ${result.title || result.url}` });
          } catch {
            continue;
          }
        }
      } catch {
        continue;
      }
    }
  };

  const learnFromSolveAttempt = async (challenge: CTFChallenge, steps: SolveStep[], success: boolean) => {
    const toolOutputs = steps.filter(step => step.type === 'tool_output').map(step => step.content).join('\n\n');
    const toolCalls = steps.filter(step => step.type === 'tool_call').map(step => step.command).filter(Boolean).join(', ');
    const reasoning = steps.filter(step => step.type === 'reasoning' || step.type === 'strategy').map(step => step.content).join('\n\n');

    const extractPrompt = `Extract reusable CTF knowledge from this ${success ? 'successful' : 'failed'} solve attempt.\n\nChallenge: ${challenge.title} (${challenge.category})\nDescription: ${challenge.description}\nOutcome: ${success ? `FLAG FOUND: ${challenge.flag}` : 'Failed to find flag'}\n\nCommands run: ${toolCalls}\nKey reasoning: ${reasoning.slice(0, 1000)}\nTool outputs (key parts): ${toolOutputs.slice(0, 2000)}\n\nExtract knowledge as ONLY valid JSON:\n{\n  "summary": "what approach was tried and ${success ? 'what worked' : 'what failed and why'}",\n  "techniques": ["technique1", "technique2"],\n  "tools": ["tool1", "tool2"],\n  "lessons": "one sentence lesson learned for future similar challenges"\n}`;

    try {
      const response = await (window as any).suki.query('reasoning', [{ role: 'user', content: extractPrompt }]);
      const jsonMatch = String(response).match(/\{[\s\S]+\}/);
      if (!jsonMatch) return;
      const extracted = JSON.parse(jsonMatch[0]) as { summary?: string; techniques?: string[]; tools?: string[] };
      const knowledge: CTFKnowledge = {
        id: Math.random().toString(36).slice(2),
        category: challenge.category,
        source: success ? 'self_solved' : 'failed_attempt',
        title: `${success ? 'Solved' : 'Failed'} ${challenge.title}`,
        summary: extracted.summary ?? 'Solve attempt recorded.',
        techniques: extracted.techniques ?? [],
        tools: extracted.tools ?? [],
        flagFormat: challenge.flagFormat,
        challengeId: challenge.id,
        createdAt: Date.now(),
        useCount: 0,
      };
      setKnowledgeBase(prev => [...prev, knowledge]);
    } catch {
      // Silent fail.
    }
  };

  const getRelevantKnowledge = async (challenge: CTFChallenge): Promise<string> => {
    const kb = loadKnowledge();
    const relevant = kb
      .filter(item => item.category === challenge.category || item.category === 'unknown')
      .sort((a, b) => b.useCount - a.useCount)
      .slice(0, 5);

    if (relevant.length === 0) return '';

    const updated = kb.map(item => (
      relevant.some(match => match.id === item.id)
        ? { ...item, useCount: item.useCount + 1 }
        : item
    ));
    saveKnowledge(updated);
    setKnowledgeBase(updated);

    const knowledgeText = relevant.map(item => [
      `[${item.source === 'writeup' ? 'Writeup' : item.source === 'self_solved' ? 'Past solve' : 'Past attempt'}] ${item.title}`,
      `Summary: ${item.summary}`,
      `Techniques: ${item.techniques.join(', ') || 'n/a'}`,
      `Tools: ${item.tools.join(', ') || 'n/a'}`,
    ].join('\n')).join('\n---\n');

    return `Relevant knowledge from past experience:\n${knowledgeText}`;
  };

  const quickSolve = async (challenge: CTFChallenge): Promise<string | null> => {
    if (!challenge.description) return null;

    const text = challenge.description;
    const suki = (window as any).suki;

    try {
      const b64matches = text.match(/[A-Za-z0-9+/]{20,}={0,2}/g) ?? [];
      for (const match of b64matches) {
        const decoded = atob(match);
        const flag = detectFlag(decoded, challenge.flagFormat, challenge.customFlagFormat);
        if (flag && isValidFlag(flag, challenge.flagFormat, challenge.customFlagFormat)) return flag;
      }
    } catch {
      // Ignore quick browser-side decode errors.
    }

    const sanitizedText = text.replace(/'/g, '');
    const quickCommands = [
      `echo '${sanitizedText}' | base64 -d 2>/dev/null`,
      `echo '${sanitizedText}' | xxd -r -p 2>/dev/null`,
      `python3 -c "import base64; print(base64.b64decode('${text.trim()}').decode())" 2>/dev/null`,
    ];

    for (const command of quickCommands) {
      try {
        const result = await suki.execInWSL(command);
        const output = stripAnsi(result.output);
        const flag = detectFlag(output, challenge.flagFormat, challenge.customFlagFormat);
        if (flag && isValidFlag(flag, challenge.flagFormat, challenge.customFlagFormat)) return flag;
      } catch {
        // Ignore failed quick checks.
      }
    }

    return null;
  };

  const summarizeOutput = async (toolName: string, output: string, challenge: CTFChallenge): Promise<string> => {
    if (output.length < 500) return output;
    const detected = detectFlag(output, challenge.flagFormat, challenge.customFlagFormat);
    if (detected && isValidFlag(detected, challenge.flagFormat, challenge.customFlagFormat)) return output;

    try {
      const summary = await (window as any).suki.query('general', [{
        role: 'user',
        content: `Summarize this ${toolName} output for a CTF solver in 3-5 sentences. Focus on security-relevant findings, errors, and anything unusual. Preserve any flag-like strings exactly.\n\nOutput:\n${output.slice(0, 3000)}`,
      }]);
      return `[summarized] ${summary}`;
    } catch {
      return `${output.slice(0, 800)}... (truncated)`;
    }
  };

  const solveCTF = async (challenge: CTFChallenge) => {
    setSolveSteps([]);
    setExpandedOutputs({});
    setSolving(true);
    stopSolveRef.current = false;

    const updateChallenge = (patch: Partial<CTFChallenge>) => {
      challenge = { ...challenge, ...patch };
      setCurrentChallenge(challenge);
      setChallenges(prev => prev.map(item => item.id === challenge.id ? challenge : item));
    };

    updateChallenge({ status: 'solving' });

    addStep({ type: 'reasoning', content: 'Running quick-solve checks...' });
    const quickFlag = await quickSolve(challenge);
    if (quickFlag) {
      addStep({ type: 'flag_found', content: `FLAG FOUND (quick solve): ${quickFlag}` });
      updateChallenge({ status: 'solved', flag: quickFlag, solvedAt: Date.now() });
      setSolving(false);
      void learnFromSolveAttempt(challenge, stepsRef.current, true);
      return;
    }

    if ((challenge.wrongFlags ?? []).length > 0) {
      addStep({
        type: 'reasoning',
        content: `Re-running with ${challenge.wrongFlags.length} known wrong flag(s): ${challenge.wrongFlags.join(', ')}\nWill try a completely different approach.`,
      });
    }

    let pageContent = '';
    if (challenge.url) {
      addStep({ type: 'reasoning', content: `Navigating to: ${challenge.url}` });
      try {
        const page = await (window as any).suki.browserFetch?.(challenge.url);
        pageContent = page?.text ?? '';
        addStep({ type: 'tool_output', content: `Page loaded (${pageContent.length} chars)\n${pageContent.slice(0, 1500)}`, tool: 'browser' });
      } catch (error) {
        addStep({ type: 'error', content: `Failed to load URL: ${String(error)}` });
      }
    }

    addStep({ type: 'reasoning', content: 'Checking available WSL tools...' });
    let availableTools = '';
    try {
      const toolCheck = await (window as any).suki.execInWSL('which python3 curl wget file strings base64 xxd binwalk exiftool steghide sqlmap nmap 2>/dev/null');
      availableTools = stripAnsi(toolCheck.output);
    } catch {
      availableTools = 'WSL not available or tools not installed';
    }
    addStep({ type: 'tool_output', content: `Tools:\n${availableTools || 'No tools reported'}`, tool: 'wsl' });

    let attachmentContext = '';
    if (challenge.attachments && challenge.attachments.length > 0) {
      addStep({ type: 'reasoning', content: `Reading ${challenge.attachments.length} attached file(s)...` });

      for (const filePath of challenge.attachments) {
        const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
        const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

        try {
          const wslPath = filePath
            .replace(/^([A-Z]):\\/, (_, drive) => `/mnt/${String(drive).toLowerCase()}/`)
            .replace(/\\/g, '/');

          const fileType = await (window as any).suki.execInWSL(`file "${wslPath}" 2>/dev/null`);
          addStep({ type: 'tool_output', content: `${fileName}: ${stripAnsi(fileType.output)}`, tool: 'file' });

          const textExts = ['txt', 'md', 'py', 'js', 'ts', 'json', 'xml', 'html', 'css', 'sh', 'c', 'cpp', 'java', 'rb', 'php', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'log'];
          if (textExts.includes(ext)) {
            const content = await (window as any).suki.readFile(filePath);
            const truncated = content.length > 3000 ? `${content.slice(0, 3000)}\n...(truncated)` : content;
            attachmentContext += `\nFile: ${fileName}\n\`\`\`${ext}\n${truncated}\n\`\`\`\n`;
          } else {
            const strings = await (window as any).suki.execInWSL(`strings "${wslPath}" 2>/dev/null | head -50`);
            const xxd = await (window as any).suki.execInWSL(`xxd "${wslPath}" 2>/dev/null | head -20`);
            attachmentContext += `\nFile: ${fileName} (binary)\nstrings output:\n${stripAnsi(strings.output)}\nhex dump:\n${stripAnsi(xxd.output)}\n`;
          }
        } catch (error) {
          addStep({ type: 'error', content: `Could not read ${fileName}: ${String(error)}` });
        }
      }

      if (attachmentContext) {
        addStep({ type: 'tool_output', content: `Loaded ${challenge.attachments.length} file(s) into context`, tool: 'files' });
      }
    }

    const effectiveFormat = challenge.flagFormat === 'custom' ? challenge.customFlagFormat : challenge.flagFormat;
    const flagInstructions = challenge.flagFormat === 'n/a'
      ? `There is no standard flag format. When you find the answer, output it on its own line exactly like this:
ANSWER_FOUND: the_answer_here
Do not add quotes, punctuation, or anything else after the answer.`
      : challenge.flagFormat === 'auto'
        ? `Common flag formats: CTF{...} flag{...} picoCTF{...} HTB{...} THM{...}
When you find the flag, output it on its own line exactly like this:
FLAG_FOUND: CTF{the_flag_here}
The flag must be in the format PREFIX{content}. Do not output FLAG_FOUND with just a quote or punctuation.`
        : `The flag format is: ${effectiveFormat}...}
When you find the flag, output it on its own line exactly like this:
FLAG_FOUND: ${effectiveFormat}the_flag_here}
Only output FLAG_FOUND when you are certain you have found the complete flag in the correct format.`;
    const wrongFlagsContext = (challenge.wrongFlags ?? []).length > 0
      ? `\nPREVIOUSLY TRIED FLAGS THAT WERE WRONG (do NOT output these again):\n${challenge.wrongFlags.map(flag => `- ${flag}`).join('\n')}\nThese have been confirmed incorrect. You must find a different flag.\n`
      : '';

    const relevantKnowledge = await getRelevantKnowledge(challenge);

    const solveSystem = `You are an expert CTF solver with memory of past challenges.\n${relevantKnowledge ? `\nPast experience:\n${relevantKnowledge}\n` : ''}${wrongFlagsContext}Use tools to solve the challenge.\n\nTo run a WSL/Linux command:\n<tool>{"tool":"run_wsl_command","args":{"command":"bash command here"}}</tool>\n\nTo run a PowerShell command:\n<tool>{"tool":"run_command","args":{"command":"ps command here"}}</tool>\n\nTo search the web:\n<tool>{"tool":"search_web","args":{"query":"search query"}}</tool>\n\nTo navigate the browser:\n<tool>{"tool":"browser_navigate","args":{"url":"https://..."}}</tool>\n\n${flagInstructions}\n\nBe methodical. One tool at a time. Learn from each output.`;

    const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    const combinedPrompt = `You are an expert CTF solver.\n\nChallenge: ${challenge.title}\nCategory: ${challenge.category}\nDescription: ${challenge.description}\n${challenge.url ? `URL: ${challenge.url}\n` : ''}${pageContent ? `Page content:\n${pageContent.slice(0, 1500)}\n` : ''}${attachmentContext ? `Attached files:\n${attachmentContext}\n` : ''}Available WSL tools: ${availableTools.slice(0, 300)}\n${relevantKnowledge ? `${relevantKnowledge}\n` : ''}${wrongFlagsContext}${flagInstructions}\n\n${(challenge.wrongFlags ?? []).length > 0 ? `IMPORTANT: Previous attempts found ${challenge.wrongFlags.join(', ')} but these were WRONG. Try a completely different approach.\n` : ''}First, briefly state your approach in 2-3 sentences.\nThen immediately use a tool to start solving.\nDo not just plan - act now.`;
    history.push({ role: 'user', content: combinedPrompt });

    let flagFound = false;
    const recentToolCalls = new Set<string>();
    let stuckCount = 0;
    let lastResponseHash = '';
    const maxIterations = 15;

    for (let iteration = 0; iteration < maxIterations && !stopSolveRef.current && !flagFound; iteration += 1) {
      let response = '';
      try {
        const trimmedHistory = history.slice(-6);
        response = await (window as any).suki.query('reasoning', [{ role: 'system', content: solveSystem }, ...trimmedHistory]);
      } catch (error: any) {
        addStep({ type: 'error', content: `AI error: ${error?.message ?? String(error)}` });
        break;
      }

      const responseHash = response.slice(0, 100);
      if (responseHash === lastResponseHash) {
        stuckCount += 1;
        if (stuckCount >= 3) {
          addStep({ type: 'error', content: 'AI appears stuck in a loop. Stopping.' });
          break;
        }
        history.push({ role: 'user', content: 'You are repeating yourself. Try a completely different tool or approach. Think outside the box.' });
      } else {
        stuckCount = 0;
      }
      lastResponseHash = responseHash;

      history.push({ role: 'assistant', content: response });

      const responseFlag = detectFlag(response, challenge.flagFormat, challenge.customFlagFormat);
      if (responseFlag && isValidFlag(responseFlag, challenge.flagFormat, challenge.customFlagFormat)) {
        addStep({ type: 'flag_found', content: `FLAG FOUND: ${responseFlag}` });
        updateChallenge({ status: 'solved', flag: responseFlag, solvedAt: Date.now() });
        flagFound = true;
        break;
      }

      const toolRegex = /<tool>([\s\S]*?)<\/tool>/g;
      const toolResults: string[] = [];
      let hasToolCalls = false;
      let match: RegExpExecArray | null;

      while ((match = toolRegex.exec(response)) !== null && !flagFound && !stopSolveRef.current) {
        hasToolCalls = true;
        let toolCall: { tool?: string; args?: Record<string, string> } = {};
        try {
          toolCall = JSON.parse(match[1].trim());
        } catch {
          continue;
        }

        const toolName = toolCall.tool ?? 'unknown';
        const args = toolCall.args ?? {};
        const commandText = args.command || args.url || args.query || '';
        const toolKey = `${toolName}:${commandText}`;
        if (recentToolCalls.has(toolKey)) {
          toolResults.push(`Note: ${toolName} with this command was already tried. Try a completely different approach or tool.`);
          continue;
        }
        recentToolCalls.add(toolKey);
        if (recentToolCalls.size > 10) recentToolCalls.clear();

        addStep({ type: 'tool_call', content: `${toolName}: ${commandText}`, tool: toolName, command: commandText });

        let output = '';
        try {
          switch (toolName) {
            case 'run_wsl_command': {
              const result = await (window as any).suki.execInWSL(args.command ?? '');
              output = stripAnsi(result.output) || '(no output)';
              break;
            }
            case 'run_command': {
              const result = await (window as any).suki.execInPowerShell(args.command ?? '');
              output = stripAnsi(result.output) || '(no output)';
              break;
            }
            case 'browser_navigate': {
              const page = await (window as any).suki.browserFetch?.(args.url ?? '');
              output = `Navigated to ${args.url}\n${page?.text?.slice(0, 2000) ?? ''}`;
              break;
            }
            case 'search_web': {
              const results = await (window as any).suki.browserSearch?.(args.query ?? '');
              output = (results ?? []).map((item: any, index: number) => `${index + 1}. ${item.title}\n   ${item.url}\n   ${item.snippet}`).join('\n\n') || 'No results';
              break;
            }
            default:
              output = `Unsupported tool: ${toolName}`;
              break;
          }
        } catch (error: any) {
          output = `Error: ${error?.message ?? String(error)}`;
        }

        const outputFlag = detectFlag(output, challenge.flagFormat, challenge.customFlagFormat);
        if (outputFlag && isValidFlag(outputFlag, challenge.flagFormat, challenge.customFlagFormat)) {
          addStep({ type: 'flag_found', content: `FLAG FOUND IN OUTPUT: ${outputFlag}` });
          updateChallenge({ status: 'solved', flag: outputFlag, solvedAt: Date.now() });
          flagFound = true;
        }

        const summarized = await summarizeOutput(toolName, output, challenge);
        addStep({ type: 'tool_output', content: output.slice(0, 1500), tool: toolName });
        toolResults.push(`Tool ${toolName} output:\n${summarized}`);
      }

      if (flagFound) break;

      const cleanResponse = response.replace(/<tool>[\s\S]*?<\/tool>/g, '').trim();
      if (cleanResponse) {
        addStep({ type: hasToolCalls && iteration === 0 ? 'strategy' : 'reasoning', content: cleanResponse });
      }

      history.push({
        role: 'user',
        content: toolResults.length > 0
          ? `${toolResults.join('\n\n')}\n\nContinue solving. ${flagInstructions}`
          : `Continue. Try a different approach. ${flagInstructions}`,
      });
    }

    if (!flagFound && !stopSolveRef.current) {
      updateChallenge({ status: 'failed' });
      addStep({ type: 'error', content: 'Could not find the flag automatically. Review the log and try manually.' });
    }

    if (stopSolveRef.current) {
      addStep({ type: 'error', content: 'Solve stopped by user.' });
    }

    setSolving(false);
    void learnFromSolveAttempt(challenge, stepsRef.current, flagFound);
    void learnFromWriteups(challenge);
  };

  const handleCreate = async () => {
    if (!form.title.trim()) return;

    const category = form.category === 'auto'
      ? await classifyChallenge(form.title, form.description, form.url)
      : form.category as CTFCategory;

    const challenge: CTFChallenge = {
      id: Math.random().toString(36).slice(2),
      title: form.title.trim(),
      description: form.description.trim(),
      url: form.url.trim() || undefined,
      attachments: form.attachments,
      wrongFlags: [],
      category,
      flagFormat: form.flagFormat,
      customFlagFormat: form.customFlagFormat,
      points: form.points ? parseInt(form.points, 10) : undefined,
      status: 'unsolved',
      createdAt: Date.now(),
    };

    setChallenges(prev => [...prev, challenge]);
    setCurrentChallenge(challenge);
    setSolveSteps([]);
    setExpandedOutputs({});
    setShowNewModal(false);
    setForm({ title: '', description: '', url: '', category: 'auto', flagFormat: 'auto', customFlagFormat: '', points: '', attachments: [] });
  };

  const sortedKnowledge = useMemo(() => [...knowledgeBase].sort((a, b) => b.createdAt - a.createdAt), [knowledgeBase]);

  return (
    <div style={{ display: 'flex', height: '100%', background: '#0a0812', overflow: 'hidden' }}>
      <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid #2d2850', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #2d2850' }}>
          {(['challenges', 'knowledge'] as const).map(item => (
            <button
              key={item}
              onClick={() => setView(item)}
              style={{
                flex: 1,
                padding: '8px 0',
                background: 'transparent',
                color: view === item ? '#7c6ee0' : '#5a5480',
                border: 'none',
                borderBottom: `2px solid ${view === item ? '#7c6ee0' : 'transparent'}`,
                cursor: 'pointer',
                fontSize: 11,
                textTransform: 'capitalize',
                transition: 'all 0.15s ease',
              }}
            >
              {item === 'knowledge' ? `Knowledge (${knowledgeBase.length})` : `Challenges (${challenges.length})`}
            </button>
          ))}
        </div>

        {view === 'challenges' ? (
          <>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #2d2850', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#e8e4ff' }}>Challenges</span>
              <button onClick={() => setShowNewModal(true)} style={{ fontSize: 11, color: '#7c6ee0', background: 'transparent', border: '1px solid #2d2850', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}>
                + New
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {challenges.length === 0 && (
                <div style={{ padding: 16, fontSize: 12, color: '#5a5480', textAlign: 'center' }}>
                  No challenges yet.<br />Click + New to start.
                </div>
              )}
              {challenges.map(challenge => (
                <div
                  key={challenge.id}
                  onClick={() => { setCurrentChallenge(challenge); setSolveSteps([]); setExpandedOutputs({}); }}
                  style={{
                    padding: '10px 12px',
                    cursor: 'pointer',
                    background: currentChallenge?.id === challenge.id ? '#1a1730' : 'transparent',
                    borderLeft: `2px solid ${currentChallenge?.id === challenge.id ? '#7c6ee0' : 'transparent'}`,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 10 }}>{challenge.status === 'solved' ? 'Solved' : challenge.status === 'solving' ? '...' : challenge.status === 'failed' ? 'Failed' : 'New'}</span>
                    <span style={{ fontSize: 12, color: '#e8e4ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{challenge.title}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, background: `${CATEGORY_COLORS[challenge.category]}22`, color: CATEGORY_COLORS[challenge.category], borderRadius: 8, padding: '1px 6px' }}>{challenge.category}</span>
                    {challenge.points ? <span style={{ fontSize: 10, color: '#5a5480' }}>{challenge.points}pt</span> : null}
                  </div>
                  {challenge.flag ? (
                    <div style={{ fontSize: 10, color: '#3dd68c', fontFamily: 'monospace', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{challenge.flag}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {sortedKnowledge.length === 0 && (
              <div style={{ padding: 16, fontSize: 12, color: '#5a5480', textAlign: 'center' }}>
                No knowledge yet.<br />Solve challenges to build up memory.
              </div>
            )}
            {sortedKnowledge.map(item => (
              <div key={item.id} style={{ padding: '10px 12px', borderBottom: '1px solid #1a1730' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 10 }}>{item.source === 'writeup' ? 'W' : item.source === 'self_solved' ? 'S' : 'F'}</span>
                  <span style={{ fontSize: 11, color: '#e8e4ff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: `${CATEGORY_COLORS[item.category]}22`, color: CATEGORY_COLORS[item.category] }}>{item.category}</span>
                  {item.techniques.slice(0, 2).map(technique => (
                    <span key={technique} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: '#1a1730', color: '#9890c0' }}>{technique}</span>
                  ))}
                  <span style={{ fontSize: 9, color: '#5a5480', marginLeft: 'auto' }}>used {item.useCount}x</span>
                </div>
                <div style={{ fontSize: 11, color: '#5a5480', lineHeight: 1.4 }}>{item.summary.slice(0, 100)}{item.summary.length > 100 ? '...' : ''}</div>
              </div>
            ))}
            {sortedKnowledge.length > 0 ? (
              <button onClick={() => setKnowledgeBase([])} style={{ width: '100%', padding: '8px 0', background: 'transparent', color: '#e05c5c', border: 'none', fontSize: 11, cursor: 'pointer', borderTop: '1px solid #2d2850' }}>
                Clear all knowledge
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!currentChallenge ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 32 }}>CTF</div>
            <div style={{ fontSize: 14, color: '#5a5480' }}>Select a challenge or create a new one</div>
            <button onClick={() => setShowNewModal(true)} style={{ padding: '8px 20px', background: '#7c6ee0', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              + New Challenge
            </button>
          </div>
        ) : (
          <>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #2d2850', background: '#0e0c1a', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#e8e4ff' }}>{currentChallenge.title}</div>
                {solving ? (
                  <button onClick={() => { stopSolveRef.current = true; setSolving(false); }} style={{ padding: '5px 14px', background: '#e05c5c', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Stop</button>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {currentChallenge.status === 'failed' ? (
                      <button
                        onClick={() => { void solveCTF(currentChallenge); }}
                        style={{
                          padding: '5px 14px',
                          background: 'transparent',
                          color: '#f0b429',
                          border: '1px solid #f0b42944',
                          borderRadius: 6,
                          fontSize: 12,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={event => { event.currentTarget.style.background = 'rgba(240,180,41,0.1)'; }}
                        onMouseLeave={event => { event.currentTarget.style.background = 'transparent'; }}
                      >
                        ↺ Re-run
                      </button>
                    ) : null}
                    <button onClick={() => { void solveCTF(currentChallenge); }} disabled={solving} style={{ padding: '5px 14px', background: '#7c6ee0', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, cursor: solving ? 'default' : 'pointer', opacity: solving ? 0.6 : 1 }}>Auto-Solve</button>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: `${CATEGORY_COLORS[currentChallenge.category]}22`, color: CATEGORY_COLORS[currentChallenge.category], border: `1px solid ${CATEGORY_COLORS[currentChallenge.category]}44` }}>{currentChallenge.category.toUpperCase()}</span>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#1a1730', color: '#9890c0', border: '1px solid #2d2850', fontFamily: 'monospace' }}>{currentChallenge.flagFormat === 'n/a' ? 'No flag format' : currentChallenge.flagFormat === 'auto' ? 'Auto-detect' : currentChallenge.flagFormat === 'custom' ? `${currentChallenge.customFlagFormat}...}` : `${currentChallenge.flagFormat}...}`}</span>
                {currentChallenge.points ? <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#1a1730', color: '#f0b429', border: '1px solid #2d285044' }}>{currentChallenge.points} pts</span> : null}
              </div>
              {(currentChallenge.wrongFlags ?? []).length > 0 ? (
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: '#5a5480' }}>Wrong:</span>
                  {currentChallenge.wrongFlags.map(flag => (
                    <span
                      key={flag}
                      style={{
                        fontSize: 10,
                        background: 'rgba(224,92,92,0.1)',
                        color: '#e05c5c',
                        border: '1px solid rgba(224,92,92,0.2)',
                        borderRadius: 8,
                        padding: '1px 8px',
                        fontFamily: 'monospace',
                        textDecoration: 'line-through',
                      }}
                    >
                      {flag}
                    </span>
                  ))}
                </div>
              ) : null}
              {currentChallenge.description ? <div style={{ fontSize: 12, color: '#9890c0', marginTop: 8, lineHeight: 1.5 }}>{currentChallenge.description.slice(0, 200)}{currentChallenge.description.length > 200 ? '...' : ''}</div> : null}
            </div>

            <div ref={solveLogRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {solveSteps.length === 0 ? <div style={{ padding: 16, fontSize: 12, color: '#5a5480', textAlign: 'center' }}>Click "Auto-Solve" to start the AI solver</div> : null}
              {solveSteps.map(step => {
                const style = stepColors[step.type];
                const expanded = expandedOutputs[step.id] ?? step.type !== 'tool_output';
                return (
                  <div key={step.id} style={{ margin: '4px 12px', borderLeft: `2px solid ${style.color}`, background: style.bg, borderRadius: '0 6px 6px 0', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', cursor: step.type === 'tool_output' ? 'pointer' : 'default' }} onClick={() => step.type === 'tool_output' && setExpandedOutputs(prev => ({ ...prev, [step.id]: !expanded }))}>
                      <span style={{ fontSize: 11, color: style.color, fontWeight: 500 }}>{style.label}</span>
                      {step.command ? <span style={{ fontSize: 10, color: '#5a5480', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{step.command}</span> : null}
                      {step.type === 'tool_output' ? <span style={{ fontSize: 10, color: '#5a5480', marginLeft: 'auto' }}>{expanded ? 'Hide' : 'Show'}</span> : null}
                    </div>
                    {(step.type !== 'tool_output' || expanded) ? (
                      <div style={{ padding: '0 10px 8px', fontSize: 12, color: step.type === 'flag_found' ? '#3dd68c' : step.type === 'error' ? '#e05c5c' : '#9890c0', fontFamily: step.type === 'tool_output' ? 'JetBrains Mono, monospace' : 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5, maxHeight: 300, overflowY: 'auto' }}>
                        {step.content}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {solving ? <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 11, color: '#7c6ee0' }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: '#7c6ee0', animation: 'pulse 1s ease-in-out infinite' }} />AI is working...</div> : null}
            </div>

            <div style={{ padding: '12px 16px', borderTop: '1px solid #2d2850', flexShrink: 0 }}>
              <div style={{ fontSize: 11, color: '#5a5480', marginBottom: 6 }}>Flag</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={currentChallenge.flag ?? ''} onChange={event => {
                  const updated = { ...currentChallenge, flag: event.target.value };
                  setCurrentChallenge(updated);
                  setChallenges(prev => prev.map(item => item.id === updated.id ? updated : item));
                }} placeholder={currentChallenge.flagFormat === 'n/a' ? 'Answer here...' : 'CTF{flag_here}'} style={{ flex: 1, background: '#110f1e', border: `1px solid ${currentChallenge.flag ? '#3dd68c' : '#2d2850'}`, borderRadius: 6, color: currentChallenge.flag ? '#3dd68c' : '#e8e4ff', padding: '7px 10px', fontSize: 13, fontFamily: 'monospace', outline: 'none' }} />
                <button onClick={() => currentChallenge.flag && navigator.clipboard.writeText(currentChallenge.flag)} disabled={!currentChallenge.flag} style={{ padding: '7px 14px', background: '#1a1730', color: '#7c6ee0', border: '1px solid #2d2850', borderRadius: 6, fontSize: 12, cursor: 'pointer', opacity: currentChallenge.flag ? 1 : 0.4 }}>Copy</button>
                {currentChallenge.status === 'solved' && currentChallenge.flag ? (
                  <button
                    onClick={handleWrongFlag}
                    style={{
                      padding: '7px 14px',
                      background: 'transparent',
                      color: '#e05c5c',
                      border: '1px solid #e05c5c44',
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={event => {
                      event.currentTarget.style.background = 'rgba(224,92,92,0.1)';
                    }}
                    onMouseLeave={event => {
                      event.currentTarget.style.background = 'transparent';
                    }}
                  >
                    ✗ Wrong Flag
                  </button>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>

      {showNewModal ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,8,18,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={event => {
          if (event.target === event.currentTarget) {
            setShowNewModal(false);
            setForm({ title: '', description: '', url: '', category: 'auto', flagFormat: 'auto', customFlagFormat: '', points: '', attachments: [] });
          }
        }}>
          <div style={{ background: '#110f1e', border: '1px solid #2d2850', borderRadius: 12, padding: 24, width: 480, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#e8e4ff', marginBottom: 20 }}>New CTF Challenge</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: '#5a5480', marginBottom: 4 }}>Title *</div>
                <input style={inputStyle} placeholder="Challenge name" value={form.title} onChange={event => setForm(prev => ({ ...prev, title: event.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#5a5480', marginBottom: 4 }}>Description</div>
                <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} placeholder="Paste challenge description..." value={form.description} onChange={event => setForm(prev => ({ ...prev, description: event.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#5a5480', marginBottom: 4 }}>Challenge URL (optional)</div>
                <input style={inputStyle} placeholder="https://..." value={form.url} onChange={event => setForm(prev => ({ ...prev, url: event.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#5a5480', marginBottom: 4 }}>
                  Attachments (optional)
                </div>
                <div
                  onDragOver={event => {
                    event.preventDefault();
                    event.currentTarget.style.borderColor = '#7c6ee0';
                    event.currentTarget.style.background = 'rgba(124,110,224,0.05)';
                  }}
                  onDragLeave={event => {
                    event.currentTarget.style.borderColor = '#2d2850';
                    event.currentTarget.style.background = 'transparent';
                  }}
                  onDrop={async event => {
                    event.preventDefault();
                    event.currentTarget.style.borderColor = '#2d2850';
                    event.currentTarget.style.background = 'transparent';
                    const files = Array.from(event.dataTransfer.files);
                    const paths = files.map(file => (file as any).path).filter(Boolean) as string[];
                    setForm(prev => ({ ...prev, attachments: [...new Set([...prev.attachments, ...paths])] }));
                  }}
                  onClick={async () => {
                    const path = await (window as any).suki.openFile?.();
                    if (path) setForm(prev => ({ ...prev, attachments: [...new Set([...prev.attachments, path])] }));
                  }}
                  style={{
                    border: '1px dashed #2d2850',
                    borderRadius: 6,
                    padding: '12px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    color: '#5a5480',
                    fontSize: 12,
                    transition: 'all 0.15s ease',
                    background: 'transparent',
                  }}
                >
                  Drop files here or click to browse
                </div>
                {form.attachments.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                    {form.attachments.map(filePath => {
                      const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
                      return (
                        <div
                          key={filePath}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            background: '#1a1730',
                            border: '1px solid #2d2850',
                            borderRadius: 4,
                            padding: '4px 8px',
                          }}
                        >
                          <span style={{ fontSize: 11, color: '#9890c0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            📎 {fileName}
                          </span>
                          <button
                            onClick={event => {
                              event.stopPropagation();
                              setForm(prev => ({ ...prev, attachments: prev.attachments.filter(path => path !== filePath) }));
                            }}
                            style={{ background: 'transparent', border: 'none', color: '#5a5480', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' }}
                            onMouseEnter={event => { event.currentTarget.style.color = '#e05c5c'; }}
                            onMouseLeave={event => { event.currentTarget.style.color = '#5a5480'; }}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#5a5480', marginBottom: 4 }}>Category</div>
                  <select style={inputStyle} value={form.category} onChange={event => setForm(prev => ({ ...prev, category: event.target.value }))}>
                    {CATEGORIES.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#5a5480', marginBottom: 4 }}>Points</div>
                  <input style={inputStyle} type="number" placeholder="100" value={form.points} onChange={event => setForm(prev => ({ ...prev, points: event.target.value }))} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#5a5480', marginBottom: 4 }}>Flag Format</div>
                <select style={inputStyle} value={form.flagFormat} onChange={event => setForm(prev => ({ ...prev, flagFormat: event.target.value }))}>
                  {FLAG_FORMATS.map(format => <option key={format.value} value={format.value}>{format.label}</option>)}
                </select>
                {form.flagFormat === 'custom' ? <input style={{ ...inputStyle, marginTop: 6, borderColor: '#7c6ee0' }} placeholder="e.g. MYCTF{" value={form.customFlagFormat} onChange={event => setForm(prev => ({ ...prev, customFlagFormat: event.target.value }))} /> : null}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={() => { void handleCreate(); }} disabled={!form.title.trim()} style={{ flex: 1, padding: '9px 0', background: form.title.trim() ? '#7c6ee0' : '#1a1730', color: form.title.trim() ? 'white' : '#5a5480', border: 'none', borderRadius: 6, cursor: form.title.trim() ? 'pointer' : 'default', fontSize: 13, fontWeight: 500 }}>Create & Start</button>
              <button onClick={() => {
                setShowNewModal(false);
                setForm({ title: '', description: '', url: '', category: 'auto', flagFormat: 'auto', customFlagFormat: '', points: '', attachments: [] });
              }} style={{ padding: '9px 16px', background: 'transparent', color: '#9890c0', border: '1px solid #2d2850', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
