import * as fs from 'fs';
import * as path from 'path';
import type { BrowserWindow } from 'electron';

/**
 * Product Creator's own screenshot capturer (PRODUCTCREATOR-36, dogfood). It implements the capture contract of
 * @pc/core/screens for this app: reads the request (PC_SMOKE_SCREENS = path of screens.request.json), opens each
 * screen's route in the app window, waits, runs click/fill actions, captures the page or an element and writes
 * <output>/<file> plus <output>/screens.json. Run by scripts/capture-screens.mjs through the smoke mode.
 */
interface ScreenAction {
  click?: string;
  fill?: [string, string];
  wait?: string;
}

interface RequestScreen {
  feature: string;
  id: string;
  file: string;
  path: string;
  wait?: string;
  actions?: ScreenAction[];
  element?: string;
  viewport?: [number, number];
}

const DEFAULT_VIEWPORT: [number, number] = [1400, 900];
const WAIT_MS = 10_000;
const SETTLE_MS = 700;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(win: BrowserWindow, selector: string): Promise<void> {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    if (await win.webContents.executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await sleep(200);
  }
  throw new Error(`selector not found: ${selector}`);
}

async function act(win: BrowserWindow, action: ScreenAction): Promise<void> {
  if (action.wait) return waitFor(win, action.wait);
  if (action.click) {
    await waitFor(win, action.click);
    await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(action.click)}).click()`);
  }
  if (action.fill) {
    const [selector, value] = action.fill;
    await waitFor(win, selector);
    // React controlled inputs: set through the native setter, then fire input
    await win.webContents.executeJavaScript(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
  }
  await sleep(300);
}

export async function captureAppScreens(win: BrowserWindow, requestFile: string): Promise<{ captured: number; failed: number }> {
  const request = JSON.parse(fs.readFileSync(requestFile, 'utf8')) as { output: string; screens: RequestScreen[] };
  const results: { feature: string; id: string; file?: string; ok: boolean; error?: string }[] = [];
  for (const screen of request.screens) {
    try {
      const [width, height] = screen.viewport ?? DEFAULT_VIEWPORT;
      win.setContentSize(width, height);
      // leave the route first, so the same route renders fresh
      await win.webContents.executeJavaScript(`location.hash = '#/__screens'`);
      await sleep(200);
      await win.webContents.executeJavaScript(`location.hash = ${JSON.stringify('#' + screen.path)}; window.scrollTo(0, 0)`);
      await sleep(SETTLE_MS);
      if (screen.wait) await waitFor(win, screen.wait);
      for (const action of screen.actions ?? []) await act(win, action);
      await sleep(SETTLE_MS);
      let rect: Electron.Rectangle | undefined;
      if (screen.element) {
        await waitFor(win, screen.element);
        rect = await win.webContents.executeJavaScript(`(() => {
          const el = document.querySelector(${JSON.stringify(screen.element)});
          el.scrollIntoView({ block: 'start' });
          const r = el.getBoundingClientRect();
          return { x: Math.max(0, Math.floor(r.left)), y: Math.max(0, Math.floor(r.top)), width: Math.ceil(Math.min(r.width, window.innerWidth)), height: Math.ceil(Math.min(r.height, window.innerHeight - Math.max(0, r.top))) };
        })()`);
        await sleep(200);
      }
      const image = await win.webContents.capturePage(rect);
      const file = path.join(request.output, screen.file);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, image.toPNG());
      results.push({ feature: screen.feature, id: screen.id, file: screen.file, ok: true });
    } catch (error) {
      results.push({ feature: screen.feature, id: screen.id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  fs.writeFileSync(path.join(request.output, 'screens.json'), JSON.stringify({ screens: results }, null, 2) + '\n');
  return { captured: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
}
