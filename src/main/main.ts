import { app, BrowserView, BrowserWindow, ipcMain, dialog, session, shell } from 'electron';
import os from 'os';
import path from 'path';
import { hasKeys, saveKeys, loadKeys } from './KeysService';
import { sqliteManager } from './SQLiteManager';
import { query, queryAll, judge } from './AIRouter';
import { ptyManager, type ShellType } from './PTYManager';

let win: BrowserWindow;
const views = new Map<string, BrowserView>();
const networkLogs = new Map<string, any[]>();
let activeTabId = '';
let activePanel = 'browser';
let defaultTabCreated = false;
let searchView: BrowserView | null = null;

function getBrowserBounds() {
  const { width, height } = win.getBounds();
  return {
    x: 72,
    y: 76,
    width: Math.floor(width - 72 - 300),
    height: Math.floor(height - 116),
  };
}

function showTab(id: string) {
  // Hide all tabs
  for (const [tabId, view] of views) {
    if (tabId !== id) {
      view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
  }
  // Show active tab with correct bounds
  const view = views.get(id);
  if (view) {
    view.setBounds(activePanel === 'browser' ? getBrowserBounds() : { x: 0, y: 0, width: 0, height: 0 });
    activeTabId = id;
    win.webContents.send('tab:activated', id);
  }
}

function createTab(url: string): string {
  const id = Math.random().toString(36).slice(2);

  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  win.addBrowserView(view);
  view.setBounds(getBrowserBounds());
  view.setAutoResize({ width: true, height: true });

  view.webContents.loadURL(url);
  views.set(id, view);

  view.webContents.on('did-stop-loading', () => {
    win.webContents.send('tab:updated', {
      id,
      url: view.webContents.getURL(),
      title: view.webContents.getTitle(),
      loading: false
    });
    view.webContents.capturePage().then(image => {
      const resized = image.resize({ width: 160, height: 100 });
      win.webContents.send('tab:thumbnail', { id, dataUrl: resized.toDataURL() });
    }).catch(() => {});
  });

  view.webContents.on('did-start-loading', () => {
    win.webContents.send('tab:updated', { id, url, title: 'Loading...', loading: true });
  });

  view.webContents.on('page-title-updated', (_, title) => {
    win.webContents.send('tab:updated', { id, url: view.webContents.getURL(), title, loading: false });
  });

  showTab(id);
  return id;
}

function getOrCreateSearchView(): BrowserView {
  if (!searchView) {
    searchView = new BrowserView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      }
    });
    win.addBrowserView(searchView);
    searchView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }
  return searchView;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0a0812',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0812',
      symbolColor: '#9890c0',
      height: 32,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load renderer
  if (!app.isPackaged) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Update bounds on resize
  win.on('resize', () => {
    if (activeTabId && activePanel === 'browser') {
      const view = views.get(activeTabId);
      if (view) view.setBounds(getBrowserBounds());
    }
  });

  // Send show-main after renderer loads
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('show-main');
    if (!defaultTabCreated) {
      defaultTabCreated = true;
      setTimeout(() => createTab('https://google.com'), 800);
    }
  });
}

app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
      setTimeout(() => {
        const id = createTab(url);
        win.webContents.send('tab:created', { id, url });
        win.webContents.send('switch-to-browser');
        win.webContents.send('force-panel-switch', 'browser');
      }, 100);
    } else {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
});

