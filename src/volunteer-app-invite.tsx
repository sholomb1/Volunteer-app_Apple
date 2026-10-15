/**
 * Oct 14 client: "📲 Invite to the app" for a volunteer (driver) — like the dispatcher invite.
 * - VolunteerAppInviteBar: status line + button on the office driver profile (Overview tab).
 * - VolunteerAppInviteModal: creates their login (or a set / reset password link), shows the
 *   ready message (editable) → Send by text / Copy / Send by WhatsApp.
 * - AppUsageInviteCell + BulkAppInviteButton: the same from Admin → App Usage, plus
 *   "Invite all with no login (N)" (texts one by one; skips STOP / no phone).
 * Backend: apps/api/src/routes/volunteer-app-access.ts. The volunteer sets a password at
 * /welcome/<token> (AcceptInvite in staff-invite.tsx).
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { cx } from './design';

type InviteState = 'none' | 'pending' | 'expired' | 'used';
type Status = {
  hasLogin: boolean; username: string | null; loginActive: boolean | null; lastLoginAt: string | null;
  invitedAt: string | null; invite: InviteState; phone?: string | null; textProblem?: string | null; whatsapp?: boolean;
};
type Prepared = {
  mode: 'new' | 'reset'; username: string; inviteUrl: string; text: string; days: number;
  phone: string | null; textProblem: string | null; whatsapp: boolean;
  links: { web: string; android: string; ios: string };
};

const fmtDay = (x: string | null | undefined) => x ? new Date(x).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

/** "Invite sent Oct 14 · not used yet" / "· used" / "· link expired" — '' when never invited. */
export function inviteStatusText(s: { invitedAt?: string | null; invite?: InviteState } | null | undefined): string {
  if (!s?.invitedAt || !s.invite || s.invite === 'none') return '';
  const tail = s.invite === 'pending' ? 'not used yet' : s.invite === 'expired' ? 'link expired' : 'used';
  return `Invite sent ${fmtDay(s.invitedAt)} · ${tail}`;
}

