/**
 * Nov 3 client: Asana for the volunteer coordinator. Admins only (admin / staff / coordinator).
 *   - AsanaSettingsPanel: Settings → Asana — paste the Asana key, pick where tasks go, who gets them,
 *     the event switches (ALL OFF until the owner turns one on), Send a test task, Disconnect,
 *     the last error and the last 20 sent. Plus "Asana follow-ups": open follow-ups by person.
 *   - AsanaPersonTab: the driver card's last tab — his notes (newest first) and follow-ups, write a
 *     note, add a follow-up, tick one done, other tasks that mention him.
 * The Asana key is never sent back to the browser (only "connected as <name>" and the last 4).
 * API: routes/asana.ts.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { cx } from './design';

type Ref = { gid: string; name: string | null } | null;
type View = {
  connected: boolean; saved: boolean; problem: string | null; meName: string | null; tokenHint: string | null;
  workspace: Ref; project: Ref; assignee: Ref;
  includeProjects: Array<{ gid: string; name: string | null }> | null; activeProject: Ref; pastProject: Ref;
  events: Array<{ key: string; label: string; on: boolean; since: string | null }>;
  status: { lastRunAt: string | null; lastOkAt: string | null; lastError: string | null; lastErrorAt: string | null };
  log: Array<{ at: string; kind: string; title: string | null; ok: boolean; error: string | null; url: string | null }>;
  sandbox: boolean;
};
type Item = { gid: string; name: string };
type FollowUp = { gid: string; name: string; completed: boolean; dueOn: string | null; assignee: string | null; url: string | null; projects?: string[] };
type PersonView = {
  ready: boolean; connected: boolean; saved?: boolean; canWrite?: boolean; taskName?: string;
  defaultAssignee?: Ref;
  tasks?: Array<{ gid: string; name: string; completed: boolean; url: string | null; projects: string[] }>;
  writesTo?: { name: string; projects: string[] } | null;
  comments?: Array<{ who: string; at: string; text: string; project: string | null }>;
  followUps?: FollowUp[]; mentions?: FollowUp[];
};
type Group = { person: { id: number; name: string } | null; personTaskUrl: string | null; items: Array<FollowUp & { kind: 'follow-up' | 'task' }> };

const errText = (e: unknown) => (e as Error)?.message || 'Something went wrong. Try again.';
const input = 'w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[14px] text-ink';
const btn = 'px-3 py-1.5 rounded-full text-[12.5px] font-bold border haptic disabled:opacity-50';
const box = 'rounded-[14px] border border-line bg-paper p-4 space-y-3';
const h3 = 'font-display font-semibold text-[16px] text-ink';
const fmtWhen = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return d.toLocaleString('en-US', { timeZone: 'America/New_York', ...(sameDay ? {} : { month: 'short', day: 'numeric' }), hour: 'numeric', minute: '2-digit' });
};
const fmtDue = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }) : '');
const overdue = (d: string | null) => !!d && d < new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const KIND_WORDS: Record<string, string> = { signup: 'New sign-up', cant: 'Can\'t / gave back', cant3: '3 can\'ts', first_done: 'First pickup', inactive: 'Quiet 30 days', weekly: 'Weekly summary', test: 'Test' };
export const openDriverAsana = (id: number) => { window.dispatchEvent(new CustomEvent('zlz:open-volunteer', { detail: { id, tab: 'asana' }, cancelable: true })); };
/** The Asana project name as a small label ("Active", "Past"…). */
const Tag = ({ name }: { name: string | null | undefined }) => (name
  ? <span className="inline-block rounded-full bg-sage/50 px-2 py-[1px] text-[11px] font-bold text-forest align-middle">{name}</span> : null);
const tags = (names?: string[] | null) => (names ?? []).map((n) => <Tag key={n} name={n} />);
/** The 3 newest, and "Show more". */
function useMore<T>(list: T[], n = 3): { shown: T[]; more: ReactNode } {
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, n);
  const more = list.length > n
    ? <button type="button" className="text-[12.5px] font-bold text-forest underline" onClick={() => setAll(!all)}>{all ? 'Show less' : `Show more (${list.length - n})`}</button>
    : null;
  return { shown, more };
}

