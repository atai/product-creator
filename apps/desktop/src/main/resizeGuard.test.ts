import { describe, expect, it, vi } from 'vitest';
import {
  attachMacMultiDisplayResizeGuard,
  boundsFromCursorDelta,
  detectResizeEdges,
  type Point,
  type Rect,
} from './resizeGuard';

const box: Rect = { x: 100, y: 80, width: 400, height: 300 };

describe('detectResizeEdges', () => {
  it('detects right and bottom edges', () => {
    expect(detectResizeEdges(box, { x: 500, y: 230 })).toEqual({
      left: false,
      right: true,
      top: false,
      bottom: false,
    });
    expect(detectResizeEdges(box, { x: 300, y: 380 })).toEqual({
      left: false,
      right: false,
      top: false,
      bottom: true,
    });
  });

  it('detects corners', () => {
    expect(detectResizeEdges(box, { x: 100, y: 80 })).toEqual({
      left: true,
      right: false,
      top: true,
      bottom: false,
    });
    expect(detectResizeEdges(box, { x: 500, y: 380 })).toEqual({
      left: false,
      right: true,
      top: false,
      bottom: true,
    });
  });
});

describe('boundsFromCursorDelta', () => {
  const startCursor: Point = { x: 500, y: 380 };

  it('grows from the bottom-right corner and keeps the opposite corner fixed', () => {
    const next = boundsFromCursorDelta(
      box,
      { left: false, right: true, top: false, bottom: true },
      startCursor,
      { x: 520, y: 400 }
    );
    expect(next).toEqual({ x: 100, y: 80, width: 420, height: 320 });
  });

  it('resizes from the left edge without leaving the original place', () => {
    const next = boundsFromCursorDelta(
      box,
      { left: true, right: false, top: false, bottom: false },
      { x: 100, y: 200 },
      { x: 80, y: 200 }
    );
    expect(next).toEqual({ x: 80, y: 80, width: 420, height: 300 });
  });

  it('respects minimum size', () => {
    const next = boundsFromCursorDelta(
      box,
      { left: false, right: true, top: false, bottom: false },
      { x: 500, y: 200 },
      { x: 0, y: 200 },
      200,
      120
    );
    expect(next.width).toBe(200);
    expect(next.x).toBe(100);
  });
});

describe('attachMacMultiDisplayResizeGuard', () => {
  it('does nothing on non-mac platforms', () => {
    const win = {
      getBounds: vi.fn(),
      setBounds: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    const dispose = attachMacMultiDisplayResizeGuard(win, { getAllDisplays: () => [], getCursorScreenPoint: () => ({ x: 0, y: 0 }) }, 'linux');
    expect(win.on).not.toHaveBeenCalled();
    dispose();
  });

  it('drives setBounds from the cursor and skips native newBounds', () => {
    const listeners = new Map<string, (event?: { preventDefault: () => void }) => void>();
    const win = {
      getBounds: vi.fn(() => ({ ...box })),
      setBounds: vi.fn(),
      on: vi.fn((event: string, listener: (event?: { preventDefault: () => void }) => void) => {
        listeners.set(event, listener);
      }),
      removeListener: vi.fn(),
    };
    const screenApi = {
      getAllDisplays: vi.fn(() => [{}, {}]),
      getCursorScreenPoint: vi.fn(() => ({ x: 500, y: 230 })),
    };

    attachMacMultiDisplayResizeGuard(win, screenApi, 'darwin');
    const willResize = listeners.get('will-resize');
    expect(willResize).toBeTypeOf('function');

    const event = { preventDefault: vi.fn() };
    willResize!(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(win.setBounds).toHaveBeenCalledWith(box);

    screenApi.getCursorScreenPoint.mockReturnValue({ x: 530, y: 230 });
    willResize!({ preventDefault: vi.fn() });
    expect(win.setBounds).toHaveBeenLastCalledWith({ x: 100, y: 80, width: 430, height: 300 });
  });

  it('leaves native resize alone with a single display', () => {
    const listeners = new Map<string, (event?: { preventDefault: () => void }) => void>();
    const win = {
      getBounds: vi.fn(),
      setBounds: vi.fn(),
      on: vi.fn((event: string, listener: (event?: { preventDefault: () => void }) => void) => {
        listeners.set(event, listener);
      }),
      removeListener: vi.fn(),
    };
    attachMacMultiDisplayResizeGuard(
      win,
      { getAllDisplays: () => [{}], getCursorScreenPoint: () => ({ x: 0, y: 0 }) },
      'darwin'
    );
    const event = { preventDefault: vi.fn() };
    listeners.get('will-resize')!(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(win.setBounds).not.toHaveBeenCalled();
  });
});
