import { afterEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({ app: { isPackaged: true } }));
vi.mock('electron', () => ({ app: electron.app, dialog: {}, Notification: class {}, BrowserWindow: class {} }));
vi.mock('electron-updater', () => ({ autoUpdater: { on: () => undefined, checkForUpdates: async () => null } }));

import { canAutoUpdate } from './updater';

describe('auto-update', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    electron.app.isPackaged = true;
  });

  it('only a packaged (signed release) build updates itself', () => {
    delete process.env.PC_SMOKE_TEST;
    delete process.env.PC_DISABLE_AUTO_UPDATE;
    process.env.APPIMAGE = '/x.AppImage';
    expect(canAutoUpdate()).toBe(true);
    electron.app.isPackaged = false;
    expect(canAutoUpdate()).toBe(false);
  });

  it('smoke runs and PC_DISABLE_AUTO_UPDATE never update', () => {
    process.env.APPIMAGE = '/x.AppImage';
    process.env.PC_DISABLE_AUTO_UPDATE = '1';
    expect(canAutoUpdate()).toBe(false);
  });
});
