/**
 * Oct 11 client: "New sign-ups" inbox. One card per driver application that is
 * still status 'new', with one-click Approve (Default text group / urgent
 * alerts / welcome text, pre-filled from their answers) or "Not now".
 * API: routes/volunteer-signups.ts.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, canWrite, getUser } from './api';
import { uiConfirm, uiNotify } from './ui-dialogs';
import { fmtDay, fmtTimeEastern } from './time-format';
import { callSummary } from './on-call'; // Oct 14 client (was to12h for the call hours)
import { IntakeInfoCard } from './portal-sections';

type Signup = {
  id: number | string; firstName: string; lastName: string | null; phone: string | null; email: string | null;
  address: string | null; appliedAt: string | null;
  vehicleType: string | null; vehicleCapacity: string | null;
  areas: string[] | null; areaOther: string | null; pickupInterest: string | null; contactMethods: string[] | null;
  wantsPickupTexts: boolean | null; wantsUncoveredAlerts: boolean | null; wantsSteadyReminders: boolean | null;
  steadyReminderMinutes: number | null;
  onCall: { day: string; start: string; end: string }[];
  inDefaultGroup: boolean; inUncoveredAlerts: boolean;
  intakePayload: any; intakeReceivedAt: string | null;
};

const COUNT_KEY = ['volunteer-signups-count'];
const LIST_KEY = ['volunteer-signups'];

const pretty = (v: string) => v.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const yesNo = (v: boolean | null) => (v === true ? 'Yes' : v === false ? 'No' : 'Not answered');
const CONTACT: Record<string, string> = { notification: 'App notification', push: 'App notification', text: 'Text', sms: 'Text', whatsapp: 'WhatsApp', call: 'Phone call', email: 'Email' };

function fmtPhone(p: string | null) {
  const d = String(p ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(p ?? '');
}

/** Sidebar / tab badge: how many sign-ups are waiting. */
export function SignupsBadge() {
  const q = useQuery({
    queryKey: COUNT_KEY,
    queryFn: () => api<{ data: { count: number } }>('/api/volunteer-signups/count'),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const n = Number(q.data?.data?.count ?? 0);
  if (!n) return null;
  return <span className="ml-auto inline-grid place-items-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-red-500 text-paper text-[11px] font-extrabold">{n > 99 ? '99+' : n}</span>;
}

export function SignupsPanel() {
  const qc = useQueryClient();
  const writeOk = canWrite(getUser()?.role);
  const q = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => api<{ data: Signup[]; count: number }>('/api/volunteer-signups'),
    refetchOnWindowFocus: true,
  });
  const [gone, setGone] = useState<Set<number>>(new Set());
  const rows = (q.data?.data ?? []).filter((r) => !gone.has(Number(r.id)));

  const handled = (id: number, msg: string) => {
    setGone((s) => new Set(s).add(id));
    uiNotify(msg, 'ok');
    qc.invalidateQueries({ queryKey: COUNT_KEY });
    qc.invalidateQueries({ queryKey: LIST_KEY });
    qc.invalidateQueries({ queryKey: ['admin-volunteers'] });
  };

  if (q.isLoading) return <div className="text-[14px] text-muted">Loading…</div>;
  if (q.isError) return <div className="text-[14px] text-clay">Could not load new sign-ups. {(q.error as any)?.message ?? ''}</div>;
  if (rows.length === 0) {
    return <div className="rounded-[14px] border border-line bg-paper px-4 py-6 text-center text-[15px] text-muted">No new sign-ups waiting.</div>;
  }
  return (
    <div className="space-y-3">
      <div className="text-[13px] text-muted">
        {rows.length} new {rows.length === 1 ? 'sign-up' : 'sign-ups'} waiting. Approve adds them to the Default text group (that is the review).
      </div>
      {rows.map((r) => <SignupCard key={String(r.id)} r={r} writeOk={writeOk} onDone={handled} />)}
    </div>
  );
}

