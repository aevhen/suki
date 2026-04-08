import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DATA_DIR } from './KeysService';

export class SQLiteManager {
  private db: Database.Database;

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    this.db = new Database(path.join(DATA_DIR, 'suki.db'));
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
    const schema = [
      "CREATE TABLE IF NOT EXISTS browser_tabs (id TEXT PRIMARY KEY, url TEXT, title TEXT, favicon TEXT, pinned INTEGER DEFAULT 0, position INTEGER, created_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, root_path TEXT, name TEXT, last_opened INTEGER)",
      "CREATE VIRTUAL TABLE IF NOT EXISTS file_index USING fts5(project_id, path, content, tokenize='porter unicode61')",
      "CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, title TEXT, body_md TEXT, tags TEXT, created_at INTEGER, updated_at INTEGER)",
      "CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(note_id UNINDEXED, title, body_md, tokenize='porter unicode61')",
      "CREATE TABLE IF NOT EXISTS boards (id TEXT PRIMARY KEY, name TEXT, position INTEGER)",
      "CREATE TABLE IF NOT EXISTS columns (id TEXT PRIMARY KEY, board_id TEXT, name TEXT, position INTEGER, color TEXT)",
      "CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, column_id TEXT, title TEXT, description TEXT, due_date INTEGER, priority INTEGER, tags TEXT, position INTEGER, created_at INTEGER, completed_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, title TEXT, description TEXT, start_ts INTEGER, end_ts INTEGER, all_day INTEGER, color TEXT, recurrence TEXT)",
      "CREATE TABLE IF NOT EXISTS notebooks (id TEXT PRIMARY KEY, name TEXT, created_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS cells (id TEXT PRIMARY KEY, notebook_id TEXT, position INTEGER, language TEXT, source TEXT, output TEXT, output_type TEXT, created_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, context TEXT, messages TEXT, created_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS api_quota (provider TEXT PRIMARY KEY, requests_today INTEGER DEFAULT 0, tokens_today INTEGER DEFAULT 0, reset_date TEXT)",
      "CREATE TABLE IF NOT EXISTS build_runs (id TEXT PRIMARY KEY, prd_filename TEXT, project_dir TEXT, started_at INTEGER, completed_at INTEGER, status TEXT, total_tasks INTEGER, completed_tasks INTEGER, failed_tasks INTEGER, blocked_tasks INTEGER)",
      "CREATE TABLE IF NOT EXISTS build_task_results (id TEXT PRIMARY KEY, run_id TEXT, task_id TEXT, task_title TEXT, status TEXT, attempts INTEGER, started_at INTEGER, completed_at INTEGER, terminal_output TEXT, visual_verdict TEXT, diff_applied TEXT)",
      "CREATE TABLE IF NOT EXISTS ml_training_runs (id TEXT PRIMARY KEY, run_id TEXT, framework TEXT, started_at INTEGER, completed_at INTEGER, epochs_completed INTEGER, final_loss REAL, final_accuracy REAL, metrics_json TEXT, model_path TEXT, eval_output TEXT, sample_inference TEXT)"
    ];
    schema.forEach(sql => this.db.prepare(sql).run());
  }

  getNotes(): any[] { return this.db.prepare('SELECT * FROM notes ORDER BY updated_at DESC').all(); }
  getBoards(): any[] { return this.db.prepare('SELECT * FROM boards ORDER BY position').all(); }
  getColumns(boardId: string): any[] { return this.db.prepare('SELECT * FROM columns WHERE board_id = ? ORDER BY position').all(boardId); }
  getTasks(columnId: string): any[] { return this.db.prepare('SELECT * FROM tasks WHERE column_id = ? ORDER BY position').all(columnId); }
  getEvents(startTs: number, endTs: number): any[] { return this.db.prepare('SELECT * FROM events WHERE start_ts >= ? AND end_ts <= ? ORDER BY start_ts').all(startTs, endTs); }
  getNotebooks(): any[] { return this.db.prepare('SELECT * FROM notebooks ORDER BY created_at DESC').all(); }
  getCells(notebookId: string): any[] { return this.db.prepare('SELECT * FROM cells WHERE notebook_id = ? ORDER BY position').all(notebookId); }
  getConversations(context: string): any[] { return this.db.prepare('SELECT * FROM conversations WHERE context = ? ORDER BY created_at DESC').all(context); }
  getQuota(provider: string): any { return this.db.prepare('SELECT * FROM api_quota WHERE provider = ?').get(provider); }

  getNote(id: string): any { return this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id); }

  searchNotes(query: string): any[] { return this.db.prepare("SELECT * FROM notes WHERE id IN (SELECT note_id FROM notes_fts WHERE notes_fts MATCH ?)").all(query); }

  createNote(note: { title: string; body_md: string; tags: string }): string {
    const id = crypto.randomUUID();
    this.db.prepare('INSERT INTO notes (id, title, body_md, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, note.title, note.body_md, note.tags, Date.now(), Date.now());
    this.db.prepare('INSERT INTO notes_fts (note_id, title, body_md) VALUES (?, ?, ?)').run(id, note.title, note.body_md);
    return id;
  }

  createTask(task: { column_id: string; title: string; description?: string; priority?: number; tags?: string; due_date?: number }): string {
    const id = crypto.randomUUID();
    const pos = (this.db.prepare('SELECT COUNT(*) as c FROM tasks WHERE column_id = ?').get(task.column_id) as any).c;
    this.db.prepare('INSERT INTO tasks (id, column_id, title, description, priority, tags, due_date, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, task.column_id, task.title, task.description ?? '', task.priority ?? 2, task.tags ?? '', task.due_date ?? null, pos, Date.now());
    return id;
  }

  createEvent(event: { title: string; start_ts: number; end_ts: number; all_day?: number; color?: string; description?: string }): string {
    const id = crypto.randomUUID();
    this.db.prepare('INSERT INTO events (id, title, description, start_ts, end_ts, all_day, color) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, event.title, event.description ?? '', event.start_ts, event.end_ts, event.all_day ?? 0, event.color ?? '#00ffe7');
    return id;
  }

  createCell(cell: { notebook_id: string; language: string; source?: string; position?: number }): string {
    const id = crypto.randomUUID();
    this.db.prepare('INSERT INTO cells (id, notebook_id, position, language, source, output, output_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, cell.notebook_id, cell.position ?? 0, cell.language, cell.source ?? '', '', 'text', Date.now());
    return id;
  }

  createNotebook(name: string): string {
    const id = crypto.randomUUID();
    this.db.prepare('INSERT INTO notebooks (id, name, created_at) VALUES (?, ?, ?)').run(id, name, Date.now());
    return id;
  }

  createBoard(name: string): string {
    const id = crypto.randomUUID();
    const pos = (this.db.prepare('SELECT COUNT(*) as c FROM boards').get() as any).c;
    this.db.prepare('INSERT INTO boards (id, name, position) VALUES (?, ?, ?)').run(id, name, pos);
    return id;
  }

  createColumn(boardId: string, name: string, color?: string): string {
    const id = crypto.randomUUID();
    const pos = (this.db.prepare('SELECT COUNT(*) as c FROM columns WHERE board_id = ?').get(boardId) as any).c;
    this.db.prepare('INSERT INTO columns (id, board_id, name, position, color) VALUES (?, ?, ?, ?, ?)').run(id, boardId, name, pos, color ?? '#2a2a33');
    return id;
  }

  saveConversation(conv: { context: string; messages: string }): string {
    const id = crypto.randomUUID();
    this.db.prepare('INSERT INTO conversations (id, context, messages, created_at) VALUES (?, ?, ?, ?)').run(id, conv.context, conv.messages, Date.now());
    return id;
  }

  updateNote(id: string, patch: Record<string, any>): boolean {
    patch.updated_at = Date.now();
    const fields = Object.keys(patch).map((k: string) => `${k} = ?`).join(', ');
    const result = this.db.prepare(`UPDATE notes SET ${fields} WHERE id = ?`).run(...Object.values(patch), id);
    this.db.prepare('DELETE FROM notes_fts WHERE note_id = ?').run(id);
    const note = this.getNote(id);
    if (note) this.db.prepare('INSERT INTO notes_fts (note_id, title, body_md) VALUES (?, ?, ?)').run(note.id, note.title, note.body_md);
    return result.changes > 0;
  }

  updateTask(id: string, patch: Record<string, any>): boolean {
    const fields = Object.keys(patch).map((k: string) => `${k} = ?`).join(', ');
    const result = this.db.prepare(`UPDATE tasks SET ${fields} WHERE id = ?`).run(...Object.values(patch), id);
    return result.changes > 0;
  }

  updateEvent(id: string, patch: Record<string, any>): boolean {
    const fields = Object.keys(patch).map((k: string) => `${k} = ?`).join(', ');
    const result = this.db.prepare(`UPDATE events SET ${fields} WHERE id = ?`).run(...Object.values(patch), id);
    return result.changes > 0;
  }

  updateCell(id: string, patch: Record<string, any>): boolean {
    const fields = Object.keys(patch).map((k: string) => `${k} = ?`).join(', ');
    const result = this.db.prepare(`UPDATE cells SET ${fields} WHERE id = ?`).run(...Object.values(patch), id);
    return result.changes > 0;
  }

  deleteNote(id: string): boolean {
    this.db.prepare('DELETE FROM notes_fts WHERE note_id = ?').run(id);
    return this.db.prepare('DELETE FROM notes WHERE id = ?').run(id).changes > 0;
  }
  deleteTask(id: string): boolean { return this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0; }
  deleteEvent(id: string): boolean { return this.db.prepare('DELETE FROM events WHERE id = ?').run(id).changes > 0; }
  deleteCell(id: string): boolean { return this.db.prepare('DELETE FROM cells WHERE id = ?').run(id).changes > 0; }

  moveTask(id: string, columnId: string, position: number): boolean {
    return this.db.prepare('UPDATE tasks SET column_id = ?, position = ? WHERE id = ?').run(columnId, position, id).changes > 0;
  }

  incrementQuota(provider: string, tokens: number): boolean {
    const fn = this.db.transaction(() => {
      const existing = this.db.prepare('SELECT provider FROM api_quota WHERE provider = ?').get(provider);
      if (!existing) {
        return this.db.prepare('INSERT INTO api_quota (provider, requests_today, tokens_today, reset_date) VALUES (?, 1, ?, ?)').run(provider, tokens, new Date().toISOString().split('T')[0]);
      }
      return this.db.prepare('UPDATE api_quota SET requests_today = requests_today + 1, tokens_today = tokens_today + ? WHERE provider = ?').run(tokens, provider);
    });
    const result = fn();
    return result.changes > 0;
  }

  saveBuildProgress(runId: string, completed: number, failed: number): boolean {
    return this.db.prepare('UPDATE build_runs SET completed_tasks = ?, failed_tasks = ? WHERE id = ?').run(completed, failed, runId).changes > 0;
  }
}

export const sqliteManager = new SQLiteManager();
export default SQLiteManager;