const KEYS = ['vol-app-access', 'vol-app-access-statuses', 'vol-app-access-bulk', 'admin-app-usage'];
function useRefresh() {
  const qc = useQueryClient();
  return () => { for (const k of KEYS) qc.invalidateQueries({ queryKey: [k] }); };
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: any }) {
  return (
    <div className="fixed inset-0 z-[2100] bg-ink/50 flex items-start justify-center pt-10 px-4 overflow-y-auto" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} data-testid="vol-invite-modal"
           className="relative z-[2101] bg-paper rounded-[18px] shadow-lift border border-line w-full max-w-lg p-5 space-y-3 mb-10">
        <div className="flex items-center justify-between">
          <div className="font-display font-semibold text-[16px]">{title}</div>
          <button onClick={onClose} aria-label="Close" className="haptic grid h-8 w-8 place-items-center rounded-full hover:bg-cream text-muted">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Driver profile: status + "📲 Invite to the app" (or Resend). */
export function VolunteerAppInviteBar({ volunteerId, name }: { volunteerId: number; name: string }) {
  const q = useQuery({
    queryKey: ['vol-app-access', volunteerId],
    queryFn: () => api<{ data: Status }>(`/api/volunteers/${volunteerId}/app-access`),
  });
  const [open, setOpen] = useState(false);
  const s = q.data?.data;
  const sent = inviteStatusText(s);
  const login = !s ? '' : !s.hasLogin ? 'No app login yet'
    : s.loginActive === false ? 'App login turned off'
    : s.lastLoginAt ? `App login: ${s.username} · last in ${fmtDay(s.lastLoginAt)}` : `App login: ${s.username} · never signed in`;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-line bg-cream/40 px-3 py-2">
      <div className="mr-auto text-[12.5px]">
        <div className="font-bold text-ink">{login || '…'}</div>
        {sent && <div className="text-muted" data-testid="vol-invite-status">{sent}</div>}
      </div>
      <button onClick={() => setOpen(true)} data-testid="vol-invite-btn"
              className="haptic rounded-[10px] border border-forest/40 bg-paper px-3 py-1.5 text-[12.5px] font-bold text-forest hover:bg-sage/60">
        {s?.invitedAt ? '📲 Resend app invite' : '📲 Invite to the app'}
      </button>
      {open && <VolunteerAppInviteModal volunteerId={volunteerId} name={name} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function VolunteerAppInviteModal({ volunteerId, name, onClose }: { volunteerId: number; name: string; onClose: () => void }) {
  const refresh = useRefresh();
  const [text, setText] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const prep = useMutation({
    mutationFn: () => api<{ data: Prepared }>(`/api/volunteers/${volunteerId}/app-access`, { method: 'POST', body: '{}' }),
    onSuccess: (r) => { setText(r.data.text); refresh(); },
  });
  const started = useRef(false);
  useEffect(() => { if (!started.current) { started.current = true; prep.mutate(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const send = useMutation({
    mutationFn: (channel: 'sms' | 'whatsapp' | 'copy') => api<{ data: { sent: boolean; sentTo: string | null } }>(
      `/api/volunteers/${volunteerId}/app-access/send`, { method: 'POST', body: JSON.stringify({ channel, text }) }),
    onSuccess: (r, ch) => {
      refresh();
      setNote({ ok: true, text: ch === 'copy' ? 'Copied. Paste it into a text or WhatsApp to them.'
        : ch === 'whatsapp' ? `Sent by WhatsApp to ${r.data.sentTo}.` : `Texted to ${r.data.sentTo}.` });
    },
    onError: (e: any) => setNote({ ok: false, text: e?.message || 'Not sent' }),
  });
  const p = prep.data?.data;
  const copy = () => { void navigator.clipboard?.writeText(text).catch(() => {}); send.mutate('copy'); };
  return (
    <Shell title={`Invite ${name} to the app`} onClose={onClose}>
      {prep.isPending || (!p && !prep.isError) ? <div className="text-[13px] text-muted">Getting their login ready…</div>
       : prep.isError ? <div className="text-[13px] text-clay">{(prep.error as any)?.message || 'Could not create the invite.'}</div>
       : p && (
        <>
          <div className="rounded-[10px] bg-sage/40 border border-sage-line px-3 py-2 text-[12.5px]">
            {p.mode === 'new'
              ? <>New app login made. Username: <b className="font-mono">{p.username}</b></>
              : <>They already have a login (<b className="font-mono">{p.username}</b>). This sends a link to set / reset their password.</>}
            <div className="text-muted">The password link works for {p.days} days.</div>
          </div>
          <label className="block text-[12px] font-bold">Message (you can change it)
            <textarea value={text} onChange={(e) => { setText(e.target.value); setNote(null); }} rows={7} data-testid="vol-invite-text"
                      className="mt-1 w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px] font-normal" />
          </label>
          <div className="text-[11.5px] text-muted">{text.length} characters · wording: Messaging → Groups → Message templates (“Volunteer app invite”)</div>
          {p.textProblem && <div className="text-[12px] text-clay font-semibold">{p.textProblem}</div>}
          {note && <div className={cx('rounded-[10px] px-3 py-2 text-[12.5px] font-semibold', note.ok ? 'bg-sage/50 text-forest' : 'bg-clay/10 text-clay')}
                        data-testid="vol-invite-note">{note.ok ? '✅ ' : '⚠️ '}{note.text}</div>}
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={copy} className="haptic rounded-[10px] border border-line px-4 py-2 text-[13px] font-bold">Copy</button>
            {p.whatsapp && (
              <button onClick={() => send.mutate('whatsapp')} disabled={!p.phone || !text.trim() || send.isPending}
                      className="haptic rounded-[10px] border border-forest/40 px-4 py-2 text-[13px] font-bold text-forest disabled:opacity-50">Send by WhatsApp</button>
            )}
            <button onClick={() => send.mutate('sms')} disabled={!!p.textProblem || !text.trim() || send.isPending} data-testid="vol-invite-sms"
                    className="haptic rounded-[10px] bg-forest px-4 py-2 text-[13px] font-bold text-paper disabled:opacity-50">
              {send.isPending ? 'Sending…' : `Send by text${p.phone ? ` to ${p.phone}` : ''}`}
            </button>
          </div>
        </>
      )}
      <div className="flex justify-end"><button onClick={onClose} className="haptic text-[12.5px] font-bold text-muted hover:underline">Close</button></div>
    </Shell>
  );
}

/** App Usage: invite status per volunteer ({ [volunteerId]: status }). */
export function useAppInviteStatuses() {
  const q = useQuery({
    queryKey: ['vol-app-access-statuses'],
    queryFn: () => api<{ data: { volunteerId: number; invitedAt: string; invite: InviteState }[] }>('/api/volunteers/app-access/statuses'),
    refetchInterval: 60_000,
  });
  const m: Record<number, { invitedAt: string; invite: InviteState }> = {};
  for (const r of q.data?.data ?? []) m[r.volunteerId] = r;
  return m;
}

/** App Usage row: status + Invite / Resend for "No login" and "Never opened" rows. */
export function AppUsageInviteCell({ row, status }: { row: { id: number; first_name: string; last_name: string; bucket: string }; status?: { invitedAt: string; invite: InviteState } }) {
  const [open, setOpen] = useState(false);
  const show = row.bucket === 'no_login' || row.bucket === 'never' || !!status;
  if (!show) return null;
  const line = inviteStatusText(status);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {line && <span className="text-[11px] text-muted">{line}</span>}
      {(row.bucket === 'no_login' || row.bucket === 'never') && (
        <button onClick={() => setOpen(true)} data-testid={`usage-invite-${row.id}`}
                className="haptic rounded-[8px] border border-forest/40 px-2 py-0.5 text-[11px] font-bold text-forest hover:bg-sage/60">
          {status ? 'Resend' : '📲 Invite'}
        </button>
      )}
      {open && <VolunteerAppInviteModal volunteerId={row.id} name={`${row.first_name} ${row.last_name}`.trim()} onClose={() => setOpen(false)} />}
    </span>
  );
}

type BulkRow = { id: number; name: string; unitNumber: number | null; phone: string | null; reason?: string };

/** App Usage: "Invite all with no login (N)" → confirm the names → text them one by one. */
export function BulkAppInviteButton() {
  const q = useQuery({
    queryKey: ['vol-app-access-bulk'],
    queryFn: () => api<{ data: { eligible: BulkRow[]; skipped: BulkRow[] } }>('/api/volunteers/app-access/bulk'),
  });
  const [open, setOpen] = useState(false);
  const n = q.data?.data.eligible.length ?? 0;
  return (
    <>
      <button onClick={() => setOpen(true)} disabled={!n} data-testid="bulk-invite-btn"
              className="haptic rounded-[10px] border border-forest/40 px-3 py-1.5 text-[12px] font-bold text-forest hover:bg-sage/60 disabled:opacity-50">
        📲 Invite all with no login ({n})
      </button>
      {open && q.data && <BulkInviteModal data={q.data.data} onClose={() => { setOpen(false); void q.refetch(); }} />}
    </>
  );
}

function BulkInviteModal({ data, onClose }: { data: { eligible: BulkRow[]; skipped: BulkRow[] }; onClose: () => void }) {
  const refresh = useRefresh();
  const [picked, setPicked] = useState<Set<number>>(() => new Set(data.eligible.map((r) => r.id)));
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<number, string>>({});
  const stop = useRef(false);
  const list = data.eligible.filter((r) => picked.has(r.id));
  async function run() {
    setRunning(true); stop.current = false;
    for (const r of list) {
      if (stop.current) break;
      setResults((x) => ({ ...x, [r.id]: 'sending…' }));
      try {
        const p = await api<{ data: Prepared }>(`/api/volunteers/${r.id}/app-access`, { method: 'POST', body: '{}' });
        await api(`/api/volunteers/${r.id}/app-access/send`, { method: 'POST', body: JSON.stringify({ channel: 'sms', text: p.data.text }) });
        setResults((x) => ({ ...x, [r.id]: '✅ sent' }));
      } catch (e: any) {
        setResults((x) => ({ ...x, [r.id]: `⚠️ ${e?.message || 'not sent'}` }));
      }
      await new Promise((ok) => setTimeout(ok, 1200)); // one by one, gently
    }
    setRunning(false); refresh();
  }
  const done = Object.values(results).filter((v) => v.startsWith('✅')).length;
  return (
    <Shell title="Invite everyone with no app login" onClose={() => { stop.current = true; onClose(); }}>
      <div className="text-[12.5px] text-muted">
        Each person gets their own text with the app links, a link to set their password and their login
        (wording: “Volunteer app invite” template). People who texted STOP or have no cell phone are skipped.
      </div>
      <div className="max-h-[320px] overflow-y-auto rounded-[10px] border border-line divide-y divide-line" data-testid="bulk-invite-list">
        {data.eligible.map((r) => (
          <label key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-[12.5px]">
            <input type="checkbox" className="h-4 w-4 accent-forest" disabled={running} checked={picked.has(r.id)}
                   onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />
            <span className="font-bold">{r.name}</span>
            {r.unitNumber != null && <span className="text-muted">#{r.unitNumber}</span>}
            <span className="ml-auto text-muted tabular-nums">{results[r.id] ?? r.phone}</span>
          </label>
        ))}
      </div>
      {data.skipped.length > 0 && (
        <details className="text-[12px]">
          <summary className="cursor-pointer font-bold text-muted">Skipped ({data.skipped.length})</summary>
          <div className="mt-1 max-h-[160px] overflow-y-auto space-y-0.5">
            {data.skipped.map((r) => <div key={r.id}>{r.name} <span className="text-muted">— {r.reason}</span></div>)}
          </div>
        </details>
      )}
      {done > 0 && <div className="text-[12.5px] font-semibold text-forest">{done} sent.</div>}
      <div className="flex justify-end gap-2">
        <button onClick={() => { stop.current = true; onClose(); }} className="haptic rounded-[10px] border border-line px-4 py-2 text-[13px] font-bold text-muted">
          {running ? 'Stop' : 'Close'}
        </button>
        <button onClick={run} disabled={running || list.length === 0 || done > 0} data-testid="bulk-invite-send"
                className="haptic rounded-[10px] bg-forest px-4 py-2 text-[13px] font-bold text-paper disabled:opacity-50">
          {running ? 'Sending…' : `Send ${list.length} ${list.length === 1 ? 'text' : 'texts'}`}
        </button>
      </div>
    </Shell>
  );
}
