import * as nodePty from 'node-pty';
import os from 'os';

export interface ExecResult { output: string; exitCode: number; success: boolean; }

export class PTYManager {
  private sessions = new Map<string, nodePty.IPty>();
  private buffers = new Map<string, string[]>();
  private dataCallbacks = new Map<string, ((data: string) => void)[]>();

  spawn(id: string, cwd = os.homedir()): nodePty.IPty {
    const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL ?? 'bash');
    const p = nodePty.spawn(shell, [], {
      name: 'xterm-256color', cwd,
      env: process.env as Record<string, string>,
      cols: 120, rows: 30,
    });
    this.sessions.set(id, p);
    this.buffers.set(id, []);
    p.onData(data => {
      this.buffers.get(id)?.push(data);
      this.dataCallbacks.get(id)?.forEach(cb => cb(data));
    });
    return p;
  }

  onData(id: string, cb: (data: string) => void): void {
    if (!this.dataCallbacks.has(id)) this.dataCallbacks.set(id, []);
    this.dataCallbacks.get(id)!.push(cb);
  }

  write(id: string, data: string): void { this.sessions.get(id)?.write(data); }
  resize(id: string, cols: number, rows: number): void { this.sessions.get(id)?.resize(cols, rows); }
  kill(id: string): void { this.sessions.get(id)?.kill(); this.sessions.delete(id); this.buffers.delete(id); this.dataCallbacks.delete(id); }
  getOutput(id: string, lines = 200): string { return (this.buffers.get(id) ?? []).slice(-lines).join(''); }

  async exec(command: string, cwd: string, timeoutMs = 60000): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      const output: string[] = [];
      const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash';
      const args = process.platform === 'win32' ? ['/c', command] : ['-c', command];
      const p = nodePty.spawn(shell, args, { cwd, env: process.env as Record<string, string>, cols: 120, rows: 30 });
      const timer = setTimeout(() => { p.kill(); reject(new Error(`Timed out: ${command}`)); }, timeoutMs);
      p.onData(d => output.push(d));
      p.onExit(({ exitCode }) => {
        clearTimeout(timer);
        const out = output.join('');
        resolve({ output: out, exitCode: exitCode ?? 0, success: (exitCode ?? 0) === 0 });
      });
    });
  }
}

export const ptyManager = new PTYManager();
