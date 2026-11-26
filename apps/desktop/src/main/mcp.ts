import { randomBytes } from 'crypto';
import { ActionLog } from '@pc/mcp/audit';
import type { McpHost } from '@pc/mcp/host';
import { McpHttpServer, MCP_PATH } from '@pc/mcp/server';
import type { McpStatus } from '../shared/ipc';
import type { SettingsStore } from './settings';

/**
 * Lifecycle of the MCP server (PRODUCTCREATOR-18): started with the app only when "Run MCP server" is on
 * (nothing listens otherwise), restarted when the port changes, closed on quit.
 */
export class McpController {
  readonly audit: ActionLog;
  /** In-process secret of the relay client (never shown or stored) */
  readonly relayKey = randomBytes(32).toString('base64url');
  private server?: McpHttpServer;
  private serverPort = 0;
  private error?: string;
  private listeners = new Set<() => void>();

  constructor(
    private settings: SettingsStore,
    private host: McpHost,
    private version: string,
    logFile: string
  ) {
    this.audit = new ActionLog(logFile);
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  /** Bring the server in line with the settings */
  async apply(): Promise<void> {
    const { enabled, port, token, scope } = this.settings.get().mcp;
    this.error = undefined;
    if (!enabled) {
      await this.shutdown();
    } else if (this.server && this.serverPort === port) {
      this.server.configure({ token, scope });
    } else {
      await this.shutdown();
      const server = new McpHttpServer({ host: this.host, token, scope, port, audit: this.audit, version: this.version, relayKey: this.relayKey });
      try {
        await server.start();
        this.server = server;
        this.serverPort = port;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    }
    this.emit();
  }

  private async shutdown() {
    const server = this.server;
    this.server = undefined;
    this.serverPort = 0;
    if (server) await server.stop();
  }

  async stop(): Promise<void> {
    await this.shutdown();
    this.emit();
  }

  /** URL of the running local server (for the relay client) */
  get localUrl(): string | undefined {
    return this.server?.running ? this.server.url : undefined;
  }

  status(): McpStatus {
    const { enabled, port, token, scope } = this.settings.get().mcp;
    return { enabled, scope, port, token, url: `http://127.0.0.1:${port}${MCP_PATH}`, running: Boolean(this.server?.running), error: this.error };
  }
}
