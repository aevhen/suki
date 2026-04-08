import React, { useState, useEffect } from 'react';
import IDEPane from './panels/IDEPane/index';
import NotebookPane from './panels/NotebookPane/index';
import NotesPane from './panels/NotesPane/index';
import TasksPane from './panels/TasksPane/index';
import CalendarPane from './panels/CalendarPane/index';
import TerminalPane from './panels/TerminalPane/index';
import TabCarousel from './panels/BrowserPane/TabCarousel';
import NavBar from './panels/BrowserPane/NavBar';
import AISidebar from './panels/AISidebar/index';
import APIModal from './panels/APIModal';

export type PanelType = 'browser' | 'ide' | 'notebook' | 'notes' | 'tasks' | 'calendar' | 'terminal';

const PANEL_LABELS: Record<PanelType, string> = {
  browser: 'Browser',
  ide: 'IDE',
  notebook: 'Notebook',
  notes: 'Notes',
  tasks: 'Tasks',
  calendar: 'Calendar',
  terminal: 'Terminal',
};

const PANELS: PanelType[] = ['browser', 'ide', 'notebook', 'notes', 'tasks', 'calendar', 'terminal'];

export default function App() {
  const [activePanel, setActivePanel] = useState<PanelType>('browser');
  const [showAPIModal, setShowAPIModal] = useState(false);

  const handlePanelSwitch = (panel: PanelType) => {
    setActivePanel(panel);
    (window as any).suki?.switchPanel(panel);
  };

  useEffect(() => {
    const suki = (window as any).suki;
    if (suki) {
      suki.hasKeys().catch(() => {});
      suki.switchPanel?.(activePanel);
    }
  }, []);

  useEffect(() => {
    const suki = (window as any).suki;
    if (!suki?.onForcePanelSwitch) return;
    const unsub = suki.onForcePanelSwitch((panel: string) => {
      handlePanelSwitch(panel as PanelType);
    });
    return unsub;
  }, []);

  const handleOpenAPIModal = () => {
    setShowAPIModal(true);
    (window as any).suki?.switchPanel('modal');
  };

  const handleCloseAPIModal = () => {
    setShowAPIModal(false);
    (window as any).suki?.switchPanel(activePanel);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      width: '100vw',
      background: '#0a0812',
      overflow: 'hidden',
      position: 'relative',
    }}>

      {/* Top row: tab carousel space + navbar */}
      <div style={{
        display: 'flex',
        height: 44,
        flexShrink: 0,
        borderBottom: '1px solid #2d2850',
        zIndex: 10,
      }}>
        <div style={{ width: 72, flexShrink: 0, borderRight: '1px solid #2d2850', background: '#0a0812' }} />
        <NavBar />
      </div>

      {/* Middle row: carousel + content + sidebar */}
      <div style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
      }}>
        <TabCarousel onSwitchToBrowser={() => handlePanelSwitch('browser')} />

        {/* Main content area */}
        <div style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          background: '#0a0812',
        }}>
          {activePanel === 'ide' && <IDEPane />}
          {activePanel === 'notebook' && <NotebookPane />}
          {activePanel === 'notes' && <NotesPane />}
          {activePanel === 'tasks' && <TasksPane />}
          {activePanel === 'calendar' && <CalendarPane />}
          <div
            style={{
              display: activePanel === 'terminal' ? 'block' : 'none',
              width: '100%',
              height: '100%',
            }}
          >
            <TerminalPane isVisible={activePanel === 'terminal'} />
          </div>
        </div>

        {/* AI Sidebar overlays on right */}
        <AISidebar />
      </div>

      {/* Bottom panel switcher */}
      <div style={{
        height: 40,
        flexShrink: 0,
        background: '#0a0812',
        borderTop: '1px solid #2d2850',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 80,
        gap: 2,
        position: 'relative',
        zIndex: 200,
      }}>
        {PANELS.map(panel => (
          <button
            key={panel}
            onClick={() => handlePanelSwitch(panel)}
            style={{
              padding: '5px 14px',
              background: activePanel === panel ? '#1a1730' : 'transparent',
              color: activePanel === panel ? '#a394f0' : '#9890c0',
              border: `1px solid ${activePanel === panel ? '#2d2850' : 'transparent'}`,
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: activePanel === panel ? 500 : 400,
              transition: 'all 0.15s ease',
              pointerEvents: 'all',
            }}
          >
            {PANEL_LABELS[panel]}
          </button>
        ))}

        <button
          onClick={handleOpenAPIModal}
          style={{
            marginLeft: 'auto',
            marginRight: 12,
            padding: '5px 14px',
            background: 'transparent',
            color: '#5a5480',
            border: '1px solid transparent',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12,
            transition: 'all 0.15s ease',
            pointerEvents: 'all',
          }}
        >
          APIs
        </button>
      </div>

      {/* API Modal */}
      {showAPIModal && <APIModal onClose={handleCloseAPIModal} />}

    </div>
  );
}
