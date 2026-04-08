export function toWSLPath(windowsPath: string): string {
  return windowsPath
    .replace(/^([A-Z]):\\/, (_, drive: string) => `/mnt/${drive.toLowerCase()}/`)
    .replace(/\\/g, '/');
}

export function toWindowsPath(wslPath: string): string {
  return wslPath
    .replace(/^\/mnt\/([a-z])\//, (_, drive: string) => `${drive.toUpperCase()}:\\`)
    .replace(/\//g, '\\');
}
