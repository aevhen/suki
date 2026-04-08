import React, { useState } from 'react';
import TabCarousel from './panels/BrowserPane/TabCarousel';
import NavBar from './panels/BrowserPane/NavBar';
import AISidebar from './panels/AISidebar/index';
import APIModal from './panels/APIModal';
import IDEPane from './panels/IDEPane/index';
import NotebookPane from './panels/NotebookPane/index';
import NotesPane from './panels/NotesPane/index';
import TasksPane from './panels/TasksPane/index';
import CalendarPane from './panels/CalendarPane/index';
import TerminalPane from './panels/TerminalPane/index';
import BuildRunner from './panels/BuildRunner/index';

export type PanelType = 'browser' | 'ide' | 'notebook' | 'notes' | 'tasks' | 'calendar' | 'terminal' | 'build';

export default function App() {
  const [activePanel, setActivePanel] = useState<PanelType>('browser');
  const [showAPIModal, setShowAPIModal] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0812', overflow: 'hidden' }}>
      <div style={{ display: 'flex', height: 44, flexShrink: 0 }}>
        <div style={{ width: 72, background: '#0a0812', borderRight: '1px solid #2d2850' }} />
        <NavBar />
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <TabCarousel />
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', pointerEvents: activePanel === 'browser' ? 'none' : 'auto' }}>
          <div
            key={activePanel}
            className="animate-fade-in-up"
            style={{ flex: 1, height: '100%', overflow: 'hidden' }}
          >
            {activePanel === 'ide' && <IDEPane />}
            {activePanel === 'notebook' && <NotebookPane />}
            {activePanel === 'notes' && <NotesPane />}
            {activePanel === 'tasks' && <TasksPane />}
            {activePanel === 'calendar' && <CalendarPane />}
            {activePanel === 'terminal' && <TerminalPane />}
            {activePanel === 'build' && <BuildRunner />}
          </div>
        </div>
        <AISidebar />
      </div>

      <div style={{ height: 40, background: '#0a0812', borderTop: '1px solid #2d2850', display: 'flex', alignItems: 'center', paddingLeft: 72 }}>
        {(['browser','ide','notebook','notes','tasks','calendar','terminal','build'] as PanelType[]).map(panel => (
          <button
            key={panel}
            className="panel-switcher-button"
            onClick={() => setActivePanel(panel)}
            style={{
              padding: '4px 12px',
              background: activePanel === panel ? '#1a1730' : 'transparent',
              color: activePanel === panel ? '#7c6ee0' : '#9890c0',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              borderRadius: 4,
              textTransform: 'capitalize',
              transition: 'all 0.15s ease',
              transform: activePanel === panel ? 'translateY(-1px)' : 'translateY(0)',
            }}
          >
            {panel}
          </button>
        ))}
        <button
          className="panel-switcher-button"
          onClick={() => setShowAPIModal(true)}
          style={{
            padding: '4px 12px',
            background: showAPIModal ? '#1a1730' : 'transparent',
            color: showAPIModal ? '#7c6ee0' : '#9890c0',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            borderRadius: 4,
            transition: 'all 0.15s ease',
            transform: showAPIModal ? 'translateY(-1px)' : 'translateY(0)',
          }}
        >
          APIs
        </button>
      </div>
      {showAPIModal && <APIModal onClose={() => setShowAPIModal(false)} />}
    </div>
  );
}
