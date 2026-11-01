/**
 * App Usage (Reports -> App usage) — who opens the phone app, how often, on what.
 * Data: GET /api/reports/app-usage (volunteers.last_app_open_at & co., stamped by
 * POST /api/me/ping at most once per 30 min; volunteer_devices for the old Android
 * app; one 'app_open' audit_log row per driver per day for "days used").
 * Oct 21 client: totals line, days used in the last 7 / 30 days, old version in red,
 * filters (old version / not opened in 14 days / never) and sortable columns.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminCRUD, type AppUsageRow } from './api';
import { cx } from './design';
import { fmtDateTimeEastern } from './time-format';
import { AppUsageInviteCell, BulkAppInviteButton, useAppInviteStatuses } from './volunteer-app-invite'; // Oct 14 client
import { UpdateReminderButton } from './update-reminder-button'; // Oct 29 client

/** Oct 14 client: plain names instead of raw 'ios' / 'android' / 'web'. */
function platformLabel(p: string | null | undefined): string {
  const k = String(p ?? '').trim().toLowerCase();
  if (k === 'ios') return 'iPhone app';
  if (k === 'android') return 'Android app';
  if (k === 'web') return 'Website';
  return String(p ?? '');
}

type Filter = 'all' | 'old' | 'idle14' | 'never';
type SortKey = 'unit' | 'name' | 'last' | 'd7' | 'd30' | 'version' | 'platform';
const DAY = 86400e3;

