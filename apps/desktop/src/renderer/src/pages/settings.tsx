import { useCallback, useEffect, useState } from 'react';
import type { McpActionEntry, McpStatus } from '../../../shared/ipc';

/**
 * Desktop settings: the MCP server for AI agents (PRODUCTCREATOR-18).
 * Off by default; the server runs only while this app runs and only on 127.0.0.1.
 */

const btn = 'px-3 py-1.5 rounded border border-gray-300 bg-white text-sm hover:bg-gray-50 disabled:opacity-50';
const input = 'rounded border border-gray-300 px-2 py-1 text-sm';

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
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
      {done ? 'Copied' : label}
    </button>
  );
}

export default function SettingsPage() {
  const [mcp, setMcp] = useState<McpStatus | null>(null);
  const [log, setLog] = useState<McpActionEntry[]>([]);
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [port, setPort] = useState('');

  const loadLog = useCallback(() => void window.pc.mcp.log().then(setLog), []);

  useEffect(() => {
    void window.pc.mcp.status().then((s) => {
      setMcp(s);
      setPort(String(s.port));
    });
    loadLog();
    const off = window.pc.onMcpChanged(setMcp);
    const timer = setInterval(loadLog, 3000);
    return () => {
      off();
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

  if (!mcp) return null;
  const clientConfig = JSON.stringify({ mcpServers: { 'product-creator': { url: mcp.url, headers: { Authorization: `Bearer ${mcp.token}` } } } }, null, 2);
  const curl = `curl -s ${mcp.url} -H "Authorization: Bearer ${mcp.token}" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'`;

  return (
    <div className="max-w-4xl mx-auto px-8 py-8">
      <h1 className="text-3xl font-bold mb-1">Settings</h1>
      <p className="text-gray-600 text-sm mb-6">These settings belong to this build only (the dev build and the installed app keep separate settings and tokens).</p>

      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <section className="rounded border border-gray-200 bg-white p-5 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">MCP server</h2>
            <p className="text-sm text-gray-600 mt-1">
              Lets AI agents (Cursor, Claude, Grok Bot, …) read and edit the projects open in this app. Listens on <code>127.0.0.1</code> only, while the app is running.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium whitespace-nowrap">
            <input type="checkbox" checked={mcp.enabled} onChange={(e) => void run(() => window.pc.mcp.update({ enabled: e.target.checked }))} />
            Run MCP server
          </label>
        </div>

        <div className="mt-4 text-sm">
          Status:{' '}
          {mcp.running ? (
            <span className="text-green-700 font-medium">running on {mcp.url}</span>
          ) : mcp.enabled ? (
            <span className="text-red-700 font-medium">not running{mcp.error ? `: ${mcp.error}` : ''}</span>
          ) : (
            <span className="text-gray-600">off</span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-[110px_1fr] gap-x-4 gap-y-3 items-center text-sm">
          <label htmlFor="mcp-scope">Scope</label>
          <div className="flex items-center gap-3">
            <select id="mcp-scope" className={input} value={mcp.scope} onChange={(e) => void run(() => window.pc.mcp.update({ scope: e.target.value as 'read' | 'write' }))}>
              <option value="read">read-only</option>
              <option value="write">read-write</option>
            </select>
            <span className="text-gray-500">{mcp.scope === 'write' ? 'agents can create/update catalog entries, run sync and generate OpenAPI' : 'agents can only read'}</span>
          </div>

          <label htmlFor="mcp-port">Port</label>
          <div className="flex items-center gap-2">
            <input id="mcp-port" className={`${input} w-28`} value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" />
            <button className={btn} disabled={port === String(mcp.port)} onClick={() => void run(() => window.pc.mcp.update({ port: Number(port) }))}>
              Apply
            </button>
          </div>

          <span>URL</span>
          <div className="flex items-center gap-2">
            <code className="rounded bg-gray-100 px-2 py-1">{mcp.url}</code>
            <CopyButton text={mcp.url} />
          </div>

          <span>Token</span>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="rounded bg-gray-100 px-2 py-1 break-all">{reveal ? mcp.token : '•'.repeat(24)}</code>
            <button className={btn} onClick={() => setReveal(!reveal)}>
              {reveal ? 'Hide' : 'Show'}
            </button>
            <CopyButton text={mcp.token} />
            <button
              className={btn}
              onClick={() => {
                if (window.confirm('Generate a new token? Connected agents will have to use the new one.')) void run(() => window.pc.mcp.regenerateToken());
              }}
            >
              Regenerate
            </button>
          </div>
        </div>

        <details className="mt-5 text-sm">
          <summary className="cursor-pointer font-medium">How to connect an agent</summary>
          <p className="mt-2 text-gray-600">
            Cursor: add this to <code>~/.cursor/mcp.json</code> (or the project&apos;s <code>.cursor/mcp.json</code>). The same URL and header work in Claude and other clients that support remote MCP servers.
          </p>
          <pre className="mt-2 rounded bg-gray-900 text-gray-100 p-3 text-xs overflow-x-auto">{reveal ? clientConfig : clientConfig.replace(mcp.token, '<token: press Show>')}</pre>
          <div className="mt-2 flex gap-2">
            <CopyButton text={clientConfig} label="Copy config" />
            <CopyButton text={curl} label="Copy curl check" />
          </div>
        </details>
      </section>

      <section className="rounded border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Agent action log</h2>
          <button className={btn} onClick={loadLog}>
            Refresh
          </button>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          Every agent call of this session (full log: <code>mcp-actions.log</code> in the app data folder).
        </p>
        {log.length === 0 ? (
          <p className="text-sm text-gray-500 mt-3">No calls yet.</p>
        ) : (
          <table className="mt-3 w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1 pr-3">Time</th>
                <th className="pr-3">Caller</th>
                <th className="pr-3">Action</th>
                <th className="pr-3">Result</th>
                <th>Arguments</th>
              </tr>
            </thead>
            <tbody>
              {log.map((e, i) => (
                <tr key={`${e.ts}-${i}`} className="border-t border-gray-100 align-top">
                  <td className="py-1 pr-3 whitespace-nowrap">{new Date(e.ts).toLocaleTimeString()}</td>
                  <td className="pr-3">{e.principal}{e.userAgent ? ` (${e.userAgent.slice(0, 24)})` : ''}</td>
                  <td className="pr-3 font-mono">
                    {e.action}
                    {e.write ? ' ✎' : ''}
                  </td>
                  <td className={`pr-3 ${e.outcome === 'ok' ? 'text-green-700' : 'text-red-700'}`}>{e.outcome}{e.message ? `: ${e.message}` : ''}</td>
                  <td className="text-gray-600 break-all">{e.args ? JSON.stringify(e.args) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
