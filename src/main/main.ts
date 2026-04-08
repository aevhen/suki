import { BrowserView, BrowserWindow, WebContentsView, app, dialog, ipcMain, session } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { hasKeys, loadKeys, saveKeys } from './KeysService';
import { judge, query, queryAll } from './AIRouter';
import { ptyManager } from './PTYManager';
import { sqliteManager } from './SQLiteManager';

let win: BrowserWindow;
let activeTabId = '';
type BrowserTabView = BrowserView | WebContentsView;
const ViewClass = (WebContentsView ?? BrowserView) as typeof BrowserView;
const tabs = new Map<string, BrowserTabView>();
const networkLogs = new Map<string, any[]>();

function getBrowserBounds() {
  const bounds = win.getBounds();
  return { x: 72, y: 76, width: bounds.width - 72, height: bounds.height - 76 };
}

function attachCDP(wc: Electron.WebContents, tabId: string) {
  try {
    wc.debugger.attach('1.3');
    wc.debugger.sendCommand('Network.enable');
    wc.debugger.sendCommand('Page.enable');
  } catch {}

  wc.debugger.on('message', (_, method, params) => {
    if (method === 'Network.responseReceived') {
      const log = networkLogs.get(tabId) ?? [];
      log.push(params);
      if (log.length > 50) log.shift();
      networkLogs.set(tabId, log);
    }
  });

  wc.on('did-stop-loading', async () => {
    try {
      const { data } = await wc.debugger.sendCommand('Page.captureScreenshot', { format: 'jpeg', quality: 40, scaleFactor: 0.3 }) as { data: string };
      win.webContents.send('tab:thumbnail', { id: tabId, dataUrl: `data:image/jpeg;base64,${data}` });
      win.webContents.send('tab:updated', { id: tabId, url: wc.getURL(), title: wc.getTitle() });
    } catch {}
  });
}

function setActiveTab(id: string): void {
  const active = tabs.get(id);
  if (!active) return;
  for (const view of tabs.values()) {
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }
  activeTabId = id;
  active.setBounds(getBrowserBounds());
  win.webContents.send('tab:activated', id);
}

