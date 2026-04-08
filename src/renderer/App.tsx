import React, { useState, useEffect } from 'react';
import SetupScreen from './panels/SetupScreen';
import TabCarousel from './panels/BrowserPane/TabCarousel';
import NavBar from './panels/BrowserPane/NavBar';
import AISidebar from './panels/AISidebar/index';
import IDEPane from './panels/IDEPane/index';
import NotebookPane from './panels/NotebookPane/index';
import NotesPane from './panels/NotesPane/index';
import TasksPane from './panels/TasksPane/index';
import CalendarPane from './panels/CalendarPane/index';
import TerminalPane from './panels/TerminalPane/index';
import BuildRunner from './panels/BuildRunner/index';

export type PanelType = 'browser' | 'ide' | 'notebook' | 'notes' | 'tasks' | 'calendar' | 'terminal' | 'build';

export default function App() {
  const [mode, setMode] = useState<'loading' | 'setup' | 'main'>('loading');
  const [activePanel, setActivePanel] = useState<PanelType>('browser');

  useEffect(() => {
    const cleanup = (window as any).suki?.onSetupState?.((screen: 'setup' | 'main') => {
      setMode(screen);
    });

    (window as any).suki?.hasKeys().then((has: boolean) => {
      setMode(current => current === 'loading' ? (has ? 'main' : 'setup') : current);
    });

    return () => cleanup?.();
  }, []);

  if (mode === 'loading') return <div style={{ background: '#0d0d0f', height: '100vh' }} />;
  if (mode === 'setup') return <SetupScreen onComplete={() => setMode('main')} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d0d0f', overflow: 'hidden' }}>
      <div style={{ display: 'flex', height: 44, flexShrink: 0 }}>
        <div style={{ width: 72, background: '#0d0d0f', borderRight: '1px solid #2a2a33' }} />
        <NavBar />
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <TabCarousel />
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', pointerEvents: activePanel === 'browser' ? 'none' : 'auto' }}>
          {activePanel === 'ide' && <IDEPane />}
          {activePanel === 'notebook' && <NotebookPane />}
          {activePanel === 'notes' && <NotesPane />}
          {activePanel === 'tasks' && <TasksPane />}
          {activePanel === 'calendar' && <CalendarPane />}
          {activePanel === 'terminal' && <TerminalPane />}
          {activePanel === 'build' && <BuildRunner />}
        </div>
        <AISidebar />
      </div>

      <div style={{ height: 40, background: '#0d0d0f', borderTop: '1px solid #2a2a33', display: 'flex', alignItems: 'center', paddingLeft: 72 }}>
        {(['browser','ide','notebook','notes','tasks','calendar','terminal','build'] as PanelType[]).map(panel => (
          <button
            key={panel}
            onClick={() => setActivePanel(panel)}
            style={{
              padding: '4px 12px',
              background: activePanel === panel ? '#1a1a20' : 'transparent',
              color: activePanel === panel ? '#00ffe7' : '#8a8a96',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              borderRadius: 4,
              textTransform: 'capitalize',
            }}
          >
            {panel}
          </button>
        ))}
      </div>
    </div>
  );
}
