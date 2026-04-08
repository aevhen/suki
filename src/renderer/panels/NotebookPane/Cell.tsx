import React, { useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { defineTheme } from '../IDEPane/MonacoEditor';

export interface NotebookCellRecord {
  id: string;
  notebook_id: string;
  position: number;
  language: string;
  source: string;
  output: string;
  output_type: string;
  created_at: number;
}

interface Props {
  cell: NotebookCellRecord;
  index: number;
  onChange: (patch: Partial<NotebookCellRecord>) => void;
  onDelete: () => void;
  onRun: () => void;
  onClearOutput: () => void;
  running: boolean;
}

function getEditorHeight(source: string) {
  const lineCount = Math.max(3, source.split('\n').length);
  return lineCount * 20 + 24;
}

export default function Cell({ cell, index, onChange, onDelete, onRun, onClearOutput, running }: Props) {
  const [hovered, setHovered] = useState(false);
  const height = useMemo(() => getEditorHeight(cell.source || ''), [cell.source]);

  useEffect(() => {
    return () => {
      // No-op cleanup keeps React strict mode from complaining in nested editors.
    };
  }, []);

  return (
    <div
      className="animate-fade-in-up"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ background: '#0e0c1a', border: '1px solid #2d2850', borderRadius: 8, marginBottom: 12, transition: 'border-color 0.15s ease' }}
    >
      <div style={{ height: 32, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', borderBottom: '1px solid #2d2850' }}>
        <button onClick={onRun} style={{ width: 24, height: 24, borderRadius: 4, background: '#7c6ee0', color: '#fff', fontSize: 11 }}>
          {running ? '…' : '▶'}
        </button>
        <select value={cell.language} onChange={event => onChange({ language: event.target.value })} style={{ background: '#110f1e', border: '1px solid #2d2850', color: '#9890c0', fontSize: 11, borderRadius: 4, padding: '2px 6px' }}>
          <option value="python">python</option>
          <option value="javascript">javascript</option>
          <option value="bash">bash</option>
        </select>
        <span style={{ color: '#5a5480', fontSize: 11 }}>{`Cell ${index + 1}`}</span>
        {hovered && <button onClick={onDelete} style={{ marginLeft: 'auto', color: '#5a5480', fontSize: 14 }}>×</button>}
      </div>

      <div style={{ minHeight: 60, height }}>
        <Editor
          path={cell.id}
          value={cell.source}
          language={cell.language === 'javascript' ? 'javascript' : cell.language === 'bash' ? 'shell' : 'python'}
          height={height}
          onMount={(_, monaco) => defineTheme(monaco)}
          onChange={value => onChange({ source: value ?? '' })}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: (cell.source.split('\n').length < 5 ? 'off' : 'on'),
            scrollBeyondLastLine: false,
            padding: { top: 12, bottom: 12 },
          }}
          theme="void-purple"
        />
      </div>

      {cell.output ? (
        <div style={{ background: '#0e0c1a', borderTop: '1px solid #2d2850', borderRadius: '0 0 8px 8px', padding: '8px 12px', position: 'relative', fontFamily: 'JetBrains Mono, Fira Code, Cascadia Code, Consolas, monospace', fontSize: 12 }}>
          <button onClick={onClearOutput} style={{ position: 'absolute', top: 8, right: 8, color: '#5a5480' }}>×</button>
          {cell.output_type === 'image' ? (
            <img src={cell.output} alt="Cell output" style={{ maxWidth: '100%' }} />
          ) : (
            <pre style={{ whiteSpace: 'pre-wrap', color: cell.output_type === 'error' ? '#e05c5c' : '#e8e4ff' }}>{cell.output}</pre>
          )}
        </div>
      ) : null}
    </div>
  );
}
