import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Workspace } from './workspace';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-ws-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('workspace', () => {
  it('adds and removes projects and remembers them in the app data folder', () => {
    const a = path.join(dir, 'a');
    const b = path.join(dir, 'b');
    fs.mkdirSync(a);
    fs.mkdirSync(b);
    const state = path.join(dir, 'userData', 'workspace.json');
    const ws = new Workspace(state);
    expect(ws.add(a, b, a)).toBe(true);
    expect(ws.getRoots()).toEqual([a, b]);
    expect(ws.remove(a)).toBe(true);
    expect(ws.remove(a)).toBe(false);
    // the next launch (same user data folder) opens what was open
    expect(new Workspace(state).getRoots()).toEqual([b]);
    // folders that no longer exist are dropped
    fs.rmSync(b, { recursive: true });
    expect(new Workspace(state).getRoots()).toEqual([]);
  });
});
