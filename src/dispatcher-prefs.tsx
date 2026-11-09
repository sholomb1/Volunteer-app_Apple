/**
 * Nov 5 client: "a setting in each dispatcher: if the person gets calls, gets a text reminder, how many minutes
 * before (probably 5 minutes before) … and a message when it's finishing … with on/off buttons for both."
 *   DispatcherSettingsBox  — the small Settings area on each Roster card (Dispatch → 📅 Schedule → Roster), office.
 *   DispatcherTextsEditor  — the two texts (one for everyone), office.
 *   MyDispatchSettings     — "⚙️ My settings" on My Dispatch: a dispatcher's own reminder / thank-you switches
 *                            (Gets dispatch calls = office only).
 * API: GET /api/dispatcher-prefs, PUT /api/dispatcher-prefs/:id, PUT /api/dispatcher-prefs/texts,
 *      GET/PUT /api/dispatcher-prefs/mine (apps/api/src/routes/dispatcher-prefs.ts).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { cx } from './design';

export type DispatcherPref = { calls: boolean; remind: boolean; remindMin: number; thanks: boolean };
type Texts = { remind: string; thanks: string };
type AllPrefs = { prefs: Record<string, DispatcherPref>; texts: Texts; defaults: Texts; choices: number[] };
const CHOICES = [5, 10, 15, 30];
const DEFAULT_PREF: DispatcherPref = { calls: true, remind: true, remindMin: 5, thanks: true };
const KEY = ['dispatcher-prefs'];
const errText = (e: any, fb: string) => e?.body?.error || e?.message || fb;

function useAllPrefs() {
  return useQuery({ queryKey: KEY, queryFn: () => api<{ data: AllPrefs }>('/api/dispatcher-prefs').then((r) => r.data), retry: false, staleTime: 30_000 });
}

/** A plain on/off switch. */
function OnOff({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
            className={cx('haptic relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition disabled:opacity-50',
              on ? 'bg-forest border-forest' : 'bg-line/70 border-line')}>
      <span className={cx('inline-block h-5 w-5 rounded-full bg-paper shadow transition', on ? 'translate-x-[22px]' : 'translate-x-[1px]')} />
      <span className={cx('sr-only')}>{on ? 'On' : 'Off'}</span>
    </button>
  );
}
function Row({ icon, title, hint, children }: { icon: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="text-[14px] leading-6 w-5 text-center">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-bold text-ink leading-6">{title}</div>
        {hint && <div className="text-[11.5px] text-muted leading-snug">{hint}</div>}
      </div>
      <div className="flex items-center gap-2 pt-0.5">{children}</div>
    </div>
  );
}
function Minutes({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <select value={String(value)} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} aria-label="Minutes before"
            className="rounded-[8px] border border-line bg-paper px-1.5 py-0.5 text-[12px] text-ink disabled:opacity-50">
      {CHOICES.map((m) => <option key={m} value={m}>{m} min before</option>)}
    </select>
  );
}

/** The three switches (calls only when `withCalls`). */
function Switches({ p, save, busy, withCalls, who }: { p: DispatcherPref; save: (patch: Partial<DispatcherPref>) => void; busy: boolean; withCalls: boolean; who: string }) {
  return (
    <div className="divide-y divide-line/60">
      {withCalls && (
        <Row icon="📞" title="Gets dispatch calls"
             hint={p.calls ? undefined : `Off: no dispatch calls go to ${who}. The shifts still show, marked "no calls". "I'm dispatching now" and overrides can't send calls to ${who} until this is on again.`}>
          <OnOff on={p.calls} onChange={(v) => save({ calls: v })} disabled={busy} label="Gets dispatch calls" />
        </Row>
      )}
      <Row icon="⏰" title="Reminder before the shift" hint={p.remind ? `A text ${p.remindMin} minutes before the shift starts.` : 'No reminder text.'}>
        {p.remind && <Minutes value={p.remindMin} onChange={(n) => save({ remindMin: n })} disabled={busy} />}
        <OnOff on={p.remind} onChange={(v) => save({ remind: v })} disabled={busy} label="Reminder before the shift" />
      </Row>
      <Row icon="🙏" title="Thank-you at the end of the shift" hint={p.thanks ? 'A thank-you text when the shift ends.' : 'No thank-you text.'}>
        <OnOff on={p.thanks} onChange={(v) => save({ thanks: v })} disabled={busy} label="Thank-you at the end of the shift" />
      </Row>
    </div>
  );
}

