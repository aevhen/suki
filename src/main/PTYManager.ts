import * as nodePty from 'node-pty';
import os from 'os';

export type ShellType = 'powershell' | 'cmd' | 'wsl';

export interface ExecResult {
  output: string;
  exitCode: number;
  success: boolean;
}

export class PTYManager {
  private sessions = new Map<string, nodePty.IPty>();
  private buffers = new Map<string, string[]>();
  private dataCallbacks = new Map<string, ((data: string) => void)[]>();

  spawn(id: string, shellType: ShellType = 'powershell', cwd = os.homedir()): nodePty.IPty {
    let shell: string;
    let args: string[];
    let spawnCwd: string;

    switch (shellType) {
      case 'wsl':
        shell = 'wsl.exe';
        args = [];
        spawnCwd = os.homedir();
        break;
      case 'cmd':
        shell = 'cmd.exe';
        args = [];
        spawnCwd = cwd;
        break;
      case 'powershell':
      default:
        shell = 'powershell.exe';
        args = ['-NoLogo'];
        spawnCwd = cwd;
        break;
    }

    const p = nodePty.spawn(shell, args, {
      name: 'xterm-256color',
      cwd: spawnCwd,
      env: process.env as Record<string, string>,
      cols: 120,
      rows: 30,
    });

    this.sessions.set(id, p);
    this.buffers.set(id, []);
    this.dataCallbacks.set(id, []);

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

  write(id: string, data: string): void {
    this.sessions.get(id)?.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    this.sessions.get(id)?.resize(cols, rows);
  }

  kill(id: string): void {
    this.sessions.get(id)?.kill();
    this.sessions.delete(id);
    this.buffers.delete(id);
    this.dataCallbacks.delete(id);
  }

  getOutput(id: string, lines = 200): string {
    return (this.buffers.get(id) ?? []).slice(-lines).join('');
  }

  async exec(command: string, cwd: string, timeoutMs = 60000): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      const output: string[] = [];
      const p = nodePty.spawn('cmd.exe', ['/c', command], {
        cwd,
        env: process.env as Record<string, string>,
        cols: 120,
        rows: 30,
      });
      const timer = setTimeout(() => {
        p.kill();
        reject(new Error(`Timed out: ${command}`));
      }, timeoutMs);
      p.onData(d => output.push(d));
      p.onExit(({ exitCode }) => {
        clearTimeout(timer);
        const out = output.join('');
        resolve({ output: out, exitCode: exitCode ?? 0, success: (exitCode ?? 0) === 0 });
      });
    });
  }

  async execInWSL(command: string, timeoutMs = 60000): Promise<ExecResult> {
    return new Promise(resolve => {
      const output: string[] = [];
      const p = nodePty.spawn('wsl.exe', ['-e', 'bash', '-c', command], {
        env: process.env as Record<string, string>,
        cols: 120,
        rows: 30,
      });

      const timer = setTimeout(() => {
        p.kill();
        resolve({ output: output.join(''), exitCode: 124, success: false });
      }, timeoutMs);

      p.onData(d => output.push(d));
      p.onExit(({ exitCode }) => {
        clearTimeout(timer);
        const out = output.join('');
        resolve({ output: out, exitCode: exitCode ?? 0, success: (exitCode ?? 0) === 0 });
      });
    });
  }

  async execInPowerShell(command: string, timeoutMs = 60000): Promise<ExecResult> {
    return new Promise(resolve => {
      const output: string[] = [];
      const p = nodePty.spawn('powershell.exe', ['-NoLogo', '-NonInteractive', '-Command', command], {
        env: process.env as Record<string, string>,
        cols: 120,
        rows: 30,
      });
      const timer = setTimeout(() => {
        p.kill();
        resolve({ output: output.join(''), exitCode: 124, success: false });
      }, timeoutMs);
      p.onData(d => output.push(d));
      p.onExit(({ exitCode }) => {
        clearTimeout(timer);
        resolve({ output: output.join(''), exitCode: exitCode ?? 0, success: (exitCode ?? 0) === 0 });
      });
    });
  }
}

export const ptyManager = new PTYManager();
