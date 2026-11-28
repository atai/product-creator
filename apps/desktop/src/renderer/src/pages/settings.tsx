import { useCallback, useEffect, useState } from 'react';
import type { McpActionEntry, McpStatus, RelayView, UiLanguageInfo } from '../../../shared/ipc';
import { t } from '@/i18n';

const LANGUAGE_NAMES: Record<UiLanguageInfo['language'], string> = { en: 'English', ru: 'Русский', de: 'Deutsch' };

/**
 * Desktop settings: interface language (PRODUCTCREATOR-37), the MCP server for AI agents (PRODUCTCREATOR-18).
 * Off by default; the server runs only while this app runs and only on 127.0.0.1.
 */

const btn = 'px-3 py-1.5 rounded border border-border-strong bg-surface text-sm hover:bg-bg disabled:opacity-50';
const input = 'rounded border border-border-strong px-2 py-1 text-sm';

function CopyButton({ text, label = t('settings.copy') }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={btn}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? t('settings.copied') : label}
    </button>
  );
}

export default function SettingsPage() {
  const [mcp, setMcp] = useState<McpStatus | null>(null);
  const [log, setLog] = useState<McpActionEntry[]>([]);
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [port, setPort] = useState('');
  const [relay, setRelay] = useState<RelayView | null>(null);
  const [relayKey, setRelayKey] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const [ui, setUi] = useState<UiLanguageInfo | null>(null);

  const loadLog = useCallback(() => void window.pc.mcp.log().then(setLog), []);

  useEffect(() => {
    void window.pc.mcp.status().then((s) => {
      setMcp(s);
      setPort(String(s.port));
    });
    loadLog();
    void window.pc.relay.status().then(setRelay);
    void window.pc.ui.language().then(setUi);
    const off = window.pc.onMcpChanged(setMcp);
    const offRelay = window.pc.onRelayChanged(setRelay);
    const timer = setInterval(loadLog, 3000);
    return () => {
      off();
      offRelay();
      clearInterval(timer);
    };
  }, [loadLog]);

  const run = async (action: () => Promise<McpStatus>) => {
    try {
      setError(null);
      const status = await action();
      setMcp(status);
      setPort(String(status.port));
    } catch (e) {
      setError((e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    }
  };

  const runRelay = async (action: () => Promise<RelayView>) => {
    try {
      setError(null);
      setRelay(await action());
    } catch (e) {
      setError((e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    }
  };

  if (!mcp || !relay) return null;
  const relayLabel: Record<RelayView['state'], string> = {
    off: t('settings.relay.off'),
    connecting: t('settings.relay.connecting'),
    online: t('settings.relay.online'),
    reconnecting: t('settings.relay.reconnecting'),
    invalid_key: t('settings.relay.invalid_key'),
    revoked: t('settings.relay.revoked'),
    replaced: t('settings.relay.replaced'),
  };
  const clientConfig = JSON.stringify({ mcpServers: { 'product-creator': { url: mcp.url, headers: { Authorization: `Bearer ${mcp.token}` } } } }, null, 2);
  const curl = `curl -s ${mcp.url} -H "Authorization: Bearer ${mcp.token}" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'`;

  return (
    <div className="max-w-4xl mx-auto px-8 py-8">
      <h1 className="text-3xl font-bold mb-1">{t('settings.title')}</h1>
      <p className="text-muted text-sm mb-6">{t('settings.lead')}</p>

      {error && (
        <div className="mb-4 rounded border border-danger-border bg-danger-muted p-3 text-sm text-danger-fg" role="alert">
          {error}
        </div>
      )}

      {ui && (
        <section className="rounded border border-border bg-surface p-5 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">{t('settings.language')}</h2>
              <p className="text-sm text-muted mt-1">{t('settings.languageLead')}</p>
              {ui.forced && <p className="text-sm text-warn-fg mt-1">{t('settings.languageForced')}</p>}
            </div>
            <select
              aria-label={t('settings.language')}
              className={input}
              value={ui.setting}
              onChange={(e) => void window.pc.ui.setLanguage(e.target.value as UiLanguageInfo['setting']).then(setUi)}
            >
              <option value="system">{t('settings.languageSystem', { language: LANGUAGE_NAMES[ui.system] })}</option>
              {(Object.keys(LANGUAGE_NAMES) as UiLanguageInfo['language'][]).map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_NAMES[l]}
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      <section className="rounded border border-border bg-surface p-5 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{t('settings.mcp')}</h2>
            <p className="text-sm text-muted mt-1">{t('settings.mcpLead')}</p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium whitespace-nowrap">
            <input type="checkbox" checked={mcp.enabled} onChange={(e) => void run(() => window.pc.mcp.update({ enabled: e.target.checked }))} />
            {t('settings.runMcp')}
          </label>
        </div>

        <div className="mt-4 text-sm">
          {t('settings.status')}{' '}
          {mcp.running ? (
            <span className="text-success font-medium">{t('settings.runningOn', { url: mcp.url })}</span>
          ) : mcp.enabled ? (
            <span className="text-danger-fg font-medium">
              {t('settings.notRunning')}
              {mcp.error ? `: ${mcp.error}` : ''}
            </span>
          ) : (
            <span className="text-muted">{t('settings.off')}</span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-[110px_1fr] gap-x-4 gap-y-3 items-center text-sm">
          <label htmlFor="mcp-scope">{t('settings.scope')}</label>
          <div className="flex items-center gap-3">
            <select id="mcp-scope" className={input} value={mcp.scope} onChange={(e) => void run(() => window.pc.mcp.update({ scope: e.target.value as 'read' | 'write' }))}>
              <option value="read">{t('settings.readOnly')}</option>
              <option value="write">{t('settings.readWrite')}</option>
            </select>
            <span className="text-meta">{mcp.scope === 'write' ? t('settings.scopeWrite') : t('settings.scopeRead')}</span>
          </div>

          <label htmlFor="mcp-port">{t('settings.port')}</label>
          <div className="flex items-center gap-2">
            <input id="mcp-port" className={`${input} w-28`} value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" />
            <button className={btn} disabled={port === String(mcp.port)} onClick={() => void run(() => window.pc.mcp.update({ port: Number(port) }))}>
              {t('settings.apply')}
            </button>
          </div>

          <span>URL</span>
          <div className="flex items-center gap-2">
            <code className="rounded bg-surface-muted px-2 py-1">{mcp.url}</code>
            <CopyButton text={mcp.url} />
          </div>

          <span>{t('settings.token')}</span>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="rounded bg-surface-muted px-2 py-1 break-all">{reveal ? mcp.token : '•'.repeat(24)}</code>
            <button className={btn} onClick={() => setReveal(!reveal)}>
              {reveal ? t('settings.hide') : t('settings.show')}
            </button>
            <CopyButton text={mcp.token} />
            <button
              className={btn}
              onClick={() => {
                if (window.confirm(t('settings.regenerateConfirm'))) void run(() => window.pc.mcp.regenerateToken());
              }}
            >
              {t('settings.regenerate')}
            </button>
          </div>
        </div>

        <details className="mt-5 text-sm">
          <summary className="cursor-pointer font-medium">{t('settings.howToConnect')}</summary>
          <p className="mt-2 text-muted">{t('settings.howToConnectLead')}</p>
          <pre className="mt-2 rounded bg-surface-inverse text-fg-inverse p-3 text-xs overflow-x-auto">{reveal ? clientConfig : clientConfig.replace(mcp.token, t('settings.tokenHidden'))}</pre>
          <div className="mt-2 flex gap-2">
            <CopyButton text={clientConfig} label={t('settings.copyConfig')} />
            <CopyButton text={curl} label={t('settings.copyCurl')} />
          </div>
        </details>
      </section>

      <section className="rounded border border-border bg-surface p-5 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{t('settings.remote')}</h2>
            <p className="text-sm text-muted mt-1">
              {t('settings.remoteLead')}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium whitespace-nowrap">
            <input type="checkbox" checked={relay.enabled} onChange={(e) => void runRelay(() => window.pc.relay.update({ enabled: e.target.checked }))} />
            {t('settings.remote')}
          </label>
        </div>

        <div className="mt-4 grid grid-cols-[110px_1fr] gap-x-4 gap-y-3 items-center text-sm">
          <span>{t('settings.status')}</span>
          <span className={relay.state === 'online' ? 'text-success font-medium' : ['invalid_key', 'revoked', 'replaced'].includes(relay.state) ? 'text-danger-fg font-medium' : 'text-fg-2'}>
            {relayLabel[relay.state]}
            {relay.state === 'online' ? ` · ${t('settings.requests', { count: relay.requests })}` : ''}
          </span>

          {relay.error && (
            <>
              <span />
              <span className="text-warn-fg">{relay.error}</span>
            </>
          )}

          <span>{t('settings.publicUrl')}</span>
          {relay.publicUrl ? (
            <div className="flex items-center gap-2">
              <code className="rounded bg-surface-muted px-2 py-1 break-all">{relay.publicUrl}</code>
              <CopyButton text={relay.publicUrl} />
            </div>
          ) : (
            <span className="text-meta">{t('settings.shownWhenOnline')}</span>
          )}

          <label htmlFor="relay-key">{t('settings.deviceKey')}</label>
          <div className="flex items-center gap-2 flex-wrap">
            {relay.hasKey && <code className="rounded bg-surface-muted px-2 py-1">{relay.keyHint ?? t('settings.saved')}</code>}
            <input
              id="relay-key"
              type="password"
              autoComplete="off"
              placeholder={relay.hasKey ? t('settings.newKey') : 'rld_…'}
              className={`${input} w-72`}
              value={relayKey}
              onChange={(e) => setRelayKey(e.target.value)}
            />
            <button
              className={btn}
              disabled={!relayKey.trim()}
              onClick={() =>
                void runRelay(async () => {
                  const status = await window.pc.relay.setKey(relayKey);
                  setRelayKey('');
                  return status;
                })
              }
            >
              {t('settings.saveKey')}
            </button>
            {relay.hasKey && (
              <button className={btn} onClick={() => void runRelay(() => window.pc.relay.clearKey())}>
                {t('settings.removeKey')}
              </button>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-meta">{t('settings.keyHelp')}</p>

        <details className="mt-3 text-sm" open={showUrl} onToggle={(e) => setShowUrl((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer text-muted">{t('settings.advanced')}</summary>
          <div className="mt-2 flex items-center gap-2">
            <label htmlFor="relay-url">{t('settings.relayEndpoint')}</label>
            <input id="relay-url" className={`${input} w-96`} defaultValue={relay.url} key={relay.url} onBlur={(e) => e.target.value !== relay.url && void runRelay(() => window.pc.relay.update({ url: e.target.value }))} />
          </div>
        </details>
      </section>

      <section className="rounded border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{t('settings.log')}</h2>
          <button className={btn} onClick={loadLog}>
            {t('settings.refresh')}
          </button>
        </div>
        <p className="text-sm text-muted mt-1">{t('settings.logLead')}</p>
        {log.length === 0 ? (
          <p className="text-sm text-meta mt-3">{t('settings.noCalls')}</p>
        ) : (
          <table className="mt-3 w-full text-xs">
            <thead>
              <tr className="text-left text-meta">
                <th className="py-1 pr-3">{t('settings.time')}</th>
                <th className="pr-3">{t('settings.caller')}</th>
                <th className="pr-3">{t('settings.action')}</th>
                <th className="pr-3">{t('settings.result')}</th>
                <th>{t('settings.arguments')}</th>
              </tr>
            </thead>
            <tbody>
              {log.map((e, i) => (
                <tr key={`${e.ts}-${i}`} className="border-t border-border align-top">
                  <td className="py-1 pr-3 whitespace-nowrap">{new Date(e.ts).toLocaleTimeString()}</td>
                  <td className="pr-3">{e.principal}{e.userAgent ? ` (${e.userAgent.slice(0, 24)})` : ''}</td>
                  <td className="pr-3 font-mono">
                    {e.action}
                    {e.write ? ' ✎' : ''}
                  </td>
                  <td className={`pr-3 ${e.outcome === 'ok' ? 'text-success' : 'text-danger-fg'}`}>{e.outcome}{e.message ? `: ${e.message}` : ''}</td>
                  <td className="text-muted break-all">{e.args ? JSON.stringify(e.args) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