function FollowUpRow({ f, onTick, busy, extra }: { f: FollowUp; onTick?: (done: boolean) => void; busy?: boolean; extra?: ReactNode }) {
  return (
    <li className="flex items-start gap-2 py-1.5">
      {onTick ? (
        <input type="checkbox" className="mt-1 h-4 w-4 accent-forest" checked={f.completed} disabled={busy}
               aria-label={f.completed ? 'Mark not done' : 'Mark done'} onChange={(e) => onTick(e.target.checked)} />
      ) : <span className="mt-0.5 text-[13px]">{f.completed ? '✅' : '⬜'}</span>}
      <div className="min-w-0 flex-1">
        <div className={cx('text-[13.5px] text-ink', f.completed && 'line-through text-muted')}>{f.name}</div>
        <div className="text-[12px] text-muted flex flex-wrap items-center gap-x-2">
          {tags(f.projects)}
          {f.dueOn && <span className={cx(!f.completed && overdue(f.dueOn) && 'text-clay font-bold')}>due {fmtDue(f.dueOn)}</span>}
          {f.assignee && <span>{f.dueOn ? '· ' : ''}{f.assignee}</span>}
          {f.url && <a href={f.url} target="_blank" rel="noreferrer" className="underline">open in Asana</a>}
          {extra}
        </div>
      </div>
    </li>
  );
}