const bucketMeta: Record<string, { label: string; chip: string }> = {
  today:  { label: 'Today',        chip: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  week:   { label: '1-7 days ago', chip: 'bg-lime-100 text-lime-800 border-lime-300' },
  month:  { label: 'Past 30 days', chip: 'bg-amber-100 text-amber-800 border-amber-300' },
  stale:  { label: '30+ days',     chip: 'bg-neutral-200 text-neutral-700 border-neutral-300' },
  never:  { label: 'Never opened', chip: 'bg-rose-100 text-rose-800 border-rose-300' },
  // Aug 23: volunteers with no login can never open the app — own muted bucket.
  no_login: { label: 'No login',   chip: 'bg-neutral-100 text-neutral-500 border-neutral-300' },
};

export function AppUsagePanel() {
  const q = useQuery({ queryKey: ['admin-app-usage'], queryFn: adminCRUD.appUsage, refetchInterval: 60_000 });
  const rows = (q.data?.data ?? []) as AppUsageRow[];
  const sum = q.data?.summary;
  const store = q.data?.store;
  // Oct 29 client: newest version per phone (can be ahead of the store list, e.g. 1.0.44).
  const latest = q.data?.latest;
  const newest = [latest?.android && `Android ${latest.android.name}`, latest?.ios && `iPhone ${latest.ios.name}`].filter(Boolean).join(' · ');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'last', dir: -1 });
  const invites = useAppInviteStatuses(); // Oct 14 client

  const shown = useMemo(() => {
    const now = Date.now();
    const s = search.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (filter === 'old' && !r.is_old) return false;
      if (filter === 'never' && r.bucket !== 'never') return false;
      if (filter === 'idle14') {
        if (r.bucket === 'no_login' || !r.last_app_open_at) return false;
        if (now - new Date(r.last_app_open_at).getTime() <= 14 * DAY) return false;
      }
      if (!s) return true;
      return (r.first_name || '').toLowerCase().includes(s) || (r.last_name || '').toLowerCase().includes(s)
        || String(r.unit_number ?? '').includes(s) || platformLabel(r.last_app_platform).toLowerCase().includes(s)
        || (r.last_app_version || '').includes(s);
    });
    const val = (r: AppUsageRow): string | number => {
      switch (sort.key) {
        case 'unit': return r.unit_number ?? Number.MAX_SAFE_INTEGER;
        case 'name': return `${r.first_name ?? ''} ${r.last_name ?? ''}`.toLowerCase();
        case 'last': return r.last_app_open_at ? new Date(r.last_app_open_at).getTime() : 0;
        case 'd7': return r.days_7 ?? 0;
        case 'd30': return r.days_30 ?? 0;
        case 'version': return r.version_code ?? (r.last_app_version ? r.last_app_version.split('.').map((x) => x.padStart(4, '0')).join('.') : '');
        case 'platform': return platformLabel(r.last_app_platform);
      }
    };
    return [...out].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, search, filter, sort]);

  const th = (key: SortKey, label: string) => (
    <th className="text-left px-3 py-2 font-extrabold uppercase tracking-[.04em] text-[11px] text-muted">
      <button className="uppercase hover:underline" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : (key === 'name' || key === 'unit' ? 1 : -1) }))}>
        {label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  );
  const chip = (f: Filter, label: string, n?: number) => (
    <button onClick={() => setFilter(f)} className={cx('chip', filter === f && 'on')}>{label}{n != null ? ` (${n})` : ''}</button>
  );

  return (
    <div className="space-y-4">
      {sum && (
        <div className="text-[15px] font-extrabold text-ink">
          {sum.drivers} drivers · {sum.usedThisWeek} used the app this week · <span className={sum.oldVersion ? 'text-clay' : ''}>{sum.oldVersion} on an old version</span> · {sum.neverOpened} never opened
          {newest ? <span className="ml-2 text-[12px] font-semibold text-muted">(newest: {newest})</span>
                  : store && <span className="ml-2 text-[12px] font-semibold text-muted">(store version {store.name})</span>}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {chip('all', 'All')}
        {chip('old', 'Old version', sum?.oldVersion)}
        {chip('idle14', 'Not opened in 14 days', sum?.notIn14Days)}
        {chip('never', 'Never opened', sum?.neverOpened)}
      </div>

      <div className="flex items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
               placeholder="Search by name, unit #, platform, version…"
               className="border border-line rounded-[10px] px-3 py-2 text-[13px] w-full max-w-[360px]" />
        <button onClick={() => q.refetch()} className="text-[12px] font-bold text-forest hover:underline">Refresh</button>
        <span className="ml-auto flex flex-wrap items-center justify-end gap-2"><UpdateReminderButton /><BulkAppInviteButton /></span>{/* Oct 14 / Oct 29 client */}
      </div>

      {q.isLoading ? <div className="text-[13px] text-muted">Loading…</div> :
       shown.length === 0 ? <div className="text-[13px] text-muted">No matches.</div> :
       <div className="border border-line bg-paper rounded-[16px] overflow-x-auto">
         <table className="w-full text-[13px]">
           <thead className="bg-sage-line/40">
             <tr>
               {th('unit', 'Unit')}{th('name', 'Name')}{th('last', 'Last opened')}
               {th('d7', 'Days 7d')}{th('d30', 'Days 30d')}{th('platform', 'Platform')}{th('version', 'Version')}
               <th className="text-left px-3 py-2 font-extrabold uppercase tracking-[.04em] text-[11px] text-muted">Status</th>
               <th className="text-left px-3 py-2 font-extrabold uppercase tracking-[.04em] text-[11px] text-muted">App invite</th>
             </tr>
           </thead>
           <tbody>
             {shown.map((r) => {
               const meta = bucketMeta[r.bucket] ?? { label: String(r.bucket), chip: 'bg-neutral-100 text-neutral-500 border-neutral-300' };
               return (
                 <tr key={r.id} className="border-t border-line">
                   <td className="px-3 py-2 font-bold tabular-nums">{r.unit_number ?? '—'}</td>
                   <td className="px-3 py-2">{r.first_name} {r.last_name}</td>
                   <td className="px-3 py-2 text-muted tabular-nums">{r.last_app_open_at ? fmtDateTimeEastern(r.last_app_open_at) : '—'}</td>
                   <td className="px-3 py-2 tabular-nums">{r.days_7 ?? 0}</td>
                   <td className="px-3 py-2 tabular-nums">{r.days_30 ?? 0}</td>
                   <td className="px-3 py-2 text-muted">{r.last_app_platform ? platformLabel(r.last_app_platform) : '—'}</td>
                   <td className={cx('px-3 py-2 tabular-nums', r.is_old ? 'text-clay font-bold' : 'text-muted')}>
                     {r.last_app_version || '—'}
                     {r.is_old && <span className="ml-1.5 text-[11px]">old — please update</span>}
                   </td>
                   <td className="px-3 py-2"><span className={cx('border rounded-[8px] px-2 py-0.5 text-[11px] font-bold', meta.chip)}>{meta.label}</span></td>
                   <td className="px-3 py-2"><AppUsageInviteCell row={r} status={invites[r.id]} /></td>
                 </tr>
               );
             })}
           </tbody>
         </table>
       </div>}

      <p className="text-[11px] text-muted">
        "Days 7d / 30d" = on how many different days the driver opened the app (counted since this update went live). An app open is counted at most once every 30 minutes. Red version = older than the newest version for that phone.
      </p>
    </div>
  );
}
