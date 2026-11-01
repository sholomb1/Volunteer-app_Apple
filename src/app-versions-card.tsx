/**
 * Oct 21 client: Settings -> "📱 Phone app versions" (admin / staff / coordinator).
 * "Require at least version N" = old phone apps must update before they can continue
 * (Android: full-screen "Update required"; 1.0.43+ Android and iPhone: pop-up with no
 * "Later"). Off = no forcing. Also the "latest version" (soft "Update available" bar on
 * Android). The server refuses a version that is not in the stores yet.
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getUser } from './api';
import { Button } from './design';
import { uiConfirm } from './ui-dialogs';
import { fmtDateTimeEastern } from './time-format';

type KnownVersion = { code: number; name: string };
type AppVersionsView = {
  store: KnownVersion; known: KnownVersion[];
  androidMin: number | null; appMin: number | null; latestSetting: number | null; latestEffective: number;
  lastChange: { at: string; by: string | null } | null;
};
const appVersionsApi = {
  get: () => api<{ data: AppVersionsView }>('/api/admin/app-versions'),
  save: (body: { requiredCode: number | null; latestCode?: number | null }) =>
    api<{ data: AppVersionsView }>('/api/admin/app-versions', { method: 'PUT', body: JSON.stringify(body) }),
};

const ADMIN_ROLES = ['admin', 'staff', 'coordinator'];

export function AppVersionsCard() {
  const role = String(getUser()?.role ?? '').toLowerCase();
  if (!ADMIN_ROLES.includes(role)) return null;
  return <AppVersionsCardInner />;
}

function AppVersionsCardInner() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-app-versions'], queryFn: appVersionsApi.get, staleTime: 30_000 });
  const d = q.data?.data;
  const [required, setRequired] = useState<string>('off');
  const [latest, setLatest] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!d) return;
    const cur = d.appMin ?? d.androidMin;
    setRequired(cur != null ? String(cur) : 'off');
    setLatest(String(d.latestEffective));
  }, [d?.appMin, d?.androidMin, d?.latestEffective]);

  if (q.isLoading) return <div className="text-[13px] text-muted">Loading phone app versions…</div>;
  if (!d) return <div className="text-[13px] text-clay">Could not load phone app versions.</div>;

  const label = (code: number | null) => {
    if (code == null) return 'Off';
    const k = d.known.find((x) => x.code === code);
    return k ? `${k.name} (${code})` : `code ${code}`;
  };
  const requiredCode = required === 'off' ? null : Number(required);
  const latestCode = Number(latest) || null;
  const curRequired = d.appMin ?? d.androidMin;
  const mixed = d.appMin !== d.androidMin;
  const changed = requiredCode !== curRequired || mixed || latestCode !== d.latestEffective;

  async function save() {
    setErr(null); setFlash(null);
    const msg = requiredCode == null
      ? `Turn OFF "Require at least version"?\n\nNobody will be forced to update. Latest version: ${label(latestCode)}.`
      : `Require at least ${label(requiredCode)}?\n\nAnyone on an older phone app will see "Please update to keep using the app" and can't continue until they update. The website is not affected.`;
    if (!(await uiConfirm(msg))) return;
    setBusy(true);
    try {
      const r = await appVersionsApi.save({ requiredCode, latestCode });
      qc.setQueryData(['admin-app-versions'], r);
      void qc.invalidateQueries({ queryKey: ['app-version'] });
      setFlash('Saved. Phone apps get it the next time they open.');
    } catch (e: any) {
      setErr(e?.body?.error || e?.message || 'Could not save.');
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-[14px] border border-line bg-paper p-4 text-[13px] text-ink space-y-3">
      <div className="font-extrabold text-[14px]">📱 Phone app versions</div>
      <div className="grid gap-1 text-[13px]">
        <div>In the stores now: <b>{d.store.name} (code {d.store.code})</b> — Android and iPhone</div>
        <div>Required version now: <b>{mixed ? `Android ${label(d.androidMin)}, all apps ${label(d.appMin)}` : label(curRequired)}</b></div>
        <div>Latest version ("Update available" bar): <b>{label(d.latestEffective)}</b></div>
        {d.lastChange && (
          <div className="text-muted text-[12px]">Last changed {fmtDateTimeEastern(d.lastChange.at)}{d.lastChange.by ? ` by ${d.lastChange.by}` : ''}</div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="font-bold">Require at least version:</label>
        <select value={required} onChange={(e) => setRequired(e.target.value)}
                className="border border-line rounded-[10px] px-2 py-1.5 text-[13px] bg-paper">
          <option value="off">Off</option>
          {d.known.map((k) => <option key={k.code} value={String(k.code)}>{k.name} ({k.code})</option>)}
          {curRequired != null && !d.known.some((k) => k.code === curRequired) && (
            <option value={String(curRequired)}>code {curRequired} (older)</option>
          )}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="font-bold">Latest version:</label>
        <select value={latest} onChange={(e) => setLatest(e.target.value)}
                className="border border-line rounded-[10px] px-2 py-1.5 text-[13px] bg-paper">
          {d.known.map((k) => <option key={k.code} value={String(k.code)}>{k.name} ({k.code})</option>)}
        </select>
        <span className="text-muted text-[12px]">Android apps below this see a "Update available" bar they can close.</span>
      </div>

      <div className={requiredCode == null ? 'text-muted' : 'rounded-[10px] bg-clay/10 text-clay-deep font-bold px-3 py-2'}>
        {requiredCode == null
          ? 'Off: nobody is forced to update.'
          : `Anyone on an older app (below ${label(requiredCode)}) will see "Please update to keep using the app" and can't continue until they update. The website is not affected.`}
      </div>
      <p className="text-[12px] text-muted leading-snug">
        Works on Android apps and on iPhone apps 1.0.43 and newer. iPhone apps older than 1.0.43 can't be forced. Only versions that are already in both stores can be picked.
      </p>
      {err && <div className="text-clay font-bold bg-clay/10 rounded-[10px] px-3 py-2">{err}</div>}
      {flash && <div className="text-forest font-bold bg-sage/40 rounded-[10px] px-3 py-2">{flash}</div>}
      <Button size="sm" loading={busy} disabled={!changed || busy} onClick={save}>Save</Button>
    </div>
  );
}
