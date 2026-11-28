import { app, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import { tm } from './i18n';

/**
 * Auto-update from GitHub Releases (PRODUCTCREATOR-21). electron-builder writes the feed
 * (`app-update.yml` in the app, `latest*.yml` next to the installers) from the `publish` section of
 * electron-builder.yml; the Release workflow uploads the installers and feeds to the release.
 *
 * Updates are only checked in a packaged app that can update itself: not in dev, not in the smoke
 * test, not in the Linux .tar.gz (only AppImage can be replaced) and not when PC_DISABLE_AUTO_UPDATE
 * is set. macOS only installs updates into a signed app.
 */
export function canAutoUpdate(): boolean {
  if (!app.isPackaged || process.env.PC_SMOKE_TEST || process.env.PC_DISABLE_AUTO_UPDATE) return false;
  if (process.platform === 'linux' && !process.env.APPIMAGE) return false;
  return true;
}

let started = false;

/** Check once at startup; download in the background and offer to restart via a system notification */
export function startAutoUpdates(): void {
  if (started || !canAutoUpdate()) return;
  started = true;
  autoUpdater.autoDownload = true;
  autoUpdater.on('error', (error) => console.warn('[updater]', error?.message ?? error));
  autoUpdater.checkForUpdatesAndNotify().catch((error: unknown) => console.warn('[updater]', error));
}

/** Menu action: check now and tell the user the result */
export async function checkForUpdatesInteractive(): Promise<void> {
  if (!canAutoUpdate()) {
    await dialog.showMessageBox({
      type: 'info',
      message: tm('updatesUnavailable'),
      detail: tm('updatesUnavailableDetail'),
    });
    return;
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    const latest = result?.updateInfo.version;
    if (!result?.isUpdateAvailable || !latest) {
      await dialog.showMessageBox({ type: 'info', message: tm('upToDate', { version: app.getVersion() }) });
      return;
    }
    await dialog.showMessageBox({
      type: 'info',
      message: tm('updateAvailable', { version: latest }),
      detail: tm('updateAvailableDetail'),
    });
  } catch (error) {
    await dialog.showMessageBox({
      type: 'warning',
      message: tm('updateCheckFailed'),
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
