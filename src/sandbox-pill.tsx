/**
 * SandboxBanner — full-width top banner with a two-segment toggle showing
 * the current dev-side test mode. Renders only when the server reports
 * sandboxAvailable=true (i.e. this is the zlz-dev box, not live).
 *
 * Layout: fixed 36px bar pinned to the top of the viewport, above every other
 * page element. Body gets 36px top-padding so no page content is hidden under
 * the banner.
 *
 *   SANDBOX (safe) — outbound SMS/WA redirected to the client phone.
 *   LIVE TEST      — real recipients. Confirm modal required to enable.
 *
 * The two options are ALWAYS visible side-by-side; the current one is
 * highlighted, the other is a click-to-switch button. No hidden "click me
 * to toggle" — the state is legible in one glance.
 */
import { useEffect, useState } from 'react';
import {
  api,
  getUser,
  isSandboxAvailable,
  refreshMeFromServer,
  setUserTestMode,
} from './api';

type Mode = 'sandbox' | 'live_test';
const BAR_HEIGHT = 36;

// Nov 5 client: the test site holds AUTOMATIC texts / WhatsApps / calls (sweeps); an admin can let
// them through for an hour from this bar. Messages a person sends by pressing something still go
// to the sandbox phone. (API: GET/POST /api/dev/auto-sends — test site only, admins only.)
type AutoSends = { until: string | null; held: number };
const autoOn = (a: AutoSends | null) => !!a?.until && Date.parse(a.until) > Date.now();
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function AutoSendsSwitch() {
  const [auto, setAuto] = useState<AutoSends | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => api<{ data: AutoSends }>('/api/dev/auto-sends')
      .then((r) => { if (alive) setAuto(r.data); }).catch(() => { /* not available — hide */ });
    void load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (!auto) return null;
  const on = autoOn(auto);
  async function set(minutes: number) {
    setBusy(true);
    try {
      const r = await api<{ data: AutoSends }>('/api/dev/auto-sends', { method: 'POST', body: JSON.stringify({ minutes }) });
      setAuto(r.data);
    } catch (err) {
      alert('Could not change it: ' + (err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#333', whiteSpace: 'nowrap' }}
      title="Automatic messages = texts, WhatsApps and calls the system sends by itself (reminders, alerts, pickup texts). Messages you send by pressing a button still go to the sandbox phone.">
      <b>Automatic messages:</b>
      {on ? <span style={{ color: '#B91C1C', fontWeight: 700 }}>going out until {clock(auto.until!)}</span> : <span>held</span>}
      <span>·</span>
      <button onClick={() => void set(on ? 0 : 60)} disabled={busy}
        style={{ padding: '2px 8px', fontSize: 12, fontWeight: 600, borderRadius: 5, border: '1px solid #333',
          background: '#fff', cursor: busy ? 'wait' : 'pointer' }}>
        {busy ? '…' : on ? 'Hold them again' : 'Let them through for 1 hour'}
      </button>
    </span>
  );
}

export function SandboxPill() {
  const [available, setAvailable] = useState<boolean>(() => isSandboxAvailable());
  const [mode, setMode] = useState<Mode>(() => (getUser()?.testMode as Mode) ?? 'sandbox');
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const isAdmin = getUser()?.role === 'admin';

  useEffect(() => {
    (async () => {
      await refreshMeFromServer();
      setAvailable(isSandboxAvailable());
      const u = getUser();
      if (u?.testMode) setMode(u.testMode);
    })();
  }, []);

  // Push page content down so the fixed banner never covers anything.
  useEffect(() => {
    if (!available) return;
    const prev = document.body.style.paddingTop;
    document.body.style.paddingTop = BAR_HEIGHT + 'px';
    return () => { document.body.style.paddingTop = prev; };
  }, [available]);

  if (!available) return null;

  async function commit(next: Mode) {
    setBusy(true);
    try {
      await setUserTestMode(next);
      setMode(next);
      setShowConfirm(false);
    } catch (err) {
      alert('Could not change mode: ' + (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function pick(next: Mode) {
    if (next === mode || busy) return;
    if (next === 'live_test') setShowConfirm(true);
    else void commit('sandbox');
  }

  const isSandbox = mode === 'sandbox';
  const barBg = isSandbox ? '#FEF3C7' : '#FEE2E2';
  const barBorder = isSandbox ? '#F59E0B' : '#DC2626';

  return (
    <>
      <div
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: BAR_HEIGHT,
          background: barBg, borderBottom: '2px solid ' + barBorder,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
          zIndex: 9999, fontFamily: 'system-ui, -apple-system, sans-serif',
          boxShadow: '0 2px 6px rgba(0,0,0,0.1)', userSelect: 'none',
          overflowX: 'auto', whiteSpace: 'nowrap', // Nov 5 client: room for the automatic-messages switch on phones
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: '#333', letterSpacing: 0.4 }}>
          DEV — TESTING MODE:
        </span>
        <div style={{
          display: 'inline-flex', borderRadius: 6, overflow: 'hidden',
          border: '1.5px solid #333', background: '#fff',
        }}>
          <button
            onClick={() => pick('sandbox')}
            disabled={busy}
            style={{
              padding: '4px 14px', fontSize: 13, fontWeight: 700, border: 'none',
              background: isSandbox ? '#F59E0B' : 'transparent',
              color: isSandbox ? '#fff' : '#666',
              cursor: (isSandbox || busy) ? 'default' : 'pointer',
            }}
            title="All SMS/WA redirected to your phone. Safe."
          >
            SANDBOX
          </button>
          <div style={{ width: 1, background: '#333' }} />
          <button
            onClick={() => pick('live_test')}
            disabled={busy}
            style={{
              padding: '4px 14px', fontSize: 13, fontWeight: 700, border: 'none',
              background: !isSandbox ? '#DC2626' : 'transparent',
              color: !isSandbox ? '#fff' : '#666',
              cursor: (!isSandbox || busy) ? 'default' : 'pointer',
            }}
            title="Real drivers and stores will get real messages."
          >
            LIVE TEST
          </button>
        </div>
        <span style={{ fontSize: 11, color: '#555', fontStyle: 'italic' }}>
          {isSandbox
            ? 'outbound SMS/WA -> +1 845-376-2748'
            : 'REAL recipients — real messages fire'}
        </span>
        {isAdmin && <AutoSendsSwitch />}
      </div>

      {showConfirm && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(0,0,0,0.55)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={() => !busy && setShowConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 12, padding: 24, maxWidth: 440,
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#DC2626' }}>
              Turn on LIVE TEST mode?
            </h2>
            <p style={{ marginTop: 12, marginBottom: 4, fontSize: 14, lineHeight: 1.5, color: '#333' }}>
              Every SMS and WhatsApp message you (or the automatic sweepers) trigger
              will go to <b>the real volunteers and stores</b>, not just your phone.
            </p>
            <p style={{ marginTop: 12, marginBottom: 4, fontSize: 14, lineHeight: 1.5, color: '#333' }}>
              Use this only for a real end-to-end validation. Flip back to SANDBOX
              as soon as you are done.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowConfirm(false)}
                disabled={busy}
                style={{
                  padding: '10px 20px', fontSize: 14, fontWeight: 600, borderRadius: 8,
                  border: '1.5px solid #ccc', background: '#f5f5f5',
                  cursor: busy ? 'wait' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => void commit('live_test')}
                disabled={busy}
                style={{
                  padding: '10px 20px', fontSize: 14, fontWeight: 700, borderRadius: 8,
                  border: 'none', background: '#DC2626', color: 'white',
                  cursor: busy ? 'wait' : 'pointer',
                }}
              >
                {busy ? 'Switching...' : 'Yes, go LIVE TEST'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
