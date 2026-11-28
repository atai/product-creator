import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { UI_LANGUAGES, type UiLanguageSetting } from './i18n';

export type McpScope = 'read' | 'write';

/** Settings of the MCP server (PRODUCTCREATOR-18) */
export interface McpSettings {
  /** "Run MCP server" — default off: nothing listens until the user turns it on */
  enabled: boolean;
  /** Scope of the local token */
  scope: McpScope;
  port: number;
  /** Bearer token of local clients; stored in the user data dir of this build only */
  token: string;
}

/** Remote access through the Emperor MCP relay (PRODUCTCREATOR-20) */
export interface RelaySettings {
  /** "Expose remotely" — default off */
  enabled: boolean;
  /** Tunnel endpoint */
  url: string;
  /** Device key `rld_…` encrypted with the OS keychain (Electron safeStorage), base64 */
  keyEnc?: string;
}

export interface AppSettings {
  mcp: McpSettings;
  relay: RelaySettings;
  /** Language of the interface (PRODUCTCREATOR-37): system (follow the OS) | en | ru | de */
  uiLanguage: UiLanguageSetting;
}

export const DEFAULT_RELAY_URL = 'wss://relay.emperor.ecooz.net/tunnel';
const DEVICE_KEY_RE = /^rld_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** Encrypts secrets with the OS keychain (safeStorage in the app, a fake in tests) */
export interface SecretCodec {
  available(): boolean;
  encrypt(plain: string): string;
  decrypt(encrypted: string): string;
}

/** wss:// only; plain ws:// is allowed for loopback (local relay for testing) */
export function validateRelayUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Relay URL is not a valid URL');
  }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && loopback)) throw new Error('Relay URL must start with wss://');
  return url.toString();
}

/** Dev and packaged builds use different default ports so that both can run at the same time */
export const DEFAULT_MCP_PORT = 47631;
export const DEFAULT_MCP_PORT_DEV = 47632;

export const newToken = (): string => 'pcmcp_' + randomBytes(32).toString('base64url');

/**
 * `settings.json` in the user data dir (dev and installed builds have separate folders, so separate
 * tokens). Written with mode 0600. A missing or broken file means defaults; the token is generated once.
 */
export class SettingsStore {
  private data: AppSettings;

  constructor(
    private file: string,
    private defaults: { mcpPort: number },
    private codec?: SecretCodec
  ) {
    this.data = this.read();
  }

  private read(): AppSettings {
    let raw: Partial<AppSettings> = {};
    try {
      raw = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as Partial<AppSettings>;
    } catch {
      raw = {};
    }
    const mcp: Partial<McpSettings> = raw.mcp ?? {};
    const settings: AppSettings = {
      uiLanguage: raw.uiLanguage && (['system', ...UI_LANGUAGES] as string[]).includes(raw.uiLanguage) ? raw.uiLanguage : 'system',
      relay: { enabled: false, url: DEFAULT_RELAY_URL },
      mcp: {
        enabled: mcp.enabled === true,
        scope: mcp.scope === 'write' ? 'write' : 'read',
        port: Number.isInteger(mcp.port) && (mcp.port as number) >= 1024 && (mcp.port as number) <= 65535 ? (mcp.port as number) : this.defaults.mcpPort,
        token: typeof mcp.token === 'string' && mcp.token.length >= 24 ? mcp.token : newToken(),
      },
    };
    const relay: Partial<RelaySettings> = raw.relay ?? {};
    settings.relay = {
      enabled: relay.enabled === true,
      url: typeof relay.url === 'string' && relay.url ? relay.url : DEFAULT_RELAY_URL,
      ...(typeof relay.keyEnc === 'string' && relay.keyEnc ? { keyEnc: relay.keyEnc } : {}),
    };
    if (settings.mcp.token !== mcp.token) this.write(settings);
    return settings;
  }

  private write(settings: AppSettings) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(settings, null, 2), { mode: 0o600 });
  }

  get(): AppSettings {
    return structuredClone(this.data);
  }

  setUiLanguage(value: UiLanguageSetting): AppSettings {
    if (!(['system', ...UI_LANGUAGES] as string[]).includes(value)) throw new Error(`Unknown interface language "${value}"`);
    this.data = { ...this.data, uiLanguage: value };
    this.write(this.data);
    return this.get();
  }

  updateMcp(patch: Partial<Pick<McpSettings, 'enabled' | 'scope' | 'port'>>): AppSettings {
    const next = { ...this.data.mcp };
    if (patch.enabled !== undefined) next.enabled = patch.enabled === true;
    if (patch.scope !== undefined) next.scope = patch.scope === 'write' ? 'write' : 'read';
    if (patch.port !== undefined) {
      if (!Number.isInteger(patch.port) || patch.port < 1024 || patch.port > 65535) throw new Error('Port must be between 1024 and 65535');
      next.port = patch.port;
    }
    this.data = { ...this.data, mcp: next };
    this.write(this.data);
    return this.get();
  }

  regenerateMcpToken(): AppSettings {
    this.data = { ...this.data, mcp: { ...this.data.mcp, token: newToken() } };
    this.write(this.data);
    return this.get();
  }

  // ───────── relay (PRODUCTCREATOR-20) ─────────

  updateRelay(patch: Partial<Pick<RelaySettings, 'enabled' | 'url'>>): AppSettings {
    const next = { ...this.data.relay };
    if (patch.enabled !== undefined) next.enabled = patch.enabled === true;
    if (patch.url !== undefined) next.url = validateRelayUrl(patch.url);
    this.data = { ...this.data, relay: next };
    this.write(this.data);
    return this.get();
  }

  /** Store the device key encrypted; refuses when the OS keychain is not available (never plain text) */
  setRelayKey(key: string): AppSettings {
    const trimmed = key.trim();
    if (!DEVICE_KEY_RE.test(trimmed)) throw new Error('This is not a device key: it looks like rld_<id>.<secret> (Emperor → Profile → Remote access)');
    if (!this.codec?.available()) throw new Error('Secure storage of the operating system is not available, the key cannot be saved safely');
    this.data = { ...this.data, relay: { ...this.data.relay, keyEnc: this.codec.encrypt(trimmed) } };
    this.write(this.data);
    return this.get();
  }

  clearRelayKey(): AppSettings {
    const { keyEnc: _drop, ...rest } = this.data.relay;
    void _drop;
    this.data = { ...this.data, relay: rest };
    this.write(this.data);
    return this.get();
  }

  /** Decrypted device key for the relay client (main process only) */
  getRelayKey(): string | undefined {
    const enc = this.data.relay.keyEnc;
    if (!enc || !this.codec?.available()) return undefined;
    try {
      return this.codec.decrypt(enc);
    } catch {
      return undefined;
    }
  }
}