// Register all IPC handlers
function registerIPC() {
  ipcMain.handle('tab:create', (_, url: string) => {
    return createTab(url ?? 'https://google.com');
  });

  ipcMain.handle('tab:close', (_, id: string) => {
    const view = views.get(id);
    if (view) {
      win.removeBrowserView(view);
      views.delete(id);
      networkLogs.delete(id);
    }
    // Activate another tab if this was active
    if (activeTabId === id) {
      const remaining = [...views.keys()];
      if (remaining.length > 0) showTab(remaining[remaining.length - 1]);
    }
  });

  ipcMain.handle('tab:activate', (_, id: string) => {
    showTab(id);
  });

  ipcMain.handle('tab:navigate', (_, { id, url }: { id: string; url: string }) => {
    views.get(id)?.webContents.loadURL(url);
  });

  ipcMain.handle('tab:back', (_, id: string) => {
    views.get(id)?.webContents.goBack();
  });

  ipcMain.handle('tab:forward', (_, id: string) => {
    views.get(id)?.webContents.goForward();
  });

  ipcMain.handle('tab:reload', (_, id: string) => {
    views.get(id)?.webContents.reload();
  });

  ipcMain.handle('panel:switch', (_, panel: string) => {
    activePanel = panel;
    if (panel === 'browser') {
      if (activeTabId) {
        const view = views.get(activeTabId);
        if (view) view.setBounds(getBrowserBounds());
      }
    } else {
      for (const view of views.values()) {
        view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      }
    }
  });

  ipcMain.handle('browser:openURL', (_, url: string) => {
    const id = createTab(url);
    win.webContents.send('tab:created', { id, url });
    win.webContents.send('switch-to-browser');
    win.webContents.send('force-panel-switch', 'browser');
    return id;
  });

  ipcMain.handle('browser:fetch', async (_, url: string) => {
    const view = getOrCreateSearchView();

    return new Promise<{ url: string; title: string; text: string; html: string }>((resolve) => {
      const cleanupAndResolve = (payload: { url: string; title: string; text: string; html: string }) => {
        clearTimeout(timeout);
        resolve(payload);
      };

      const timeout = setTimeout(() => {
        cleanupAndResolve({ url, title: '', text: 'Page load timed out', html: '' });
      }, 15000);

      view.webContents.once('did-finish-load', async () => {
        try {
          const result = await view.webContents.executeJavaScript(`
            (function() {
              const remove = document.querySelectorAll('script, style, nav, footer, header, .nav, .footer, .header, .sidebar, .ad, .advertisement');
              remove.forEach(el => el.remove());
              const main = document.querySelector('main, article, .content, .main, #content, #main') || document.body;
              const text = main.innerText || main.textContent || '';
              return {
                title: document.title,
                text: text.replace(/\\s+/g, ' ').trim().slice(0, 5000),
                url: window.location.href,
              };
            })()
          `) as { title: string; text: string; url: string };

          cleanupAndResolve({
            url: result.url,
            title: result.title,
            text: result.text,
            html: '',
          });
        } catch {
          cleanupAndResolve({ url, title: '', text: 'Failed to extract page content', html: '' });
        }
      });

      void view.webContents.loadURL(url).catch(() => {
        cleanupAndResolve({ url, title: '', text: 'Failed to load page content', html: '' });
      });
    });
  });

  ipcMain.handle('browser:search', async (_, query: string) => {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const view = getOrCreateSearchView();

    return new Promise<Array<{ title: string; url: string; snippet: string }>>((resolve) => {
      const cleanupAndResolve = (payload: Array<{ title: string; url: string; snippet: string }>) => {
        clearTimeout(timeout);
        resolve(payload);
      };

      const timeout = setTimeout(() => cleanupAndResolve([]), 10000);

      view.webContents.once('did-finish-load', async () => {
        try {
          const results = await view.webContents.executeJavaScript(`
            (function() {
              const results = [];
              const items = document.querySelectorAll('.result');
              items.forEach((item, i) => {
                if (i >= 5) return;
                const titleEl = item.querySelector('.result__title a');
                const snippetEl = item.querySelector('.result__snippet');
                const urlEl = item.querySelector('.result__url');
                if (titleEl) {
                  results.push({
                    title: titleEl.innerText || titleEl.textContent || '',
                    url: titleEl.href || (urlEl ? (urlEl.innerText || urlEl.textContent || '') : ''),
                    snippet: snippetEl ? (snippetEl.innerText || snippetEl.textContent || '') : '',
                  });
                }
              });
              return results;
            })()
          `) as Array<{ title: string; url: string; snippet: string }>;
          cleanupAndResolve(results);
        } catch {
          cleanupAndResolve([]);
        }
      });

      void view.webContents.loadURL(searchUrl).catch(() => cleanupAndResolve([]));
    });
  });

  ipcMain.handle('ai:screenshot', async (_, tabId?: string) => {
    const view = views.get(tabId ?? activeTabId);
    if (!view) return null;
    try {
      const image = await view.webContents.capturePage();
      return image.toPNG().toString('base64');
    } catch { return null; }
  });

  ipcMain.handle('ai:dom', async (_, tabId?: string) => {
    const view = views.get(tabId ?? activeTabId);
    if (!view) return '';
    try {
      const result = await view.webContents.executeJavaScript('document.documentElement.outerHTML');
      return result ?? '';
    } catch { return ''; }
  });

  ipcMain.handle('ai:network', (_, tabId?: string) => {
    return networkLogs.get(tabId ?? activeTabId) ?? [];
  });

  ipcMain.handle('ai:query', async (_, { type, messages, images }: any) => {
    return query(type, messages, images);
  });

  ipcMain.handle('ai:queryAll', async (_, { type, messages, providers }: any) => {
    return queryAll(type, messages, providers);
  });

  ipcMain.handle('ai:judge', async (_, { task, implementations }: any) => {
    return judge(task, implementations);
  });

  ipcMain.handle('keys:save', (_, keys: Record<string, string>) => saveKeys(keys));
  ipcMain.handle('keys:has', () => hasKeys());

  ipcMain.handle('fs:openFolder', async () => {
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('fs:openFile', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'Text', extensions: ['txt', 'md', 'ts', 'tsx', 'js', 'jsx', 'py', 'json', 'yaml', 'yml', 'css', 'html', 'sh', 'rs', 'go'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
        { name: 'PDF', extensions: ['pdf'] },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('fs:read', (_, p: string) => {
    const fs = require('fs');
    return fs.readFileSync(p, 'utf8');
  });

  ipcMain.handle('fs:readBase64', (_, p: string) => {
    const fs = require('fs');
    return fs.readFileSync(p).toString('base64');
  });

  ipcMain.handle('fs:write', (_, { p, content }: { p: string; content: string }) => {
    const fs = require('fs');
    fs.writeFileSync(p, content, 'utf8');
  });

  ipcMain.handle('fs:list', (_, dir: string) => {
    const fs = require('fs');
    return fs.readdirSync(dir);
  });

  ipcMain.handle('pty:spawn', (_, { id, shellType }: { id: string; shellType?: string }) => {
    const shell = (shellType as ShellType) ?? 'powershell';
    const p = ptyManager.spawn(id, shell);
    p.onData(data => win.webContents.send('pty:data', { id, output: data }));
  });

  ipcMain.handle('pty:write', (_, { id, data }: { id: string; data: string }) => ptyManager.write(id, data));
  ipcMain.handle('pty:resize', (_, { id, cols, rows }: { id: string; cols: number; rows: number }) => ptyManager.resize(id, cols, rows));
  ipcMain.handle('pty:kill', (_, id: string) => ptyManager.kill(id));
  ipcMain.handle('pty:exec', async (_, { cmd, cwd }: { cmd: string; cwd: string }) => ptyManager.exec(cmd, cwd));
  ipcMain.handle('pty:execWSL', async (_, command: string) => {
    return ptyManager.execInWSL(command);
  });
  ipcMain.handle('pty:execPS', async (_, command: string) => {
    return ptyManager.execInPowerShell(command);
  });
  ipcMain.handle('pty:output', (_, id: string) => ptyManager.getOutput(id));

  // SQLite handlers
  ipcMain.handle('db:getNotes', () => sqliteManager.getNotes());
  ipcMain.handle('db:getNote', (_, id) => sqliteManager.getNote(id));
  ipcMain.handle('db:createNote', (_, note) => sqliteManager.createNote(note));
  ipcMain.handle('db:updateNote', (_, { id, patch }) => sqliteManager.updateNote(id, patch));
  ipcMain.handle('db:deleteNote', (_, id) => sqliteManager.deleteNote(id));
  ipcMain.handle('db:searchNotes', (_, q) => sqliteManager.searchNotes(q));
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
}

app.whenReady().then(() => {
  createWindow();
  registerIPC();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
