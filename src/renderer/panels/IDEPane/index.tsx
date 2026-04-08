import React, { useCallback, useMemo, useRef, useState } from 'react';
import FileTree from './FileTree';
import MonacoEditor, { getLanguage } from './MonacoEditor';
import { stripAnsi } from '../../utils/stripAnsi';

interface OpenFile {
  path: string;
  content: string;
  savedContent: string;
  language: string;
}

interface BuildIteration {
  iteration: number;
  prompt: string;
  generatedCode: string;
  executionOutput: string;
  success: boolean;
  improvement: string;
}

function getName(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

function getProjectName(path: string | null): string {
  if (!path) return 'Open Folder';
  return getName(path);
}

function getDotColor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: '#7c6ee0',
    tsx: '#7c6ee0',
    js: '#f0b429',
    jsx: '#f0b429',
    py: '#3dd68c',
    json: '#60a8e0',
    md: '#9890c0',
    css: '#e8638e',
    scss: '#e8638e',
  };
  return map[ext] ?? '#5a5480';
}

function detectServerURL(output: string): string | null {
  const patterns = [
    /localhost:(\d+)/i,
    /127\.0\.0\.1:(\d+)/i,
    /http:\/\/localhost:(\d+)/i,
    /running on.*?http:\/\/([^\s]+)/i,
    /started.*?on port (\d+)/i,
    /listening on.*?:(\d+)/i,
    /server.*?http:\/\/([^\s]+)/i,
    /local:.*?http:\/\/([^\s]+)/i,
    /ready.*?http:\/\/([^\s]+)/i,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (!match) continue;
    if (match[1]?.includes('localhost') || match[1]?.includes('127.0.0.1')) {
      return match[1].startsWith('http') ? match[1] : `http://${match[1]}`;
    }
    const portMatch = output.match(/:(\d{4,5})/) ?? output.match(/\b(\d{4,5})\b/);
    if (portMatch?.[1]) {
      return `http://localhost:${portMatch[1]}`;
    }
  }

  return null;
}

function isDevServer(cmd: string): boolean {
  return /npm run dev|npm start|vite|next dev|react-scripts start|uvicorn|flask run|python -m http/i.test(cmd);
}

function detectPort(cmd: string, output = ''): string {
  const fromUrl = cmd.match(/localhost:(\d{2,5})/i)?.[1]
    ?? output.match(/localhost:(\d{2,5})/i)?.[1]
    ?? output.match(/127\.0\.0\.1:(\d{2,5})/i)?.[1];
  if (fromUrl) return fromUrl;

  const explicit = cmd.match(/(?:--port|-p)\s+(\d{2,5})/i)?.[1]
    ?? output.match(/port\s+(\d{2,5})/i)?.[1]
    ?? output.match(/:(\d{4,5})/)?.[1];
  return explicit ?? '3000';
}

function getRunCommand(activeFilePath: string, language: string): string {
  const name = getName(activeFilePath).toLowerCase();
  if (name === 'package.json') return 'npm run dev';
  if (language === 'python') return `python "${activeFilePath}"`;
  if (language === 'typescript') return `npx ts-node "${activeFilePath}"`;
  if (language === 'javascript') return `node "${activeFilePath}"`;
  return '';
}

