import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_MCP_PORT, DEFAULT_RELAY_URL, SettingsStore, validateRelayUrl, type SecretCodec } from './settings';

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

const codec = (available = true): SecretCodec => ({
  available: () => available,
  encrypt: (plain) => Buffer.from(plain.split('').reverse().join('')).toString('base64'),
  decrypt: (enc) => Buffer.from(enc, 'base64').toString().split('').reverse().join(''),
});

describe('relay settings (PRODUCTCREATOR-20)', () => {
  it('is off by default with the production endpoint and no key', () => {
    const s = new SettingsStore(file, { mcpPort: DEFAULT_MCP_PORT }, codec()).get();
    expect(s.relay).toEqual({ enabled: false, url: DEFAULT_RELAY_URL });
    expect(DEFAULT_RELAY_URL).toBe('wss://relay.emperor.ecooz.net/tunnel');
  });

  it('stores the device key only encrypted and returns it to the main process', () => {
    const store = new SettingsStore(file, { mcpPort: DEFAULT_MCP_PORT }, codec());
    store.setRelayKey('  rld_dev-1.s3cret_Value  ');
    expect(fs.readFileSync(file, 'utf-8')).not.toContain('s3cret');
    expect(fs.readFileSync(file, 'utf-8')).not.toContain('rld_dev-1');
    expect(store.getRelayKey()).toBe('rld_dev-1.s3cret_Value');
    expect(new SettingsStore(file, { mcpPort: DEFAULT_MCP_PORT }, codec()).getRelayKey()).toBe('rld_dev-1.s3cret_Value');
    store.clearRelayKey();
    expect(store.getRelayKey()).toBeUndefined();
    expect(store.get().relay.keyEnc).toBeUndefined();
  });

  it('refuses a malformed key and refuses to save without OS secure storage', () => {
    const store = new SettingsStore(file, { mcpPort: DEFAULT_MCP_PORT }, codec());
    expect(() => store.setRelayKey('rly_bot.token')).toThrow(/device key/);
    expect(() => store.setRelayKey('rld_nodot')).toThrow(/device key/);
    const noKeychain = new SettingsStore(file, { mcpPort: DEFAULT_MCP_PORT }, codec(false));
    expect(() => noKeychain.setRelayKey('rld_a.b')).toThrow(/Secure storage/);
    expect(noKeychain.get().relay.keyEnc).toBeUndefined();
  });

  it('validates the relay URL (wss only, ws for loopback)', () => {
    expect(validateRelayUrl('wss://relay.emperor.ecooz.net/tunnel')).toBe('wss://relay.emperor.ecooz.net/tunnel');
    expect(validateRelayUrl('ws://127.0.0.1:4479/tunnel')).toContain('ws://127.0.0.1:4479');
    expect(() => validateRelayUrl('ws://example.com/tunnel')).toThrow(/wss/);
    expect(() => validateRelayUrl('https://relay.emperor.ecooz.net/tunnel')).toThrow(/wss/);
    expect(() => validateRelayUrl('nonsense')).toThrow();
  });
});
