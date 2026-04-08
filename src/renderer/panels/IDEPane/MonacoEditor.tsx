import React, { useEffect, useRef } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';

export interface MonacoEditorProps {
  filePath: string | null;
  content: string;
  language: string;
  onChange: (value: string) => void;
  onSave: () => void;
}

const options = {
  fontSize: 13,
  fontFamily: 'JetBrains Mono, Fira Code, Cascadia Code, Consolas, monospace',
  fontLigatures: true,
  lineHeight: 20,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'on' as const,
  tabSize: 2,
  insertSpaces: true,
  renderWhitespace: 'selection' as const,
  smoothScrolling: true,
  cursorBlinking: 'smooth' as const,
  cursorSmoothCaretAnimation: 'on' as const,
  padding: { top: 12, bottom: 12 },
  renderLineHighlight: 'line' as const,
  bracketPairColorization: { enabled: true },
  guides: { bracketPairs: true },
};

export function defineTheme(monaco: any) {
  monaco.editor.defineTheme('void-purple', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '5a5480', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'a394f0' },
      { token: 'string', foreground: '3dd68c' },
      { token: 'number', foreground: 'f0b429' },
      { token: 'type', foreground: '7c6ee0' },
      { token: 'function', foreground: 'e8e4ff' },
      { token: 'variable', foreground: 'e8e4ff' },
    ],
    colors: {
      'editor.background': '#0a0812',
      'editor.foreground': '#e8e4ff',
      'editor.lineHighlightBackground': '#110f1e',
      'editor.selectionBackground': '#2d2850',
      'editor.inactiveSelectionBackground': '#1a1730',
      'editorLineNumber.foreground': '#2d2850',
      'editorLineNumber.activeForeground': '#5a5480',
      'editorCursor.foreground': '#7c6ee0',
      'editor.findMatchBackground': '#2d2850',
      'editorWidget.background': '#110f1e',
      'editorWidget.border': '#2d2850',
      'editorSuggestWidget.background': '#110f1e',
      'editorSuggestWidget.border': '#2d2850',
      'editorSuggestWidget.selectedBackground': '#1a1730',
      'input.background': '#1a1730',
      'input.border': '#2d2850',
      'scrollbarSlider.background': '#2d2850',
      'scrollbarSlider.hoverBackground': '#4a4480',
    },
  });
  monaco.editor.setTheme('void-purple');
}

export function getLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    md: 'markdown',
    json: 'json',
    css: 'css',
    scss: 'scss',
    html: 'html',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'shell',
    bash: 'shell',
    txt: 'plaintext',
  };
  return map[ext ?? ''] ?? 'plaintext';
}

export default function MonacoEditor({ filePath, content, language, onChange, onSave }: MonacoEditorProps) {
  const monaco = useMonaco();
  const editorRef = useRef<any>(null);

  useEffect(() => {
    if (!monaco) return;
    defineTheme(monaco);
  }, [monaco]);

  const handleMount = (editor: any, monacoInstance: any) => {
    editorRef.current = editor;
    defineTheme(monacoInstance);
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => onSave());
  };

  return (
    <Editor
      key={filePath ?? 'empty'}
      path={filePath ?? undefined}
      value={content}
      language={language}
      onMount={handleMount}
      onChange={value => onChange(value ?? '')}
      theme="void-purple"
      options={options}
      height="100%"
    />
  );
}
