import React, { useEffect, useMemo, useState } from 'react';
import Cell, { NotebookCellRecord } from './Cell';

interface NotebookRecord {
  id: string;
  name: string;
  created_at: number;
}

function escapeArg(source: string) {
  return JSON.stringify(source);
}

function buildCommand(language: string, source: string) {
  if (language === 'javascript') return `node -e ${escapeArg(source)}`;
  if (language === 'bash') return source;
  return `python -c ${escapeArg(source)}`;
}

export default function NotebookPane() {
  const [notebooks, setNotebooks] = useState<NotebookRecord[]>([]);
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [cells, setCells] = useState<NotebookCellRecord[]>([]);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());

  const activeNotebook = useMemo(
    () => notebooks.find(notebook => notebook.id === activeNotebookId) ?? null,
    [activeNotebookId, notebooks],
  );

  const loadCells = async (notebookId: string) => {
    let rows = await (window as any).suki.getCells(notebookId) as NotebookCellRecord[];
    if (rows.length === 0) {
      await (window as any).suki.createCell({ notebook_id: notebookId, language: 'python', source: '', position: 0 });
      rows = await (window as any).suki.getCells(notebookId);
    }
    setCells(rows);
  };

  useEffect(() => {
    const init = async () => {
      let rows = await (window as any).suki.getNotebooks() as NotebookRecord[];
      if (rows.length === 0) {
        await (window as any).suki.createNotebook('Notebook 1');
        rows = await (window as any).suki.getNotebooks();
      }
      setNotebooks(rows);
      if (rows[0]) {
        setActiveNotebookId(rows[0].id);
        await loadCells(rows[0].id);
      }
    };
    void init();
  }, []);

  const addNotebook = async () => {
    const name = `Notebook ${notebooks.length + 1}`;
    const id = await (window as any).suki.createNotebook(name);
    const rows = await (window as any).suki.getNotebooks() as NotebookRecord[];
    setNotebooks(rows);
    setActiveNotebookId(id);
    await loadCells(id);
  };

  const addCell = async (position = cells.length) => {
    if (!activeNotebookId) return;
    await (window as any).suki.createCell({ notebook_id: activeNotebookId, language: 'python', source: '', position });
    await loadCells(activeNotebookId);
  };

  const updateCell = async (id: string, patch: Partial<NotebookCellRecord>) => {
    setCells(prev => prev.map(cell => cell.id === id ? { ...cell, ...patch } : cell));
    await (window as any).suki.updateCell(id, patch);
  };

  const deleteCell = async (id: string) => {
    await (window as any).suki.deleteCell(id);
    if (activeNotebookId) await loadCells(activeNotebookId);
  };

  const runCell = async (cell: NotebookCellRecord) => {
    setRunningIds(prev => new Set(prev).add(cell.id));
    try {
      const result = await (window as any).suki.execCommand(buildCommand(cell.language, cell.source), '.');
      const outputType = result.success ? 'text' : 'error';
      await updateCell(cell.id, { output: result.output, output_type: outputType });
    } finally {
      setRunningIds(prev => {
        const next = new Set(prev);
        next.delete(cell.id);
        return next;
      });
    }
  };

  const runAll = async () => {
    for (const cell of cells) {
      // eslint-disable-next-line no-await-in-loop
      await runCell(cell);
    }
  };

  return (
    <div className="animate-fade-in-up" style={{ height: '100%', display: 'flex', background: '#0a0812' }}>
      <div style={{ width: 200, borderRight: '1px solid #2d2850', display: 'flex', flexDirection: 'column' }}>
        <button onClick={() => void addNotebook()} style={{ height: 40, borderBottom: '1px solid #2d2850', color: '#7c6ee0', fontSize: 12 }}>
          + New Notebook
        </button>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {notebooks.map(notebook => (
            <button
              key={notebook.id}
              onClick={() => {
                setActiveNotebookId(notebook.id);
                void loadCells(notebook.id);
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                background: activeNotebookId === notebook.id ? '#1a1730' : 'transparent',
                color: activeNotebookId === notebook.id ? '#e8e4ff' : '#9890c0',
              }}
            >
              {notebook.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 40, flexShrink: 0, background: '#0e0c1a', borderBottom: '1px solid #2d2850', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px' }}>
          <div style={{ color: '#e8e4ff' }}>{activeNotebook?.name ?? 'Notebook'}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => void addCell()} style={{ color: '#5a5480', fontSize: 12 }}>+ Add Cell</button>
            <button onClick={() => void runAll()} style={{ color: '#7c6ee0', fontSize: 12 }}>▶▶ Run All</button>
            <button onClick={() => setCells(prev => prev.map(cell => ({ ...cell, output: '', output_type: 'text' })))} style={{ color: '#5a5480', fontSize: 12 }}>🗑 Clear All Output</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {cells.map((cell, index) => (
            <React.Fragment key={cell.id}>
              <Cell
                cell={cell}
                index={index}
                running={runningIds.has(cell.id)}
                onChange={patch => { void updateCell(cell.id, patch); }}
                onDelete={() => { void deleteCell(cell.id); }}
                onRun={() => { void runCell(cell); }}
                onClearOutput={() => { void updateCell(cell.id, { output: '', output_type: 'text' }); }}
              />
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                <button onClick={() => void addCell(index + 1)} style={{ color: '#5a5480', fontSize: 18 }}>+</button>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
