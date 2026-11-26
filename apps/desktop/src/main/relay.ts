import { RelayClient, type RelayStatus } from '@pc/mcp/relay/client';
import type { RelayView } from '../shared/ipc';
import type { McpController } from './mcp';
import type { SettingsStore } from './settings';

/**
 * "Expose remotely" (PRODUCTCREATOR-20): runs the relay client while the setting is on, a device key is
 * saved and the local MCP server is running. Any change of those inputs calls `apply()`.
 */
export class RelayController {
  private client?: RelayClient;
  private clientKey = '';
  private clientUrl = '';
  private last?: RelayStatus;
  private listeners = new Set<() => void>();

  constructor(
    private settings: SettingsStore,
    private mcp: McpController,
    private version: string,
    private log: (message: string) => void = () => undefined
  ) {
    // the local server starts/stops/moves: reconnect the tunnel to the new state
    mcp.onChange(() => this.apply());
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  apply() {
    const { enabled, url } = this.settings.get().relay;
    const key = this.settings.getRelayKey();
    const want = enabled && Boolean(key) && Boolean(this.mcp.localUrl);
    if (!want || key !== this.clientKey || url !== this.clientUrl) {
      this.client?.stop();
      this.client = undefined;
      this.last = undefined;
    }
    if (want && key && !this.client) {
      this.clientKey = key;
      this.clientUrl = url;
      this.client = new RelayClient({
        url,
        deviceKey: key,
        relayKey: this.mcp.relayKey,
        localUrl: () => this.mcp.localUrl,
        clientName: `product-creator/${this.version}`,
        log: this.log,
        onStatus: (status) => {
          this.last = status;
          this.emit();
        },
      });
      this.client.start();
    }
    if (!want) {
      this.clientKey = '';
      this.clientUrl = '';
    }
    this.emit();
  }

  stop() {
    this.client?.stop();
    this.client = undefined;
  }

  status(): RelayView {
    const { enabled, url, keyEnc } = this.settings.get().relay;
    const key = this.settings.getRelayKey();
    const s = this.last;
    const waiting = enabled && !this.mcp.localUrl ? 'Turn on "Run MCP server" first: the relay forwards bot requests to it.' : enabled && keyEnc && !key ? 'The saved key cannot be decrypted (OS secure storage). Enter the key again.' : enabled && !keyEnc ? 'Paste the device key from Emperor to connect.' : undefined;
    return {
      enabled,
      url,
      hasKey: Boolean(keyEnc),
      // `rld_<deviceId>.` is not secret; the secret part is never sent to the UI
      keyHint: key ? `${key.slice(0, key.indexOf('.') + 1)}••••••••` : undefined,
      state: this.client && s ? s.state : 'off',
      publicUrl: s?.publicUrl,
      error: waiting ?? s?.error,
      requests: s?.requests ?? 0,
    };
  }
}
