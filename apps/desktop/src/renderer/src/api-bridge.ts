/**
 * Route `fetch('/api/...')` calls of the ported pages to the Electron main process (IPC),
 * where the same @pc/core handlers as in the web app are dispatched.
 */
const originalFetch = window.fetch.bind(window);

window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith('/api/')) return originalFetch(input, init);
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((value, key) => (headers[key] = value));
  const result = await window.pc.api({
    method: init?.method ?? 'GET',
    url,
    headers,
    body: typeof init?.body === 'string' ? init.body : undefined,
  });
  return new Response(result.status === 204 ? null : result.body, { status: result.status, headers: result.headers });
};

export {};