/** Roster card: the Settings area for one dispatcher (office). Hidden when the settings can't be loaded. */
export function DispatcherSettingsBox({ volunteerId, first }: { volunteerId: number; first?: string | null }) {
  const qc = useQueryClient();
  const q = useAllPrefs();
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (patch: Partial<DispatcherPref>) => api<{ data: DispatcherPref }>(`/api/dispatcher-prefs/${volunteerId}`, { method: 'PUT', body: JSON.stringify(patch) }),
    onMutate: (patch) => {
      setErr(null);
      qc.setQueryData<AllPrefs>(KEY, (d) => d && { ...d, prefs: { ...d.prefs, [String(volunteerId)]: { ...(d.prefs[String(volunteerId)] ?? DEFAULT_PREF), ...patch } } });
    },
    onSuccess: (r, patch) => {
      qc.setQueryData<AllPrefs>(KEY, (d) => d && { ...d, prefs: { ...d.prefs, [String(volunteerId)]: r.data } });
      if ('calls' in patch) { qc.invalidateQueries({ queryKey: ['pbx-forward'] }); }
    },
    onError: (e) => { setErr(errText(e, "Couldn't save.")); qc.invalidateQueries({ queryKey: KEY }); },
  });
  if (q.isError || (!q.isLoading && !q.data)) return null;
  const p = q.data?.prefs[String(volunteerId)] ?? DEFAULT_PREF;
  return (
    <div className="mt-2 rounded-[8px] border border-line bg-cream/40 px-2.5 py-1.5" data-dispatcher-settings>
      <div className="flex items-center justify-between">
        <div className="text-[10.5px] font-extrabold uppercase tracking-[.05em] text-muted">Settings</div>
        {!p.calls && <span className="text-[10.5px] font-bold text-clay bg-clay/10 rounded-full px-2 py-0.5">no calls</span>}
      </div>
      {q.isLoading ? <div className="text-[12px] text-muted py-1">Loading…</div>
        : <Switches p={p} save={(patch) => save.mutate(patch)} busy={save.isPending} withCalls who={(first ?? '').trim() || 'this person'} />}
      {err && <div className="text-[12px] text-clay font-bold pt-1">{err}</div>}
    </div>
  );
}

