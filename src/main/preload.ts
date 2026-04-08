import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('suki', {
  createTab: (url: string) => ipcRenderer.invoke('tab:create', url),
  closeTab: (id: string) => ipcRenderer.invoke('tab:close', id),
  activateTab: (id: string) => ipcRenderer.invoke('tab:activate', id),
  navigate: (id: string, url: string) => ipcRenderer.invoke('tab:navigate', { id, url }),
  goBack: (id: string) => ipcRenderer.invoke('tab:back', id),
  goForward: (id: string) => ipcRenderer.invoke('tab:forward', id),
  reload: (id: string) => ipcRenderer.invoke('tab:reload', id),
  switchPanel: (panel: string) => ipcRenderer.invoke('panel:switch', panel),
  openInBrowser: (url: string) => ipcRenderer.invoke('browser:openURL', url),

  screenshot: (tabId?: string) => ipcRenderer.invoke('ai:screenshot', tabId),
  getDOM: (tabId?: string) => ipcRenderer.invoke('ai:dom', tabId),
  getNetworkLog: (tabId?: string) => ipcRenderer.invoke('ai:network', tabId),
  query: (type: string, messages: unknown[], images?: string[]) => ipcRenderer.invoke('ai:query', { type, messages, images }),
  queryAll: (type: string, messages: unknown[], providers: string[]) => ipcRenderer.invoke('ai:queryAll', { type, messages, providers }),
  judge: (task: string, implementations: string[]) => ipcRenderer.invoke('ai:judge', { task, implementations }),

  saveKeys: (keys: Record<string, string>) => ipcRenderer.invoke('keys:save', keys),
  hasKeys: () => ipcRenderer.invoke('keys:has'),

  openFolder: () => ipcRenderer.invoke('fs:openFolder'),
  readFile: (p: string) => ipcRenderer.invoke('fs:read', p),
  writeFile: (p: string, content: string) => ipcRenderer.invoke('fs:write', { p, content }),
  listFiles: (dir: string) => ipcRenderer.invoke('fs:list', dir),

  spawnTerminal: (id: string) => ipcRenderer.invoke('pty:spawn', id),
  writeTerminal: (id: string, data: string) => ipcRenderer.invoke('pty:write', { id, data }),
  resizeTerminal: (id: string, cols: number, rows: number) => ipcRenderer.invoke('pty:resize', { id, cols, rows }),
  killTerminal: (id: string) => ipcRenderer.invoke('pty:kill', id),
  execCommand: (cmd: string, cwd: string) => ipcRenderer.invoke('pty:exec', { cmd, cwd }),
  getTerminalOutput: (id: string) => ipcRenderer.invoke('pty:output', id),

  getNotes: () => ipcRenderer.invoke('db:getNotes'),
  getNote: (id: string) => ipcRenderer.invoke('db:getNote', id),
  createNote: (note: unknown) => ipcRenderer.invoke('db:createNote', note),
  updateNote: (id: string, patch: unknown) => ipcRenderer.invoke('db:updateNote', { id, patch }),
  deleteNote: (id: string) => ipcRenderer.invoke('db:deleteNote', id),
  searchNotes: (query: string) => ipcRenderer.invoke('db:searchNotes', query),

  getBoards: () => ipcRenderer.invoke('db:getBoards'),
  getColumns: (boardId: string) => ipcRenderer.invoke('db:getColumns', boardId),
  getTasks: (columnId: string) => ipcRenderer.invoke('db:getTasks', columnId),
  createTask: (task: unknown) => ipcRenderer.invoke('db:createTask', task),
  updateTask: (id: string, patch: unknown) => ipcRenderer.invoke('db:updateTask', { id, patch }),
  deleteTask: (id: string) => ipcRenderer.invoke('db:deleteTask', id),
  moveTask: (id: string, columnId: string, position: number) => ipcRenderer.invoke('db:moveTask', { id, columnId, position }),
  createBoard: (name: string) => ipcRenderer.invoke('db:createBoard', name),
  createColumn: (boardId: string, name: string, color?: string) => ipcRenderer.invoke('db:createColumn', { boardId, name, color }),

  getEvents: (startTs: number, endTs: number) => ipcRenderer.invoke('db:getEvents', { startTs, endTs }),
  createEvent: (event: unknown) => ipcRenderer.invoke('db:createEvent', event),
  updateEvent: (id: string, patch: unknown) => ipcRenderer.invoke('db:updateEvent', { id, patch }),
  deleteEvent: (id: string) => ipcRenderer.invoke('db:deleteEvent', id),

  getNotebooks: () => ipcRenderer.invoke('db:getNotebooks'),
  createNotebook: (name: string) => ipcRenderer.invoke('db:createNotebook', name),
  getCells: (notebookId: string) => ipcRenderer.invoke('db:getCells', notebookId),
  createCell: (cell: unknown) => ipcRenderer.invoke('db:createCell', cell),
  updateCell: (id: string, patch: unknown) => ipcRenderer.invoke('db:updateCell', { id, patch }),
  deleteCell: (id: string) => ipcRenderer.invoke('db:deleteCell', id),

  onTabUpdated: (cb: (data: unknown) => void) => {
    ipcRenderer.on('tab:updated', (_, d) => cb(d));
    return () => ipcRenderer.removeAllListeners('tab:updated');
  },
  onTabActivated: (cb: (id: string) => void) => {
    ipcRenderer.on('tab:activated', (_, id) => cb(id));
    return () => ipcRenderer.removeAllListeners('tab:activated');
  },
  onTabThumbnail: (cb: (data: { id: string; dataUrl: string }) => void) => {
    ipcRenderer.on('tab:thumbnail', (_, d) => cb(d));
    return () => ipcRenderer.removeAllListeners('tab:thumbnail');
  },
  onTerminalData: (cb: (data: { id: string; output: string }) => void) => {
    ipcRenderer.on('pty:data', (_, d) => cb(d));
    return () => ipcRenderer.removeAllListeners('pty:data');
  },
  onForcePanelSwitch: (cb: (panel: string) => void) => {
    ipcRenderer.on('force-panel-switch', (_, panel) => cb(panel));
    return () => ipcRenderer.removeAllListeners('force-panel-switch');
  },
  onSetupState: (cb: (screen: 'setup' | 'main') => void) => {
    ipcRenderer.on('show-setup', () => cb('setup'));
    ipcRenderer.on('show-main', () => cb('main'));
    return () => {
      ipcRenderer.removeAllListeners('show-setup');
      ipcRenderer.removeAllListeners('show-main');
    };
  },
});
