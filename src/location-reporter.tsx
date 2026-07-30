/**
 * Background-ish location reporter for the driver-facing app.
 *
 * • Asks for permission once. If denied or the platform doesn't have a
 *   geolocation API (some desktop PWAs), the hook stays silent.
 * • Reports to POST /api/me/location every 60 seconds while the app is in
 *   the foreground and the user has opted in (see useLocationReporting).
 * • Stops gracefully when the user logs out or toggles tracking off.
 *
 * Opt-in is sticky in localStorage under `vp.location.tracking`. Default
 * is OFF — the volunteer chooses to turn it on from the home screen.
 *
 * Privacy note: we do NOT use a background-location foreground service.
 * Reports stop when the app is backgrounded; that's intentional.
 */
import { useEffect, useRef, useState } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { location } from './api';

const REPORT_INTERVAL_MS = 60_000;
const FIRST_REPORT_DELAY_MS = 4_000;
const STORAGE_KEY = 'vp.location.tracking';

export type ReporterStatus = {
  enabled: boolean;
  permission: 'unknown' | 'granted' | 'denied' | 'prompt';
  lastReportedAt: number | null;
  lastError: string | null;
  reportsSent: number;
};

export function getTrackingEnabled(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}
export function setTrackingEnabled(on: boolean) {
  try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch {}
  try { window.dispatchEvent(new CustomEvent('vp:tracking-changed', { detail: { enabled: on } })); } catch {}
}

async function readPosition(): Promise<{ lat: number; lng: number; accuracy?: number } | { error: string }> {
  try {
    const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, maximumAge: 30_000, timeout: 12_000 });
    return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? undefined };
  } catch (e: any) {
    return { error: `GPS: ${e?.message ?? String(e)}` };
  }
}

/** Manual one-shot — surfaces every failure so the user can see it. */
export async function reportNow(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const status = await Geolocation.checkPermissions();
    if (status.location !== 'granted') {
      const req = await Geolocation.requestPermissions();
      if (req.location !== 'granted') return { ok: false, error: `Permission ${req.location}` };
    }
  } catch (e: any) {
    return { ok: false, error: `Permission check failed: ${e?.message ?? String(e)}` };
  }
  const pos = await readPosition();
  if ('error' in pos) return { ok: false, error: pos.error };
  try {
    await location.reportMine(pos);
    window.dispatchEvent(new CustomEvent('vp:tracking-report', {
      detail: { ts: Date.now(), lat: pos.lat, lng: pos.lng },
    }));
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `Network: ${e?.message ?? String(e)}` };
  }
}

export function useLocationReporting(enabled: boolean) {
  const [status, setStatus] = useState<ReporterStatus>({
    enabled, permission: 'unknown', lastReportedAt: null, lastError: null, reportsSent: 0,
  });
  const timer = useRef<number | null>(null);

  useEffect(() => { setStatus((s) => ({ ...s, enabled })); }, [enabled]);

  useEffect(() => {
    let cancelled = false;
    const stop = () => {
      if (timer.current != null) { window.clearInterval(timer.current); timer.current = null; }
    };
    const tick = async () => {
      const r = await reportNow();
      if (cancelled) return;
      setStatus((s) => r.ok
        ? { ...s, lastReportedAt: Date.now(), lastError: null, reportsSent: s.reportsSent + 1, permission: 'granted' }
        : { ...s, lastError: r.error });
    };
    const start = async () => {
      if (timer.current != null) return;
      try {
        const st = await Geolocation.checkPermissions();
        setStatus((s) => ({ ...s, permission: st.location as any }));
        if (st.location !== 'granted') {
          const req = await Geolocation.requestPermissions();
          setStatus((s) => ({ ...s, permission: req.location as any }));
          if (req.location !== 'granted') {
            setStatus((s) => ({ ...s, lastError: `Permission ${req.location}` }));
            return;
          }
        }
      } catch (e: any) {
        setStatus((s) => ({ ...s, lastError: `Permission check failed: ${e?.message ?? String(e)}` }));
        return;
      }
      window.setTimeout(() => { if (!cancelled) tick(); }, FIRST_REPORT_DELAY_MS);
      timer.current = window.setInterval(tick, REPORT_INTERVAL_MS);
    };

    if (enabled && document.visibilityState === 'visible') start();

    const onVis = () => {
      if (!enabled) { stop(); return; }
      if (document.visibilityState === 'visible') start(); else stop();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [enabled]);

  return status;
}
