import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_MCP_PORT, SettingsStore } from './settings';

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-settings-'));
  file = path.join(dir, 'settings.json');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('SettingsStore', () => {
  it('starts with the MCP server off, read-only scope and a generated token', () => {
    const s = new SettingsStore(file, { mcpPort: DEFAULT_MCP_PORT }).get();
    expect(s.mcp).toMatchObject({ enabled: false, scope: 'read', port: DEFAULT_MCP_PORT });
    expect(s.mcp.token).toMatch(/^pcmcp_[A-Za-z0-9_-]{40,}$/);
  });

  it('keeps the token across restarts and writes the file with mode 0600', () => {
    const a = new SettingsStore(file, { mcpPort: 1 + 1023 }).get().mcp.token;
    const b = new SettingsStore(file, { mcpPort: 1024 }).get().mcp.token;
    expect(b).toBe(a);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it('persists changes and regenerates the token', () => {
    const store = new SettingsStore(file, { mcpPort: DEFAULT_MCP_PORT });
    const before = store.get().mcp.token;
    store.updateMcp({ enabled: true, scope: 'write', port: 50000 });
    const after = store.regenerateMcpToken().mcp;
    expect(after.token).not.toBe(before);
    expect(new SettingsStore(file, { mcpPort: DEFAULT_MCP_PORT }).get().mcp).toMatchObject({ enabled: true, scope: 'write', port: 50000, token: after.token });
  });

  it('rejects invalid ports and survives a broken file', () => {
    const store = new SettingsStore(file, { mcpPort: DEFAULT_MCP_PORT });
    expect(() => store.updateMcp({ port: 80 })).toThrow();
    fs.writeFileSync(file, '{ not json');
    expect(new SettingsStore(file, { mcpPort: DEFAULT_MCP_PORT }).get().mcp.enabled).toBe(false);
  });
});
