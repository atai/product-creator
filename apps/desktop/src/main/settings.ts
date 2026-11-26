import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

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

export interface AppSettings {
  mcp: McpSettings;
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
    private defaults: { mcpPort: number }
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
      mcp: {
        enabled: mcp.enabled === true,
        scope: mcp.scope === 'write' ? 'write' : 'read',
        port: Number.isInteger(mcp.port) && (mcp.port as number) >= 1024 && (mcp.port as number) <= 65535 ? (mcp.port as number) : this.defaults.mcpPort,
        token: typeof mcp.token === 'string' && mcp.token.length >= 24 ? mcp.token : newToken(),
      },
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
}
