export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

export type ResizeEdges = {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
};

/** Which window edges are under the cursor at the start of a resize gesture. */
export function detectResizeEdges(bounds: Rect, cursor: Point, threshold = 24): ResizeEdges {
  const distLeft = Math.abs(cursor.x - bounds.x);
  const distRight = Math.abs(cursor.x - (bounds.x + bounds.width));
  const distTop = Math.abs(cursor.y - bounds.y);
  const distBottom = Math.abs(cursor.y - (bounds.y + bounds.height));
  const nearH = Math.min(distLeft, distRight) <= threshold;
  const nearV = Math.min(distTop, distBottom) <= threshold;

  return {
    left: nearH && distLeft <= distRight,
    right: nearH && distRight < distLeft,
    top: nearV && distTop <= distBottom,
    bottom: nearV && distBottom < distTop,
  };
}

/**
 * Compute new window bounds from cursor delta, keeping the opposite corner fixed.
 * Does not use Electron's will-resize newBounds (those can jump to another display on macOS).
 */
export function boundsFromCursorDelta(
  startBounds: Rect,
  edges: ResizeEdges,
  startCursor: Point,
  cursor: Point,
  minWidth = 200,
  minHeight = 120
): Rect {
  const dx = cursor.x - startCursor.x;
  const dy = cursor.y - startCursor.y;
  let { x, y, width, height } = startBounds;

  if (edges.right) {
    width = Math.max(minWidth, startBounds.width + dx);
  }
  if (edges.left) {
    width = Math.max(minWidth, startBounds.width - dx);
    x = startBounds.x + startBounds.width - width;
  }
  if (edges.bottom) {
    height = Math.max(minHeight, startBounds.height + dy);
  }
  if (edges.top) {
    height = Math.max(minHeight, startBounds.height - dy);
    y = startBounds.y + startBounds.height - height;
  }

  return { x, y, width, height };
}

type ScreenLike = {
  getAllDisplays: () => unknown[];
  getCursorScreenPoint: () => Point;
};

type WindowLike = {
  getBounds: () => Rect;
  setBounds: (bounds: Partial<Rect>) => void;
  on(event: 'will-resize', listener: (event: { preventDefault: () => void }) => void): void;
  on(event: 'resized', listener: () => void): void;
  removeListener(event: 'will-resize', listener: (event: { preventDefault: () => void }) => void): void;
  removeListener(event: 'resized', listener: () => void): void;
};

/**
 * On macOS with multiple displays, native live-resize can teleport the window.
 * Intercept will-resize and drive bounds from the cursor instead.
 */
export function attachMacMultiDisplayResizeGuard(
  win: WindowLike,
  screenApi: ScreenLike,
  platform: NodeJS.Platform = process.platform
): () => void {
  if (platform !== 'darwin') return () => undefined;

  let session: { bounds: Rect; cursor: Point; edges: ResizeEdges } | null = null;

  const onWillResize = (event: { preventDefault: () => void }) => {
    if (screenApi.getAllDisplays().length < 2) return;
    event.preventDefault();
    const cursor = screenApi.getCursorScreenPoint();
    if (!session) {
      const bounds = win.getBounds();
      session = { bounds, cursor, edges: detectResizeEdges(bounds, cursor) };
    }
    win.setBounds(boundsFromCursorDelta(session.bounds, session.edges, session.cursor, cursor));
  };

  const clearSession = () => {
    session = null;
  };

  win.on('will-resize', onWillResize);
  win.on('resized', clearSession);

  return () => {
    win.removeListener('will-resize', onWillResize);
    win.removeListener('resized', clearSession);
    clearSession();
  };
}
