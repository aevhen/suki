import type { Rectangle, WebContents } from 'electron';

declare module 'electron' {
  export class WebContentsView {
    constructor(options?: Electron.BrowserViewConstructorOptions);
    webContents: WebContents;
    setBounds(bounds: Rectangle): void;
    getBounds(): Rectangle;
  }

  interface BrowserWindow {
    contentView?: {
      addChildView(view: WebContentsView): void;
      removeChildView(view: WebContentsView): void;
    };
  }
}

export {};
