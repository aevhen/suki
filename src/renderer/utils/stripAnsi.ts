export function stripAnsi(str: string): string {
  return str
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1B\][^\x07]*(\x07|\x1B\\)/g, '')
    .replace(/\x1B[@-_][0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\[[\d;?]*[a-zA-Z]/g, '')
    .trim();
}
