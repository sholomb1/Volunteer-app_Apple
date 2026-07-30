/**
 * On-device connectivity diagnostic for the login screen. Surfaces the
 * actual failure mode (DNS, TLS, CORS, time skew) so we don't have to
 * guess why fetch() throws on one phone but not another.
 *
 * Probes (in order):
 *   1. GET  {API_BASE}/api/health            → should be 200
 *   2. OPTIONS preflight on /auth/login      → should be 204
 *   3. POST garbage creds to /auth/login     → should be 401 (proves reachable)
 *
 * Each probe shows the exact result text — `TypeError: Failed to fetch` vs.
 * a real HTTP code is the diagnostic distinction we need. Also surfaces
 * device clock skew vs. server time and the resolved API_BASE.
 */
import { useState } from 'react';
import { API_BASE } from './api';

type Probe = { name: string; ok: boolean; detail: string };

/** no-cors probe — confirms TCP + TLS reach the host even if CORS would block reading. */
async function probeNoCors(name: string, url: string): Promise<Probe> {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store' });
    const ms = Date.now() - t0;
    return { name, ok: true, detail: `reached (opaque response) · type=${r.type} · ${ms} ms` };
  } catch (e: any) {
    const ms = Date.now() - t0;
    return { name, ok: false, detail: `${e?.name ?? 'Error'}: ${e?.message ?? String(e)} · ${ms} ms` };
  }
}

/** XHR-based probe — Capacitor sometimes routes XHR differently than fetch. */
function xhrProbe(name: string, url: string): Promise<Probe> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    try {
      const x = new XMLHttpRequest();
      x.open('GET', url, true);
      x.timeout = 10_000;
      x.onload = () => resolve({
        name, ok: x.status >= 200 && x.status < 400,
        detail: `HTTP ${x.status} ${x.statusText} · ${Date.now() - t0} ms`,
      });
      x.onerror = () => resolve({ name, ok: false, detail: `XHR error · readyState=${x.readyState} · status=${x.status} · ${Date.now() - t0} ms` });
      x.ontimeout = () => resolve({ name, ok: false, detail: `XHR timeout · ${Date.now() - t0} ms` });
      x.send();
    } catch (e: any) {
      resolve({ name, ok: false, detail: `XHR exception: ${e?.message ?? String(e)} · ${Date.now() - t0} ms` });
    }
  });
}

async function probe(name: string, url: string, init: RequestInit | undefined, expectedStatus: number[] | null): Promise<Probe> {
  const t0 = Date.now();
  try {
    const r = await fetch(url, init);
    const ms = Date.now() - t0;
    const okHttp = expectedStatus ? expectedStatus.includes(r.status) : r.ok;
    const serverDate = r.headers.get('date');
    return {
      name,
      ok: okHttp,
      detail: `HTTP ${r.status} ${r.statusText || ''} · ${ms} ms${serverDate ? ` · server time ${serverDate}` : ''}`,
    };
  } catch (e: any) {
    const ms = Date.now() - t0;
    return {
      name,
      ok: false,
      detail: `${e?.name ?? 'Error'}: ${e?.message ?? String(e)} · ${ms} ms`,
    };
  }
}

export function ConnectionCheck() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Probe[]>([]);
  const [open, setOpen]       = useState(false);

  async function run() {
    setRunning(true);
    setResults([]);
    const out: Probe[] = [];

    // 0. Has the WebView noticed network at all?
    out.push({
      name: '0. navigator.onLine',
      ok:   typeof navigator !== 'undefined' && navigator.onLine === true,
      detail: `navigator.onLine = ${typeof navigator !== 'undefined' ? String(navigator.onLine) : 'undefined'}`,
    });
    setResults([...out]);

    // 1. Internet at all? no-cors fetch a public endpoint — succeeds if
    //    DNS + TCP + TLS basically work, regardless of CORS.
    out.push(await probeNoCors('1. Public internet (cloudflare.com)', 'https://www.cloudflare.com/cdn-cgi/trace'));
    setResults([...out]);

    // 2. Can we reach Google by IP? Different DNS / TLS path.
    out.push(await probeNoCors('2. Public internet (1.1.1.1 via HTTPS)', 'https://1.1.1.1/cdn-cgi/trace'));
    setResults([...out]);

    // 3. Our API domain — health endpoint.
    out.push(await probe('3. GET /api/health',
      `${API_BASE}/api/health`, { method: 'GET', cache: 'no-store' }, [200]));
    setResults([...out]);

    // 4. CORS preflight on /auth/login.
    out.push(await probe('4. OPTIONS preflight on /api/auth/login',
      `${API_BASE}/api/auth/login`,
      { method: 'OPTIONS',
        headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } },
      [204, 200]));
    setResults([...out]);

    // 5. Actual login POST with garbage creds — expects 401.
    out.push(await probe('5. POST /api/auth/login (expects 401)',
      `${API_BASE}/api/auth/login`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'connection-check', password: 'connection-check' }) },
      [401]));
    setResults([...out]);

    // 6. XHR comparison — does XMLHttpRequest reach the API even if fetch dies?
    out.push(await xhrProbe('6. XHR GET /api/health (alt path)',
      `${API_BASE}/api/health`));
    setResults([...out]);

    setRunning(false);
  }

  const cap = typeof window !== 'undefined' ? (window as any).Capacitor : undefined;
  const platform = cap?.getPlatform?.() ?? 'web';
  const native = cap?.isNativePlatform?.() === true;
  const host = typeof window !== 'undefined' ? window.location.host : '';
  const deviceTime = typeof window !== 'undefined' ? new Date().toString() : '';

  return (
    <div className="mt-6 rounded-[12px] border border-line bg-paper/70">
      <button type="button" onClick={() => setOpen((v) => !v)}
              className="w-full text-left px-4 py-2.5 text-[12.5px] font-bold text-muted flex items-center justify-between haptic">
        <span>Connection check</span>
        <span>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-2 text-[12px] text-ink">
          <div className="space-y-0.5 text-[11.5px] text-muted font-mono break-all">
            <div>API: {API_BASE}</div>
            <div>Origin: {host}</div>
            <div>Platform: {platform} {native ? '(native)' : '(web)'}</div>
            <div>Device clock: {deviceTime}</div>
          </div>

          <button type="button" onClick={run} disabled={running}
                  className="haptic w-full bg-forest text-paper font-bold rounded-[10px] py-2.5 disabled:opacity-50">
            {running ? 'Testing…' : 'Run check'}
          </button>

          {results.length > 0 && (
            <div className="space-y-1.5">
              {results.map((r, i) => (
                <div key={i} className="text-[12px] leading-snug">
                  <div className={r.ok ? 'text-forest font-bold' : 'text-clay font-bold'}>
                    {r.ok ? '✓' : '✗'} {r.name}
                  </div>
                  <div className="text-muted break-all pl-3">{r.detail}</div>
                </div>
              ))}
            </div>
          )}

          {!running && results.length > 0 && (
            <p className="text-[11px] text-muted pt-2 border-t border-line">
              Send a screenshot of this entire box to your coordinator if any line shows ✗.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