export default function IDEPane() {
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [aiBuildMode, setAIBuildMode] = useState(false);
  const [buildPrompt, setBuildPrompt] = useState('');
  const [uploadedContext, setUploadedContext] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [autoRun, setAutoRun] = useState(true);
  const [buildRunning, setBuildRunning] = useState(false);
  const [iterations, setIterations] = useState<BuildIteration[]>([]);
  const [currentIteration, setCurrentIteration] = useState(0);
  const [stopReason, setStopReason] = useState('');
  const stopRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeFile = useMemo(
    () => openFiles.find(file => file.path === activeFilePath) ?? null,
    [activeFilePath, openFiles],
  );

  const openFolder = useCallback(async () => {
    const root = await (window as any).suki.openFolder();
    if (!root) return;
    setProjectRoot(root);
  }, []);

  const handleProjectRootChange = (root: string | null) => {
    setProjectRoot(root);
  };

  const handleSelectFile = useCallback(async (path: string) => {
    const existing = openFiles.find(file => file.path === path);
    if (existing) {
      setActiveFilePath(path);
      return;
    }

    setLoadingFile(path);
    try {
      const content = await (window as any).suki.readFile(path);
      const nextFile = {
        path,
        content,
        savedContent: content,
        language: getLanguage(path),
      } satisfies OpenFile;

      setOpenFiles(prev => [...prev, nextFile]);
      setActiveFilePath(path);
    } finally {
      setLoadingFile(null);
    }
  }, [openFiles]);

  const updateActiveContent = (value: string) => {
    if (!activeFilePath) return;
    setOpenFiles(prev => prev.map(file => (
      file.path === activeFilePath ? { ...file, content: value } : file
    )));
  };

  const saveActiveFile = useCallback(async () => {
    if (!activeFile) return;
    await (window as any).suki.writeFile(activeFile.path, activeFile.content);
    setOpenFiles(prev => prev.map(file => (
      file.path === activeFile.path ? { ...file, savedContent: file.content } : file
    )));
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1500);
  }, [activeFile]);

  const closeFileTab = async (path: string) => {
    const file = openFiles.find(item => item.path === path);
    if (!file) return;

    if (file.content !== file.savedContent) {
      const shouldSave = window.confirm(`Save changes to ${getName(path)} before closing?`);
      if (shouldSave) {
        await (window as any).suki.writeFile(file.path, file.content);
      }
    }

    setOpenFiles(prev => {
      const remaining = prev.filter(item => item.path !== path);
      setActiveFilePath(current => {
        if (current !== path) return current;
        return remaining[remaining.length - 1]?.path ?? null;
      });
      return remaining;
    });
  };

  const handleUploadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const electronPath = (file as File & { path?: string }).path;
    setUploadedFileName(file.name);

    if (file.name.toLowerCase().endsWith('.pdf')) {
      setUploadedContext(`PDF context file: ${file.name}`);
    } else if (electronPath) {
      const content = await (window as any).suki.readFile(electronPath);
      setUploadedContext(content);
    } else {
      setUploadedContext(await file.text());
    }

    event.target.value = '';
  };

  const maybeOpenServer = async (execOutput: string, iterResult: BuildIteration) => {
    if (!execOutput) return;
    const serverURL = detectServerURL(execOutput);
    if (!serverURL) return;

    window.setTimeout(async () => {
      await (window as any).suki.openInBrowser(serverURL);
    }, 1500);

    setIterations(prev => [...prev, { ...iterResult, improvement: `Server detected at ${serverURL} - opening in browser` }]);
  };

  const checkIfComplete = async (
    originalPrompt: string,
    code: string,
    executionOutput: string,
    iterationNumber: number,
  ): Promise<{ complete: boolean; reason: string }> => {
    if (!executionOutput && iterationNumber > 0) {
      return { complete: true, reason: 'Server started successfully' };
    }

    const evalPrompt = `You are evaluating whether code is working correctly.

Original request: ${originalPrompt}

Current code:
\`\`\`
${code.slice(0, 2000)}
\`\`\`

Execution output:
${executionOutput.slice(0, 1000)}

Answer with ONLY a JSON object in this exact format, nothing else:
{"complete": true/false, "reason": "brief explanation"}

Return complete: true if:
- The output shows the program ran successfully without errors
- The output matches what was requested
- A server started successfully
- Tests passed

Return complete: false if:
- There are error messages or exceptions
- The output is empty when output was expected
- The program crashed
- The behavior doesn't match the original request`;

    try {
      const response = await (window as any).suki.query('reasoning', [{ role: 'user', content: evalPrompt }]);
      const jsonMatch = response.match(/\{[^}]+\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          complete: Boolean(parsed.complete),
          reason: String(parsed.reason ?? ''),
        };
      }
    } catch {
      // Fall back to heuristics below.
    }

    const hasError = /error|exception|traceback|failed|cannot|undefined is not|typeerror|syntaxerror/i.test(executionOutput);
    const hasSuccess = /success|running|started|listening|done|complete|passed/i.test(executionOutput);

    if (hasError) return { complete: false, reason: 'Errors detected in output' };
    if (hasSuccess) return { complete: true, reason: 'Success indicators found' };
    return { complete: iterationNumber >= 3, reason: 'No clear success or failure signals' };
  };

  const runAIBuildLoop = async () => {
    if (!buildPrompt.trim() || !activeFilePath) return;
    setBuildRunning(true);
    stopRef.current = false;
    setIterations([]);
    setStopReason('');
    setCurrentIteration(0);

    let currentCode = await (window as any).suki.readFile(activeFilePath);
    let lastOutput = '';
    let lastError = '';
    const HARD_LIMIT = 20;

    for (let i = 0; i < HARD_LIMIT; i += 1) {
      if (stopRef.current) {
        setStopReason('Stopped by user');
        break;
      }
      setCurrentIteration(i + 1);

      const iterationPrompt = `
You are an expert software engineer improving code iteratively.

Original request: ${buildPrompt}

${uploadedContext ? `Additional context from uploaded file:\n${uploadedContext}\n` : ''}

Current code (iteration ${i + 1}/${HARD_LIMIT}):
\`\`\`
${currentCode}
\`\`\`

${lastOutput ? `Last execution output:\n${lastOutput}\n` : ''}
${lastError ? `Last error:\n${lastError}\n` : ''}

${i === 0
    ? 'Generate the initial implementation based on the request.'
    : 'Improve the code based on the execution output above. Fix any errors, improve performance, add missing features from the original request.'}

Rules:
- Output ONLY the complete improved code, no explanations
- Do not include markdown code fences
- The code must be complete and runnable
- Learn from the previous execution output to make targeted improvements
`;

      const messages = [{ role: 'user' as const, content: iterationPrompt }];
      let newCode = '';
      try {
        newCode = await (window as any).suki.query('coding', messages);
        newCode = newCode.replace(/^```[\w]*\n?/gm, '').replace(/```$/gm, '').trim();
      } catch {
        setStopReason('Code generation failed');
        break;
      }

      await (window as any).suki.writeFile(activeFilePath, newCode);
      currentCode = newCode;

      setOpenFiles(prev => prev.map(file => (
        file.path === activeFilePath ? { ...file, content: newCode, savedContent: newCode } : file
      )));

      let execOutput = '';
      let execSuccess = false;
      if (autoRun) {
        try {
          const lang = getLanguage(activeFilePath);
          const runCmd = getRunCommand(activeFilePath, lang);

          if (runCmd) {
            if (isDevServer(runCmd)) {
              const termId = `ai-build-server-${Date.now()}`;
              const port = detectPort(runCmd);
              await (window as any).suki.spawnTerminal(termId);
              await (window as any).suki.writeTerminal(termId, `${runCmd}\r`);

              let attempts = 0;
              while (attempts < 30 && !stopRef.current) {
                await new Promise(resolve => window.setTimeout(resolve, 1000));
                try {
                  const response = await fetch(`http://localhost:${port}`);
                  if (response.ok || response.status < 500) {
                    await (window as any).suki.openInBrowser(`http://localhost:${port}`);
                    break;
                  }
                } catch {
                  attempts += 1;
                }
              }

              execSuccess = true;
              execOutput = `Dev server starting on port ${port}...`;
              lastOutput = execOutput;
              lastError = '';
            } else {
              const result = await (window as any).suki.execCommand(runCmd, projectRoot ?? '.');
              execOutput = stripAnsi(result.output);
              execSuccess = result.success;
              lastOutput = execOutput;
              lastError = execSuccess ? '' : execOutput;
            }
          } else {
            execSuccess = true;
            lastOutput = 'File saved (no auto-run for this file type)';
            lastError = '';
          }
        } catch (err: any) {
          execOutput = stripAnsi(err?.message ?? 'Execution failed');
          lastError = execOutput;
        }
      } else {
        execSuccess = true;
      }

      const { complete, reason } = await checkIfComplete(buildPrompt, currentCode, execOutput, i);

      const iterResult: BuildIteration = {
        iteration: i + 1,
        prompt: iterationPrompt,
        generatedCode: newCode,
        executionOutput: execOutput,
        success: execSuccess && complete,
        improvement: complete ? `Complete: ${reason}` : `Improving: ${reason}`,
      };
      setIterations(prev => [...prev, iterResult]);
      await maybeOpenServer(execOutput, iterResult);

      if (complete) {
        setStopReason(`Completed after ${i + 1} iteration${i === 0 ? '' : 's'}: ${reason}`);
        break;
      }

      if (i === HARD_LIMIT - 1) {
        setStopReason(`Reached safety limit of ${HARD_LIMIT} iterations`);
      }

      await new Promise(resolve => window.setTimeout(resolve, 500));
    }

    setBuildRunning(false);
  };

  return (
    <div
      className="animate-fade-in-up"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#0a0812',
        color: '#e8e4ff',
      }}
    >
      <div
        style={{
          height: 36,
          flexShrink: 0,
          background: '#0e0c1a',
          borderBottom: '1px solid #2d2850',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          fontSize: 12,
          gap: 12,
        }}
      >
        <button
          onClick={openFolder}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: '#9890c0',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={event => {
            event.currentTarget.style.color = '#e8e4ff';
          }}
          onMouseLeave={event => {
            event.currentTarget.style.color = '#9890c0';
          }}
        >
          <span style={{ color: '#7c6ee0' }}>[ ]</span>
          <span>{getProjectName(projectRoot)}</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={{ color: '#5a5480', fontSize: 14 }}>Search</button>
          <button
            onClick={() => setAIBuildMode(prev => !prev)}
            style={{
              background: aiBuildMode ? '#7c6ee0' : '#1a1730',
              color: aiBuildMode ? '#ffffff' : '#7c6ee0',
              border: '1px solid #2d2850',
              borderRadius: 6,
              padding: '4px 12px',
              fontSize: 12,
            }}
          >
            AI Build
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <FileTree
          projectRoot={projectRoot}
          selectedFile={activeFilePath}
          onSelectFile={handleSelectFile}
          onProjectRootChange={handleProjectRootChange}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <div
            style={{
              height: 36,
              flexShrink: 0,
              background: '#0a0812',
              borderBottom: '1px solid #2d2850',
              display: 'flex',
              alignItems: 'stretch',
              overflowX: 'auto',
              overflowY: 'hidden',
            }}
          >
            {openFiles.map(file => {
              const isActive = file.path === activeFilePath;
              const isDirty = file.content !== file.savedContent;
              return (
                <button
                  key={file.path}
                  onClick={() => setActiveFilePath(file.path)}
                  style={{
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '0 12px',
                    flexShrink: 0,
                    color: isActive ? '#e8e4ff' : '#9890c0',
                    borderBottom: `2px solid ${isActive ? '#7c6ee0' : 'transparent'}`,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={event => {
                    if (!isActive) event.currentTarget.style.background = '#110f1e';
                  }}
                  onMouseLeave={event => {
                    if (!isActive) event.currentTarget.style.background = 'transparent';
                  }}
                  title={file.path}
                >
                  {isDirty && <span style={{ color: '#f0b429' }}>•</span>}
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: getDotColor(file.path) }} />
                  <span>{getName(file.path)}</span>
                  <span
                    onClick={event => {
                      event.stopPropagation();
                      void closeFileTab(file.path);
                    }}
                    style={{ color: '#5a5480', fontSize: 14 }}
                  >
                    ×
                  </span>
                </button>
              );
            })}
          </div>

          <div style={{ flex: 1, position: 'relative', minHeight: 0, background: '#0a0812' }}>
            {savedFlash && (
              <div
                className="animate-fade-in-down"
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  zIndex: 10,
                  background: '#3dd68c',
                  color: '#0a0812',
                  padding: '4px 10px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Saved
              </div>
            )}

            {activeFile ? (
              <MonacoEditor
                filePath={activeFile.path}
                content={activeFile.content}
                language={activeFile.language}
                onChange={updateActiveContent}
                onSave={() => {
                  void saveActiveFile();
                }}
              />
            ) : (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  color: '#5a5480',
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 32, color: '#7c6ee0', opacity: 0.5 }}>Suki</div>
                <div>{loadingFile ? `Opening ${getName(loadingFile)}...` : 'Open a folder to get started'}</div>
              </div>
            )}
          </div>

          <div
            style={{
              height: aiBuildMode ? 280 : 0,
              transition: 'height 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              background: '#0e0c1a',
              borderTop: '1px solid #2d2850',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', borderBottom: '1px solid #2d2850' }}>
                <div style={{ color: '#e8e4ff', fontSize: 13, fontWeight: 500 }}>AI BUILD MODE</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => {
                      stopRef.current = true;
                      setBuildRunning(false);
                    }}
                    style={{ color: '#9890c0', border: '1px solid #2d2850', borderRadius: 6, padding: '4px 10px', fontSize: 12 }}
                  >
                    Stop
                  </button>
                  <button
                    onClick={() => { void runAIBuildLoop(); }}
                    disabled={buildRunning || !buildPrompt.trim() || !activeFilePath}
                    style={{
                      background: buildRunning || !buildPrompt.trim() || !activeFilePath ? '#5548b0' : '#7c6ee0',
                      color: '#ffffff',
                      borderRadius: 6,
                      padding: '4px 12px',
                      fontSize: 12,
                      opacity: buildRunning || !buildPrompt.trim() || !activeFilePath ? 0.6 : 1,
                    }}
                  >
                    {buildRunning ? 'Running...' : '▶ Run'}
                  </button>
                </div>
              </div>

              <div style={{ padding: 12, display: 'grid', gap: 12, flex: 1, minHeight: 0 }}>
                <div>
                  <div style={{ color: '#9890c0', fontSize: 12, marginBottom: 6 }}>Prompt:</div>
                  <textarea
                    value={buildPrompt}
                    onChange={event => setBuildPrompt(event.target.value)}
                    placeholder="Describe what you want to build or improve..."
                    style={{
                      width: '100%',
                      minHeight: 70,
                      resize: 'none',
                      background: '#110f1e',
                      border: '1px solid #2d2850',
                      borderRadius: 6,
                      color: '#e8e4ff',
                      padding: 10,
                      fontSize: 12,
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.pdf,.ts,.js,.py,.json"
                    onChange={event => { void handleUploadFile(event); }}
                    style={{ display: 'none' }}
                  />
                  <button onClick={() => fileInputRef.current?.click()} style={{ color: '#9890c0', border: '1px solid #2d2850', borderRadius: 6, padding: '4px 10px', fontSize: 12 }}>
                    [Upload file]
                  </button>
                  {uploadedFileName ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1a1730', color: '#7c6ee0', borderRadius: 12, padding: '2px 8px', fontSize: 11 }}>
                      {uploadedFileName}
                      <button onClick={() => { setUploadedFileName(''); setUploadedContext(''); }}>×</button>
                    </span>
                  ) : null}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#9890c0', fontSize: 12 }}>
                    <input type="checkbox" checked={autoRun} onChange={event => setAutoRun(event.target.checked)} />
                    Auto-run after each generation
                  </label>
                </div>

                <div style={{ borderTop: '1px solid #2d2850', paddingTop: 8, overflowY: 'auto', minHeight: 0 }}>
                  <div style={{ color: '#9890c0', fontSize: 12, marginBottom: 8 }}>Progress</div>
                  {buildRunning && (
                    <div style={{ padding: '4px 12px' }}>
                      <div style={{ height: 3, background: '#2d2850', borderRadius: 2, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${(currentIteration / 20) * 100}%`,
                            background: '#7c6ee0',
                            transition: 'width 0.5s ease',
                            borderRadius: 2,
                          }}
                        />
                      </div>
                      <div style={{ color: '#5a5480', fontSize: 11, marginTop: 4 }}>
                        {`Iteration ${currentIteration}/20...`}
                      </div>
                    </div>
                  )}

                  {!buildRunning && stopReason && (
                    <div
                      style={{
                        padding: '6px 12px',
                        fontSize: 12,
                        color: stopReason.includes('Completed') ? '#3dd68c' : '#f0b429',
                        animation: 'fadeInUp 0.2s ease-out',
                      }}
                    >
                      {stopReason.includes('Completed') ? '✓' : '⚠'} {stopReason}
                    </div>
                  )}

                  {iterations.map(iter => (
                    <div
                      key={iter.iteration}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '4px 12px',
                        fontSize: 12,
                        animation: 'fadeInUp 0.2s ease-out',
                      }}
                    >
                      <span style={{ color: '#5a5480' }}>{`Iteration ${iter.iteration}:`}</span>
                      <span style={{ color: iter.success ? '#3dd68c' : '#e05c5c' }}>
                        {iter.success ? '✓ Success' : '✗ Failed'}
                      </span>
                      {iter.executionOutput && (
                        <span style={{ color: '#5a5480', fontSize: 11, marginLeft: 'auto' }}>
                          {iter.executionOutput.slice(0, 60)}{iter.executionOutput.length > 60 ? '...' : ''}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