/** Roster: the reminder and thank-you texts (one for all dispatchers). Office. */
export function DispatcherTextsEditor() {
  const qc = useQueryClient();
  const q = useAllPrefs();
  const [open, setOpen] = useState(false);
  const [remind, setRemind] = useState('');
  const [thanks, setThanks] = useState('');
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  useEffect(() => { if (open && q.data) { setRemind(q.data.texts.remind); setThanks(q.data.texts.thanks); } }, [open, q.data?.texts.remind, q.data?.texts.thanks]);
  const save = useMutation({
    mutationFn: (b: Texts) => api<{ data: Texts }>('/api/dispatcher-prefs/texts', { method: 'PUT', body: JSON.stringify(b) }),
    onSuccess: (r) => { qc.setQueryData<AllPrefs>(KEY, (d) => d && { ...d, texts: r.data }); setMsg({ t: 'Saved.' }); },
    onError: (e) => setMsg({ t: errText(e, "Couldn't save."), bad: true }),
  });
  if (q.isError || !q.data) return null;
  const ex = (t: string) => t.replace(/\{first\}/g, 'Yakov').replace(/\{time\}/g, '3 PM');
  if (!open) {
    return (
      <button type="button" onClick={() => { setOpen(true); setMsg(null); }} data-testid="dpref-texts"
              className="haptic text-[12.5px] font-bold text-forest hover:underline">✏️ Reminder and thank-you texts</button>
    );
  }
  const box = 'w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[13.5px] text-ink';
  return (
    <div className="rounded-[12px] border border-line bg-paper px-3 py-3 space-y-3" data-dpref-texts>
      <div>
        <div className="font-display font-semibold text-[15px] text-ink">✏️ Reminder and thank-you texts</div>
        <div className="text-[12px] text-muted">The same texts for every dispatcher. {'{first}'} = his first name, {'{time}'} = when the shift starts. They follow the usual rules: never on Shabbos or Yom Tov, not in his quiet times, and not if he turned texts off.</div>
      </div>
      <label className="block space-y-1">
        <span className="text-[12px] font-bold text-muted">⏰ Reminder before the shift</span>
        <textarea rows={2} className={box} value={remind} maxLength={300} onChange={(e) => setRemind(e.target.value)} />
        <span className="block text-[11.5px] text-muted">Example: {ex(remind || q.data.defaults.remind)}</span>
      </label>
      <label className="block space-y-1">
        <span className="text-[12px] font-bold text-muted">🙏 Thank-you at the end of the shift</span>
        <textarea rows={2} className={box} value={thanks} maxLength={300} onChange={(e) => setThanks(e.target.value)} />
        <span className="block text-[11.5px] text-muted">Example: {ex(thanks || q.data.defaults.thanks)}</span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={save.isPending} onClick={() => { setMsg(null); save.mutate({ remind, thanks }); }}
                className="haptic rounded-full bg-forest text-paper px-4 py-1.5 text-[13px] font-bold disabled:opacity-50">Save</button>
        <button type="button" onClick={() => { setRemind(q.data!.defaults.remind); setThanks(q.data!.defaults.thanks); setMsg(null); }}
                className="haptic rounded-full border border-line px-3 py-1.5 text-[13px] font-bold text-ink">Back to the usual texts</button>
        <button type="button" onClick={() => setOpen(false)} className="haptic px-2 py-1.5 text-[13px] font-bold text-muted">Close</button>
        {msg && <span className={cx('text-[12.5px] font-bold', msg.bad ? 'text-clay' : 'text-forest')}>{msg.t}</span>}
      </div>
    </div>
  );
}

/** My Dispatch: "⚙️ My settings" — the dispatcher's own reminder / thank-you switches. */
export function MyDispatchSettings() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['dispatcher-prefs', 'mine'], queryFn: () => api<{ data: DispatcherPref | null }>('/api/dispatcher-prefs/mine').then((r) => r.data), retry: false, staleTime: 60_000 });
  const save = useMutation({
    mutationFn: (patch: Partial<DispatcherPref>) => api<{ data: DispatcherPref }>('/api/dispatcher-prefs/mine', { method: 'PUT', body: JSON.stringify(patch) }),
    onMutate: (patch) => { setErr(null); qc.setQueryData<DispatcherPref | null>(['dispatcher-prefs', 'mine'], (d) => d && { ...d, ...patch }); },
    onSuccess: (r) => { qc.setQueryData(['dispatcher-prefs', 'mine'], r.data); qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e) => { setErr(errText(e, "Couldn't save.")); qc.invalidateQueries({ queryKey: ['dispatcher-prefs', 'mine'] }); },
  });
  if (!q.data) return null; // not linked to a dispatcher (or still loading)
  const p = q.data;
  return (
    <div data-my-dispatch-settings>
      <button type="button" onClick={() => setOpen((v) => !v)} data-testid="my-dispatch-settings"
              className="haptic text-[13px] font-bold text-forest hover:underline">⚙️ My settings{open ? ' ▴' : ''}</button>
      {open && (
        <div className="mt-2 max-w-[520px] rounded-[12px] border border-line bg-paper px-3 py-2">
          <Switches p={p} save={(patch) => save.mutate(patch)} busy={save.isPending} withCalls={false} who="you" />
          <div className="text-[11.5px] text-muted pt-1 border-t border-line/60">
            📞 Dispatch calls to you are <b>{p.calls ? 'on' : 'off'}</b>. Only the office can change this.
          </div>
          {err && <div className="text-[12px] text-clay font-bold pt-1">{err}</div>}
        </div>
      )}
    </div>
  );
}