function createTab(url: string): string {
  const id = crypto.randomUUID();
  const view = new ViewClass({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  tabs.set(id, view);
  networkLogs.set(id, []);
  addView(view);
  attachCDP(view.webContents, id);
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  view.webContents.loadURL(url);
  setActiveTab(id);
  return id;
}

function closeTab(id: string): boolean {
  const view = tabs.get(id);
  if (!view) return false;
  removeView(view);
  view.webContents.close();
  tabs.delete(id);
  networkLogs.delete(id);
  if (activeTabId === id) {
    const next = tabs.keys().next().value as string | undefined;
    activeTabId = '';
    if (next) setActiveTab(next);
  }
  return true;
}

function addView(view: BrowserTabView): void {
  if ('contentView' in win && win.contentView) {
    win.contentView.addChildView(view as WebContentsView);
    return;
  }
  win.addBrowserView(view as BrowserView);
}

function removeView(view: BrowserTabView): void {
  if ('contentView' in win && win.contentView) {
    win.contentView.removeChildView(view as WebContentsView);
    return;
  }
  win.removeBrowserView(view as BrowserView);
}

function createWindow(): void {
  void session.defaultSession;
  void loadKeys;

  win = new BrowserWindow({
    width: 1400, height: 900,
    backgroundColor: '#0d0d0f',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0d0d0f', symbolColor: '#888888', height: 32 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.on('resize', () => {
    const view = tabs.get(activeTabId);
    if (view) view.setBounds(getBrowserBounds());
  });

  win.webContents.once('did-finish-load', () => {
    win.webContents.send(hasKeys() ? 'show-main' : 'show-setup');
  });

  createTab('https://google.com');
}

ipcMain.handle('tab:create', (_, url) => createTab(url));
ipcMain.handle('tab:close', (_, id) => closeTab(id));
ipcMain.handle('tab:activate', (_, id) => setActiveTab(id));
ipcMain.handle('tab:navigate', (_, { id, url }) => { tabs.get(id)?.webContents.loadURL(url); });
ipcMain.handle('tab:back', (_, id) => { tabs.get(id)?.webContents.goBack(); });
ipcMain.handle('tab:forward', (_, id) => { tabs.get(id)?.webContents.goForward(); });
ipcMain.handle('tab:reload', (_, id) => { tabs.get(id)?.webContents.reload(); });

ipcMain.handle('ai:screenshot', async (_, tabId) => {
  const wc = tabs.get(tabId ?? activeTabId)?.webContents;
  if (!wc) return null;
  const { data } = await wc.debugger.sendCommand('Page.captureScreenshot', { format: 'png', quality: 80 }) as { data: string };
  return data;
});
ipcMain.handle('ai:dom', async (_, tabId) => {
  const wc = tabs.get(tabId ?? activeTabId)?.webContents;
  if (!wc) return '';
  const { result } = await wc.debugger.sendCommand('Runtime.evaluate', { expression: 'document.documentElement.outerHTML', returnByValue: true }) as { result: { value: string } };
  return result.value;
});
ipcMain.handle('ai:network', (_, tabId) => networkLogs.get(tabId ?? activeTabId) ?? []);
ipcMain.handle('ai:query', async (_, { type, messages, images }) => query(type, messages, images));
ipcMain.handle('ai:queryAll', async (_, { type, messages, providers }) => queryAll(type, messages, providers));
ipcMain.handle('ai:judge', async (_, { task, implementations }) => judge(task, implementations));

ipcMain.handle('keys:save', (_, keys) => saveKeys(keys));
ipcMain.handle('keys:has', () => hasKeys());

ipcMain.handle('fs:openFolder', async () => {
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('fs:read', (_, p) => fs.readFileSync(p, 'utf8'));
ipcMain.handle('fs:write', (_, { p, content }) => fs.writeFileSync(p, content, 'utf8'));
ipcMain.handle('fs:list', (_, dir) => fs.readdirSync(dir));

ipcMain.handle('pty:spawn', (_, id) => {
  const p = ptyManager.spawn(id);
  p.onData(data => win.webContents.send('pty:data', { id, output: data }));
});
ipcMain.handle('pty:write', (_, { id, data }) => ptyManager.write(id, data));
ipcMain.handle('pty:resize', (_, { id, cols, rows }) => ptyManager.resize(id, cols, rows));
ipcMain.handle('pty:kill', (_, id) => ptyManager.kill(id));
ipcMain.handle('pty:exec', async (_, { cmd, cwd }) => ptyManager.exec(cmd, cwd));
ipcMain.handle('pty:output', (_, id) => ptyManager.getOutput(id));

ipcMain.handle('db:getNotes', () => sqliteManager.getNotes());
ipcMain.handle('db:getNote', (_, id) => sqliteManager.getNote(id));
ipcMain.handle('db:createNote', (_, note) => sqliteManager.createNote(note));
ipcMain.handle('db:updateNote', (_, { id, patch }) => sqliteManager.updateNote(id, patch));
ipcMain.handle('db:deleteNote', (_, id) => sqliteManager.deleteNote(id));
ipcMain.handle('db:searchNotes', (_, searchQuery) => sqliteManager.searchNotes(searchQuery));

ipcMain.handle('db:getBoards', () => sqliteManager.getBoards());
ipcMain.handle('db:getColumns', (_, boardId) => sqliteManager.getColumns(boardId));
ipcMain.handle('db:getTasks', (_, columnId) => sqliteManager.getTasks(columnId));
ipcMain.handle('db:createTask', (_, task) => sqliteManager.createTask(task));
ipcMain.handle('db:updateTask', (_, { id, patch }) => sqliteManager.updateTask(id, patch));
ipcMain.handle('db:deleteTask', (_, id) => sqliteManager.deleteTask(id));
ipcMain.handle('db:moveTask', (_, { id, columnId, position }) => sqliteManager.moveTask(id, columnId, position));
ipcMain.handle('db:createBoard', (_, name) => sqliteManager.createBoard(name));
ipcMain.handle('db:createColumn', (_, { boardId, name, color }) => sqliteManager.createColumn(boardId, name, color));

ipcMain.handle('db:getEvents', (_, { startTs, endTs }) => sqliteManager.getEvents(startTs, endTs));
ipcMain.handle('db:createEvent', (_, event) => sqliteManager.createEvent(event));
ipcMain.handle('db:updateEvent', (_, { id, patch }) => sqliteManager.updateEvent(id, patch));
ipcMain.handle('db:deleteEvent', (_, id) => sqliteManager.deleteEvent(id));

ipcMain.handle('db:getNotebooks', () => sqliteManager.getNotebooks());
ipcMain.handle('db:createNotebook', (_, name) => sqliteManager.createNotebook(name));
ipcMain.handle('db:getCells', (_, notebookId) => sqliteManager.getCells(notebookId));
ipcMain.handle('db:createCell', (_, cell) => sqliteManager.createCell(cell));
ipcMain.handle('db:updateCell', (_, { id, patch }) => sqliteManager.updateCell(id, patch));
ipcMain.handle('db:deleteCell', (_, id) => sqliteManager.deleteCell(id));

ipcMain.handle('build:parse', (_, markdown) => ({ markdown, tasks: [] }));
ipcMain.handle('build:start', (_, { plan, outputDir }) => ({ runId: crypto.randomUUID(), plan, outputDir, status: 'queued' }));
ipcMain.handle('build:pause', (_, runId) => ({ runId, status: 'paused' }));
ipcMain.handle('build:resume', (_, runId) => ({ runId, status: 'running' }));
ipcMain.handle('build:status', (_, runId) => ({ runId, status: 'unknown' }));

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