// ---- Settings → Asana ------------------------------------------------------------------------------
export function AsanaSettingsPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-asana'], queryFn: () => api<{ data: View }>('/api/admin/asana'), refetchInterval: 60_000 });
  const v = q.data?.data;
  const [key, setKey] = useState('');
  const [ws, setWs] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; where: string } | null>(null);
  const wsGid = ws ?? v?.workspace?.gid ?? '';
  const wsQ = useQuery({ queryKey: ['asana-ws'], enabled: !!v?.connected, staleTime: 5 * 60_000,
    queryFn: () => api<{ data: Item[] }>('/api/admin/asana/workspaces') });
  const projQ = useQuery({ queryKey: ['asana-projects', wsGid], enabled: !!v?.connected && !!wsGid, staleTime: 5 * 60_000,
    queryFn: () => api<{ data: Item[] }>(`/api/admin/asana/projects?workspace=${wsGid}`) });
  const usersQ = useQuery({ queryKey: ['asana-users', wsGid], enabled: !!v?.connected && !!wsGid, staleTime: 5 * 60_000,
    queryFn: () => api<{ data: Item[] }>(`/api/admin/asana/users?workspace=${wsGid}`) });
  useEffect(() => { if (!ws && !v?.workspace && wsQ.data?.data?.length === 1) setWs(wsQ.data.data[0]!.gid); }, [wsQ.data, ws, v?.workspace]);

  const done = (data: View, text: string, where: string) => { qc.setQueryData(['admin-asana'], { data }); setMsg({ ok: true, text, where }); };
  const fail = (where: string) => (e: unknown) => setMsg({ ok: false, text: errText(e), where });
  const saveKey = useMutation({
    mutationFn: () => api<{ data: View }>('/api/admin/asana/token', { method: 'PUT', body: JSON.stringify({ token: key.trim() }) }),
    onMutate: () => setMsg(null),
    onSuccess: (r) => { setKey(''); done(r.data, `Connected ✓ Hi ${r.data.meName ?? ''}! Now pick where the tasks go.`, 'key'); qc.invalidateQueries({ queryKey: ['asana-ws'] }); },
    onError: fail('key'),
  });
  const disconnect = useMutation({
    mutationFn: () => api<{ data: View }>('/api/admin/asana/token', { method: 'DELETE' }),
    onMutate: () => setMsg(null),
    onSuccess: (r) => done(r.data, 'Disconnected. Nothing goes to Asana now.', 'key'),
    onError: fail('key'),
  });
  const saveSettings = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<{ data: View }>('/api/admin/asana/settings', { method: 'PUT', body: JSON.stringify(body) }),
    onMutate: () => setMsg(null),
    onSuccess: (r, body) => { if ('workspaceGid' in body) setWs(null); done(r.data, 'Saved ✓', 'events' in body ? 'events' : 'where'); qc.invalidateQueries({ queryKey: ['asana-follow-ups'] }); },
    onError: (e, body) => fail('events' in body ? 'events' : 'where')(e),
  });
  const test = useMutation({
    mutationFn: () => api<{ data: View; url: string | null }>('/api/admin/asana/test', { method: 'POST' }),
    onMutate: () => setMsg(null),
    onSuccess: (r) => done(r.data, 'Test task sent ✓ Look for it in Asana (you can delete it).', 'test'),
    onError: (e) => { fail('test')(e); qc.invalidateQueries({ queryKey: ['admin-asana'] }); },
  });
  const busy = saveKey.isPending || disconnect.isPending || saveSettings.isPending || test.isPending;

  if (q.isError) return <div className="text-[13px] text-clay font-bold">{errText(q.error)}</div>;
  if (!v) return <div className="text-[13px] text-muted">Loading…</div>;
  const note = (where: string) => msg && msg.where === where
    ? <p className={cx('text-[13px] font-bold', msg.ok ? 'text-forest' : 'text-clay')} role="status">{msg.text}</p> : null;
  const wsList = wsQ.data?.data ?? [];
  const projects = projQ.data?.data ?? [];
  const users = usersQ.data?.data ?? [];
  const wsName = (g: string) => wsList.find((w) => w.gid === g)?.name ?? (v.workspace?.gid === g ? v.workspace?.name : null) ?? '';
  const anyOn = v.events.some((e) => e.on);

  return (
    <div className="space-y-4" data-testid="asana-settings">
      <section className={box}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={h3}>Asana (volunteer coordinator)</h3>
          <span className={cx('text-[12px] font-bold', v.connected ? 'text-forest' : 'text-muted')}>
            {v.connected ? `Connected as ${v.meName ?? 'you'} ✓` : 'Not connected'}
          </span>
        </div>
        <p className="text-[12.5px] text-muted">
          Follow drivers and volunteers in Asana. Each driver card gets an <b>Asana</b> tab with notes and follow-ups,
          and (only if you turn them on below) the app can add a task when something happens.
        </p>
        <p className="text-[12.5px] text-ink">
          Get your Asana key: open <a className="underline font-bold" href="https://app.asana.com/0/my-apps" target="_blank" rel="noreferrer">app.asana.com/0/my-apps</a> → <b>Create new token</b> → copy it and paste it here.
        </p>
        <label className="block space-y-1">
          <span className="block text-[12.5px] font-bold text-ink">Asana key</span>
          <input className={input} type="password" autoComplete="new-password" spellCheck={false} value={key}
                 placeholder={v.connected ? 'Paste a new key only to change it' : 'Paste your Asana key'} onChange={(e) => setKey(e.target.value)} />
          {v.connected && v.tokenHint && !key && <span className="block text-[12px] text-forest font-bold">saved ✓ · ending in …{v.tokenHint}</span>}
          {v.problem && <span className="block text-[12px] text-clay font-bold">{v.problem}</span>}
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || key.trim().length < 20} onClick={() => saveKey.mutate()} className={cx(btn, 'bg-forest text-paper border-forest')}>
            {saveKey.isPending ? 'Checking with Asana…' : 'Save'}
          </button>
          {v.saved && (
            <button type="button" disabled={busy}
                    onClick={() => { if (window.confirm('Disconnect Asana? Nothing will go to Asana until a key is pasted again.')) disconnect.mutate(); }}
                    className={cx(btn, 'bg-paper text-clay border-clay/40')}>Disconnect</button>
          )}
        </div>
        {note('key')}
      </section>

      <section className={cx(box, !v.connected && 'opacity-60')}>
        <h3 className={h3}>Where to look, and where new tasks go</h3>
        <label className="block space-y-1">
          <span className="block text-[12.5px] font-bold text-ink">Asana team space</span>
          <select className={cx(input, 'max-w-[360px]')} disabled={!v.connected || busy} value={wsGid}
                  onChange={(e) => { const g = e.target.value; setWs(g); saveSettings.mutate({ workspaceGid: g || null, workspaceName: wsName(g) }); }}>
            <option value="">{wsQ.isLoading ? 'Loading…' : 'Pick one'}</option>
            {wsGid && !wsList.some((w) => w.gid === wsGid) && <option value={wsGid}>{v.workspace?.name ?? 'Saved'}</option>}
            {wsList.map((w) => <option key={w.gid} value={w.gid}>{w.name}</option>)}
          </select>
        </label>
        <div className="space-y-1">
          <span className="block text-[12.5px] font-bold text-ink">Look for people in these projects</span>
          {projQ.isError && <span className="block text-[12px] text-clay font-bold">{errText(projQ.error)}</span>}
          <label className="flex items-center gap-2 text-[13.5px] text-ink">
            <input type="checkbox" className="h-4 w-4 accent-forest" disabled={!v.connected || !wsGid || busy} checked={v.includeProjects === null}
                   onChange={(e) => saveSettings.mutate({ includeProjects: e.target.checked ? null : projects.map((p) => ({ gid: p.gid, name: p.name })) })} />
            All projects{projects.length ? ` (${projects.length})` : ''}
          </label>
          {v.includeProjects !== null && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 pl-6">
              {projects.map((p) => {
                const on = v.includeProjects!.some((x) => x.gid === p.gid);
                return (
                  <label key={p.gid} className="flex items-center gap-1.5 text-[13px] text-ink">
                    <input type="checkbox" className="h-4 w-4 accent-forest" disabled={busy} checked={on}
                           onChange={() => saveSettings.mutate({ includeProjects: on ? v.includeProjects!.filter((x) => x.gid !== p.gid) : [...v.includeProjects!, { gid: p.gid, name: p.name }] })} />
                    {p.name}
                  </label>
                );
              })}
            </div>
          )}
        </div>
        <label className="block space-y-1">
          <span className="block text-[12.5px] font-bold text-ink">New tasks go to</span>
          <span className="block text-[12px] text-muted">When you write a note for someone who has no Asana task yet, and for the automatic tasks below.</span>
          <select className={cx(input, 'max-w-[360px]')} disabled={!v.connected || !wsGid || busy} value={v.project?.gid ?? ''}
                  onChange={(e) => { const g = e.target.value; saveSettings.mutate({ workspaceGid: wsGid, workspaceName: wsName(wsGid), projectGid: g || null, projectName: projects.find((p) => p.gid === g)?.name ?? null }); }}>
            <option value="">{projQ.isLoading ? 'Loading…' : 'Pick a project'}</option>
            {v.project && !projects.some((p) => p.gid === v.project!.gid) && <option value={v.project.gid}>{v.project.name}</option>}
            {projects.map((p) => <option key={p.gid} value={p.gid}>{p.name}</option>)}
          </select>
        </label>
        <details className="text-[13px]" open={!!(v.activeProject || v.pastProject)}>
          <summary className="cursor-pointer text-[12.5px] font-bold text-forest">By driver status (optional)</summary>
          <div className="mt-2 space-y-2 pl-1">
            {([['activeProject', 'Active, VIP and new drivers → new tasks go to'], ['pastProject', 'Inactive and archived drivers → new tasks go to']] as const).map(([k, label]) => {
              const cur = v[k];
              return (
                <label key={k} className="block space-y-1">
                  <span className="block text-[12.5px] font-bold text-ink">{label}</span>
                  <select className={cx(input, 'max-w-[360px]')} disabled={!v.connected || !wsGid || busy} value={cur?.gid ?? ''}
                          onChange={(e) => { const g = e.target.value; saveSettings.mutate({ [`${k}Gid`]: g || null, [`${k}Name`]: projects.find((p) => p.gid === g)?.name ?? null }); }}>
                    <option value="">Same as above</option>
                    {cur && !projects.some((p) => p.gid === cur.gid) && <option value={cur.gid}>{cur.name}</option>}
                    {projects.map((p) => <option key={p.gid} value={p.gid}>{p.name}</option>)}
                  </select>
                </label>
              );
            })}
          </div>
        </details>
        <label className="block space-y-1">
          <span className="block text-[12.5px] font-bold text-ink">Assign tasks to (optional)</span>
          <select className={cx(input, 'max-w-[360px]')} disabled={!v.connected || !wsGid || busy} value={v.assignee?.gid ?? ''}
                  onChange={(e) => { const g = e.target.value; saveSettings.mutate({ assigneeGid: g || null, assigneeName: users.find((u) => u.gid === g)?.name ?? null }); }}>
            <option value="">Nobody</option>
            {v.assignee && !users.some((u) => u.gid === v.assignee!.gid) && <option value={v.assignee.gid}>{v.assignee.name}</option>}
            {users.map((u) => <option key={u.gid} value={u.gid}>{u.name}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy || !v.connected || !v.project} onClick={() => test.mutate()} className={cx(btn, 'bg-paper text-ink border-line')}>
            {test.isPending ? 'Sending…' : 'Send a test task'}
          </button>
          <span className="text-[12px] text-muted">Makes ONE task named "TEST"{v.project?.name ? ` in ${v.project.name}` : ''}{v.sandbox ? ' (works on the test site too)' : ''}.</span>
        </div>
        {note('where')}{note('test')}
      </section>

      <section className={cx(box, (!v.connected || !v.project) && 'opacity-60')}>
        <h3 className={h3}>Add a task when…</h3>
        <p className="text-[12.5px] text-muted">
          All off until you turn one on. Each thing is sent once. Only things from the time you turn it on (new sign-ups still waiting are sent too).
        </p>
        {v.sandbox && (
          <p className="text-[12.5px] font-bold text-amber-700">Test site: these never send from here (it would make the same tasks twice). They work on the live site.</p>
        )}
        <ul className="space-y-1.5">
          {v.events.map((e) => (
            <li key={e.key} className="flex items-start gap-2">
              <input id={`asana-ev-${e.key}`} type="checkbox" className="mt-0.5 h-4 w-4 accent-forest" checked={e.on}
                     disabled={busy || !v.connected || !v.project}
                     onChange={(x) => saveSettings.mutate({ events: { [e.key]: x.target.checked } })} />
              <label htmlFor={`asana-ev-${e.key}`} className="text-[13.5px] text-ink">
                {e.label}
                {e.key === 'inactive' && <span className="block text-[12px] text-muted">The first time, one task for each driver already quiet (up to 15 every 5 minutes). Drivers who are away are skipped.</span>}
                {e.on && e.since && <span className="block text-[12px] text-forest">On since {fmtWhen(e.since)}</span>}
              </label>
            </li>
          ))}
        </ul>
        {note('events')}
        {(anyOn || v.status.lastError) && (
          <p className="text-[12px] text-muted">
            {v.status.lastRunAt ? `Last check ${fmtWhen(v.status.lastRunAt)}.` : v.sandbox ? '' : 'First check within 5 minutes.'}
            {v.status.lastOkAt ? ` Last task sent ${fmtWhen(v.status.lastOkAt)}.` : ''}
          </p>
        )}
        {v.status.lastError && <p className="text-[13px] font-bold text-clay">Last error ({fmtWhen(v.status.lastErrorAt)}): {v.status.lastError}</p>}
      </section>

      <section className={box}>
        <h3 className={h3}>Sent to Asana</h3>
        {v.log.length === 0 ? <p className="text-[13px] text-muted">Nothing sent yet.</p> : (
          <ul className="divide-y divide-line">
            {v.log.map((x, i) => (
              <li key={i} className="py-1.5 flex flex-wrap items-baseline gap-x-2 text-[13px]">
                <span className="text-muted w-[92px] shrink-0">{fmtWhen(x.at)}</span>
                <span className={cx('font-bold', x.ok ? 'text-forest' : 'text-clay')}>{x.ok ? 'OK' : 'Failed'}</span>
                <span className="text-[11.5px] rounded-full bg-sage/40 px-2">{KIND_WORDS[x.kind] ?? x.kind}</span>
                <span className="text-ink min-w-0 flex-1">{x.url ? <a href={x.url} target="_blank" rel="noreferrer" className="underline">{x.title}</a> : x.title}</span>
                {!x.ok && x.error && <span className="basis-full text-[12px] text-clay">{x.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {v.connected && v.workspace && <AsanaFollowUpsCard />}
    </div>
  );
}

/** Open follow-ups in the projects we look in, by person (admins). */
export function AsanaFollowUpsCard() {
  const qc = useQueryClient();
  const fresh = useRef(false);
  const q = useQuery({ queryKey: ['asana-follow-ups'], staleTime: 60_000,
    queryFn: () => { const f = fresh.current; fresh.current = false; return api<{ data: Group[] }>(`/api/asana/follow-ups${f ? '?fresh=1' : ''}`); } });
  const groups = q.data?.data ?? [];
  const total = groups.reduce((a, g) => a + g.items.length, 0);
  return (
    <section className={box} data-testid="asana-follow-ups">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={h3}>Asana follow-ups{total ? ` (${total} open)` : ''}</h3>
        <button type="button" className={cx(btn, 'bg-paper text-ink border-line')} disabled={q.isFetching}
                onClick={() => { fresh.current = true; void qc.invalidateQueries({ queryKey: ['asana-follow-ups'] }); }}>
          {q.isFetching ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {q.isError ? <p className="text-[13px] text-clay font-bold">{errText(q.error)}</p>
        : q.isLoading ? <p className="text-[13px] text-muted">Loading from Asana…</p>
        : groups.length === 0 ? <p className="text-[13px] text-muted">No open follow-ups. 🎉</p> : (
          <div className="space-y-3">
            {groups.map((g) => (
              <div key={g.person?.id ?? 'none'}>
                <div className="flex flex-wrap items-baseline gap-2">
                  {g.person
                    ? <button type="button" className="text-[14px] font-bold text-forest underline" onClick={() => openDriverAsana(g.person!.id)}>{g.person.name}</button>
                    : <span className="text-[14px] font-bold text-muted">Not matched to a driver</span>}
                  {g.personTaskUrl && <a href={g.personTaskUrl} target="_blank" rel="noreferrer" className="text-[12px] text-muted underline">open in Asana</a>}
                </div>
                <ul className="pl-1">{g.items.map((f) => <FollowUpRow key={f.gid} f={f} />)}</ul>
              </div>
            ))}
          </div>
        )}
    </section>
  );
}

// ---- the driver card → Asana tab ---------------------------------------------------------------------
export function AsanaPersonTab({ volunteerId }: { volunteerId: number }) {
  const qc = useQueryClient();
  const qk = ['asana-person', volunteerId];
  const fresh = useRef(false);
  const q = useQuery({ queryKey: qk, staleTime: 60_000,
    queryFn: () => { const f = fresh.current; fresh.current = false; return api<{ data: PersonView }>(`/api/asana/person/${volunteerId}${f ? '?fresh=1' : ''}`); } });
  const v = q.data?.data;
  const usersQ = useQuery({ queryKey: ['asana-users-me'], enabled: !!v?.ready, staleTime: 10 * 60_000,
    queryFn: () => api<{ data: Item[] }>('/api/asana/users') });
  const [text, setText] = useState('');
  const [fu, setFu] = useState<{ title: string; dueOn: string; assignee: string | null } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const reload = () => { fresh.current = true; void qc.invalidateQueries({ queryKey: qk }); void qc.invalidateQueries({ queryKey: ['asana-follow-ups'] }); };
  const fail = (e: unknown) => setMsg({ ok: false, text: errText(e) });
  const addNote = useMutation({
    mutationFn: () => api(`/api/asana/person/${volunteerId}/note`, { method: 'POST', body: JSON.stringify({ text: text.trim() }) }),
    onMutate: () => setMsg(null),
    onSuccess: () => { setText(''); setMsg({ ok: true, text: 'Note saved in Asana ✓' }); reload(); },
    onError: fail,
  });
  const addFu = useMutation({
    mutationFn: (b: { title: string; dueOn: string; assignee: string | null }) => api(`/api/asana/person/${volunteerId}/follow-up`, { method: 'POST',
      body: JSON.stringify({ title: b.title.trim(), dueOn: b.dueOn || null, assigneeGid: b.assignee || null }) }),
    onMutate: () => setMsg(null),
    onSuccess: () => { setFu(null); setMsg({ ok: true, text: 'Follow-up added ✓' }); reload(); },
    onError: fail,
  });
  const tick = useMutation({
    mutationFn: (b: { gid: string; completed: boolean }) => api(`/api/asana/follow-up/${b.gid}`, { method: 'PUT', body: JSON.stringify({ completed: b.completed, volunteerId }) }),
    onMutate: (b) => {
      setMsg(null);
      qc.setQueryData<{ data: PersonView }>(qk, (old) => old ? { data: { ...old.data, followUps: (old.data.followUps ?? []).map((f) => f.gid === b.gid ? { ...f, completed: b.completed } : f) } } : old);
    },
    onSuccess: () => reload(),
    onError: (e) => { fail(e); reload(); },
  });
  const busy = addNote.isPending || addFu.isPending || tick.isPending;
  // Compact: the 3 newest of each list, then "Show more".
  const fus = useMore(v?.followUps ?? []);
  const notes = useMore(v?.comments ?? []);
  const others = useMore(v?.mentions ?? []);

  if (q.isError) return <div className="text-[13px] text-clay font-bold">{errText(q.error)}</div>;
  if (!v) return <div className="text-[13px] text-muted">Loading from Asana…</div>;
  if (!v.ready) {
    return (
      <div className={box}>
        <p className="text-[13.5px] text-ink">
          {v.connected ? 'Pick your Asana team space first:' : v.saved ? 'The saved Asana key needs to be pasted again:' : 'Asana is not connected yet.'}{' '}
          Admin → Settings → <b>Asana</b>.
        </p>
      </div>
    );
  }
  const users = usersQ.data?.data ?? [];
  const tasks = v.tasks ?? [];
  const canWrite = !!v.canWrite;

  return (
    <div className="space-y-3" data-testid="asana-person">
      <div className="flex flex-wrap items-start justify-between gap-2 text-[12.5px] text-muted">
        <div className="space-y-0.5 min-w-0">
          {tasks.length ? tasks.map((t) => (
            <div key={t.gid} className="flex flex-wrap items-center gap-1.5">
              {tags(t.projects)}
              <span className={cx('text-ink font-bold', t.completed && 'line-through')}>{t.name}</span>
              {t.url && <a href={t.url} target="_blank" rel="noreferrer" className="underline">open in Asana</a>}
            </div>
          )) : <span>Not in Asana yet.{canWrite ? <> Your first note or follow-up adds <b className="text-ink">{v.taskName}</b>.</> : null}</span>}
        </div>
        <button type="button" className={cx(btn, 'bg-paper text-ink border-line')} disabled={q.isFetching} onClick={reload}>{q.isFetching ? 'Loading…' : 'Refresh'}</button>
      </div>

      <section className={box}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={h3}>Follow-ups</h3>
          {!fu && canWrite && (
            <button type="button" className={cx(btn, 'bg-paper text-forest border-forest/50')} disabled={busy}
                    onClick={() => setFu({ title: '', dueOn: '', assignee: v.defaultAssignee?.gid ?? null })}>+ Add follow-up</button>
          )}
        </div>
        {fu && (
          <div className="space-y-2 rounded-[10px] bg-sage/20 p-3">
            <input className={input} autoFocus placeholder="What to do (e.g. Call to ask about Sunday)" value={fu.title} maxLength={250}
                   onChange={(e) => setFu({ ...fu, title: e.target.value })} />
            <div className="flex flex-wrap gap-2">
              <label className="space-y-1"><span className="block text-[12px] font-bold text-ink">Due (optional)</span>
                <input type="date" className={cx(input, 'w-[170px]')} value={fu.dueOn} onChange={(e) => setFu({ ...fu, dueOn: e.target.value })} /></label>
              <label className="space-y-1"><span className="block text-[12px] font-bold text-ink">Who does it</span>
                <select className={cx(input, 'w-[220px]')} value={fu.assignee ?? ''} onChange={(e) => setFu({ ...fu, assignee: e.target.value || null })}>
                  <option value="">Nobody yet</option>
                  {fu.assignee && !users.some((u) => u.gid === fu.assignee) && <option value={fu.assignee}>{v.defaultAssignee?.name ?? 'Saved'}</option>}
                  {users.map((u) => <option key={u.gid} value={u.gid}>{u.name}</option>)}
                </select></label>
            </div>
            <div className="flex gap-2">
              <button type="button" className={cx(btn, 'bg-forest text-paper border-forest')} disabled={busy || !fu.title.trim()} onClick={() => addFu.mutate(fu)}>
                {addFu.isPending ? 'Adding…' : 'Add follow-up'}</button>
              <button type="button" className={cx(btn, 'bg-paper text-ink border-line')} disabled={busy} onClick={() => setFu(null)}>Cancel</button>
            </div>
          </div>
        )}
        {fus.shown.length === 0 ? <p className="text-[13px] text-muted">No follow-ups yet.</p>
          : <ul>{fus.shown.map((f) => <FollowUpRow key={f.gid} f={f} busy={busy} onTick={(d) => tick.mutate({ gid: f.gid, completed: d })} />)}</ul>}
        {fus.more}
      </section>

      <section className={box}>
        <h3 className={h3}>Notes</h3>
        {canWrite ? (
          <div className="flex flex-wrap items-end gap-2">
            <textarea className={cx(input, 'min-h-[44px] flex-1 min-w-[220px]')} rows={2} placeholder="Write a note (it goes in Asana with your name)" value={text} maxLength={4000}
                      onChange={(e) => setText(e.target.value)} />
            <button type="button" className={cx(btn, 'bg-forest text-paper border-forest')} disabled={busy || !text.trim()} onClick={() => addNote.mutate()}>
              {addNote.isPending ? 'Saving…' : 'Save note'}</button>
          </div>
        ) : <p className="text-[12.5px] text-muted">To write notes, pick where new tasks go in Admin → Settings → Asana.</p>}
        {notes.shown.length === 0 ? <p className="text-[13px] text-muted">No notes yet.</p> : (
          <ul className="space-y-2">
            {notes.shown.map((c, i) => (
              <li key={i} className="rounded-[10px] bg-sage/20 px-3 py-2">
                <div className="text-[12px] text-muted flex flex-wrap items-center gap-1.5"><b className="text-ink">{c.who}</b> · {fmtWhen(c.at)} {tasks.length > 1 && <Tag name={c.project} />}</div>
                <div className="text-[13.5px] text-ink whitespace-pre-wrap">{c.text}</div>
              </li>
            ))}
          </ul>
        )}
        {notes.more}
      </section>

      {msg && <p className={cx('text-[13px] font-bold', msg.ok ? 'text-forest' : 'text-clay')} role="status">{msg.text}</p>}

      {others.shown.length > 0 && (
        <section className={box}>
          <h3 className={h3}>Other Asana tasks about this person</h3>
          <ul>{others.shown.map((f) => <FollowUpRow key={f.gid} f={f} />)}</ul>
          {others.more}
        </section>
      )}
    </div>
  );
}