function SignupCard({ r, writeOk, onDone }: { r: Signup; writeOk: boolean; onDone: (id: number, msg: string) => void }) {
  const id = Number(r.id);
  const name = [r.firstName, r.lastName].filter(Boolean).join(' ');
  const [mode, setMode] = useState<'none' | 'approve' | 'decline'>('none');
  const [showFull, setShowFull] = useState(false);
  const [busy, setBusy] = useState(false);
  // Pre-filled from their answers: texts unless they said no; urgent alerts only if they said yes.
  const [addToTexts, setAddToTexts] = useState(r.inDefaultGroup || r.wantsPickupTexts !== false);
  const [uncovered, setUncovered] = useState(r.inUncoveredAlerts || r.wantsUncoveredAlerts === true);
  const [welcome, setWelcome] = useState(!r.inDefaultGroup && r.wantsPickupTexts !== false && !!r.phone);
  const [reason, setReason] = useState('');

  const applied = r.appliedAt ? `${fmtDay(r.appliedAt)} ${fmtTimeEastern(r.appliedAt)}` : '';
  const vehicle = [r.vehicleType && pretty(r.vehicleType), r.vehicleCapacity && `${pretty(r.vehicleCapacity)} load`].filter(Boolean).join(', ');
  const areas = [...(Array.isArray(r.areas) ? r.areas : []), r.areaOther].filter(Boolean).join(', ');
  const contact = Array.isArray(r.contactMethods) ? r.contactMethods.map((c) => CONTACT[c] ?? pretty(String(c))).join(', ') : '';
  // Oct 14 client: "Anytime" / the hours / "Please don't call" (the sign-up's call question);
  // "Not answered" unless they chose don't call (intake_payload.callChoice).
  const onCall = callSummary(r.onCall ?? [], { saturday: 'Motzei Shabbos', choice: r.intakePayload?.callChoice });
  const answers: [string, string][] = [
    ['Vehicle', vehicle],
    ['Areas', areas],
    ['Interested in', r.pickupInterest ? pretty(r.pickupInterest) : ''],
    ['Contact by', contact],
    ['Pickup texts', yesNo(r.wantsPickupTexts)],
    ['Urgent no-driver alerts', yesNo(r.wantsUncoveredAlerts)],
    ['Steady reminders', r.wantsSteadyReminders === true && r.steadyReminderMinutes ? `Yes, ${r.steadyReminderMinutes} minutes before` : yesNo(r.wantsSteadyReminders)],
    ['OK to call', onCall],
  ];

  const approve = async () => {
    setBusy(true);
    try {
      const res = await api<{ data: { addedToTexts: boolean; noDefaultGroup: boolean; uncoveredAlerts: boolean; welcomeRequested: boolean; welcomed: boolean } }>(
        `/api/volunteer-signups/${id}/approve`,
        { method: 'POST', body: JSON.stringify({ addToTexts, uncoveredAlerts: uncovered, sendWelcome: welcome }) });
      const d = res.data;
      const bits = [
        d.addedToTexts ? 'added to the Default text group' : d.noDefaultGroup ? 'NOT added to texts (no Default text group is set)' : null,
        d.uncoveredAlerts ? 'gets urgent alerts' : null,
        d.welcomeRequested ? (d.welcomed ? 'welcome text sent' : 'welcome text NOT sent') : null,
      ].filter(Boolean);
      onDone(id, `${r.firstName} approved${bits.length ? ` — ${bits.join(', ')}` : ''}.`);
    } catch (e: any) {
      uiNotify(`Could not approve: ${e?.message ?? e}`, 'err');
    } finally { setBusy(false); }
  };

  const decline = async () => {
    if (!(await uiConfirm(`Mark ${name} as "Not now"? They get no text. Their status becomes Inactive.`, { okLabel: 'Not now', cancelLabel: 'Go back' }))) return;
    setBusy(true);
    try {
      await api(`/api/volunteer-signups/${id}/decline`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() || undefined }) });
      onDone(id, `${r.firstName} marked "Not now".`);
    } catch (e: any) {
      uiNotify(`Could not save: ${e?.message ?? e}`, 'err');
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-[16px] border border-line bg-paper p-4 shadow-sm">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-extrabold text-ink">{name}</div>
          <div className="text-[13px] text-muted">
            {r.phone && <a href={`tel:${String(r.phone).replace(/[^\d+]/g, '')}`} className="font-bold text-forest underline">{fmtPhone(r.phone)}</a>}
            {r.email && <span> · {r.email}</span>}
            {r.address && <span> · {r.address}</span>}
          </div>
        </div>
        <div className="text-[12px] font-bold text-muted whitespace-nowrap">Applied {applied}</div>
      </div>
      {r.inDefaultGroup && (
        <div className="mt-2 inline-block rounded-full bg-sage/60 px-2.5 py-0.5 text-[12px] font-bold text-forest">Already in the Default text group</div>
      )}

      <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
        {answers.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="grid grid-cols-[150px_1fr] gap-2 text-[13px]">
            <dt className="font-bold text-muted">{k}</dt>
            <dd className="text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <button onClick={() => setShowFull((v) => !v)} className="mt-2 text-[13px] font-bold text-forest underline haptic">
        {showFull ? 'Hide full application' : 'Open full application'}
      </button>
      {showFull && <IntakeInfoCard payload={r.intakePayload} receivedAt={r.intakeReceivedAt} kind="volunteer" />}

      {writeOk && mode === 'none' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => setMode('approve')} disabled={busy}
                  className="haptic rounded-[10px] bg-forest px-4 py-2 text-[14px] font-bold text-paper">Approve</button>
          <button onClick={() => setMode('decline')} disabled={busy}
                  className="haptic rounded-[10px] border border-line bg-paper px-4 py-2 text-[14px] font-bold text-muted hover:text-ink">Not now</button>
        </div>
      )}

      {writeOk && mode === 'approve' && (
        <div className="mt-3 rounded-[12px] border border-forest/30 bg-sage/30 p-3 space-y-2">
          <div className="text-[14px] font-extrabold text-ink">Approve {r.firstName}?</div>
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={addToTexts} onChange={(e) => setAddToTexts(e.target.checked)} />
            Add to Default text group (gets pickup texts)
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={uncovered} onChange={(e) => setUncovered(e.target.checked)} />
            Urgent no-driver alerts
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={welcome} disabled={!r.phone} onChange={(e) => setWelcome(e.target.checked)} />
            Send welcome text{!r.phone && ' (no phone number)'}
          </label>
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={approve} disabled={busy}
                    className="haptic rounded-[10px] bg-forest px-4 py-2 text-[14px] font-bold text-paper">{busy ? 'Saving…' : 'Approve'}</button>
            <button onClick={() => setMode('none')} disabled={busy}
                    className="haptic rounded-[10px] border border-line bg-paper px-4 py-2 text-[14px] font-bold text-muted">Go back</button>
          </div>
        </div>
      )}

      {writeOk && mode === 'decline' && (
        <div className="mt-3 rounded-[12px] border border-line bg-cream p-3 space-y-2">
          <div className="text-[14px] font-extrabold text-ink">Not now — {r.firstName} gets no text.</div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500}
                 placeholder="Why? (optional, office only)"
                 className="w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[14px]" />
          <div className="flex flex-wrap gap-2">
            <button onClick={decline} disabled={busy}
                    className="haptic rounded-[10px] bg-clay px-4 py-2 text-[14px] font-bold text-paper">{busy ? 'Saving…' : 'Not now'}</button>
            <button onClick={() => setMode('none')} disabled={busy}
                    className="haptic rounded-[10px] border border-line bg-paper px-4 py-2 text-[14px] font-bold text-muted">Go back</button>
          </div>
        </div>
      )}
    </div>
  );
}
