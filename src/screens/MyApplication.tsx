/**
 * Oct 14 client: "Review application / update application". Shows what the
 * driver sent on the volunteer sign-up form (volunteers.intake_payload, with
 * today's name / phone / email / quiet hours / call hours), read-only, and an
 * "Update my answers" button that opens the SAME questions prefilled (every
 * question kept — owner rule). Saving updates only what a volunteer may change
 * (never status, groups or unit #); the API records what changed in the audit
 * log and tells the office. Oct 14: the call question (Anytime / Only at these times /
 * Please don't call) is saved by PUT /api/me/application into the real call hours.
 * Oct 14 client: the office uses the same view + form for a driver who can't use the
 * app (driver profile → Application; ApplicationPanel with `volunteerId`):
 * /api/volunteers/:id/application — same handler, same fields, audit by the office user,
 * no office text.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil } from 'lucide-react';
import { api, driverSettings } from '../api';
import { FadeUp } from '../design';
import { uiNotify } from '../ui-dialogs';
import { groupSlots } from '../on-call';
import { ApplicationSummary, VolunteerApplicationForm, type ApplicationAnswers } from './VolunteerRegistration';
import { LoadError } from './VolunteerHome';

type Slot = { day: string; start: string; end: string; note?: string | null };
type AppData = Awaited<ReturnType<typeof driverSettings.application>>['data'];
const fmtDate = (iso: string | null | undefined) => (iso
  ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }) : '');
// The driver screens scroll inside the phone frame, not the window.
const toTop = () => document.getElementById('my-application-top')?.scrollIntoView({ block: 'start' });

export function MyApplication() {
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  return (
    <div className="min-h-screen pb-[100px]">
      <div id="my-application-top" className="flex items-center gap-3 px-5 py-3">
        <button onClick={() => { if (editing) setEditing(false); else if (window.history.length <= 1) nav('/', { replace: true }); else nav(-1); }} aria-label="Back"
                className="haptic grid h-[44px] w-[44px] place-items-center rounded-full bg-paper border border-line">
          <ArrowLeft size={20} />
        </button>
        <div className="font-display font-semibold text-[20px]">{editing ? 'Update my answers' : 'My application'}</div>
      </div>
      <main className="px-5">
        <ApplicationPanel editing={editing} setEditing={setEditing} />
      </main>
    </div>
  );
}

/** The answers + "Update my answers" form. No `volunteerId` = the driver's own (app);
 *  with `volunteerId` = the office editing that driver (same API handler). */
export function ApplicationPanel({ volunteerId, name, editing, setEditing }: { volunteerId?: number; name?: string; editing: boolean; setEditing: (v: boolean) => void }) {
  const qc = useQueryClient();
  const office = volunteerId != null;
  const appUrl = office ? `/api/volunteers/${volunteerId}/application` : '/api/me/application';
  const callUrl = office ? `/api/volunteers/${volunteerId}/on-call` : '/api/me/on-call';
  const appKey = office ? ['vol-application', volunteerId] : ['me-application'];
  const app = useQuery({ queryKey: appKey, queryFn: () => api<{ data: AppData }>(appUrl) });
  const calls = useQuery({ queryKey: ['on-call', callUrl], queryFn: () => api<{ data: Slot[] }>(callUrl) });
  const d = app.data?.data;
  const slots = calls.data?.data ?? [];
  // Call hours as the form shows them ("Weekdays (Mon–Thu)" / "Every day" when they match).
  const answers: ApplicationAnswers | null = d ? { ...d.answers, onCall: groupSlots(slots).map((r) => ({ day: r.day, start: r.start, end: r.end })) } : null;
  const who = name || 'the driver';
  const top = () => { if (!office) toTop(); else document.getElementById(`office-application-${volunteerId}`)?.scrollIntoView({ block: 'start' }); };

  async function save(body: Record<string, any>) {
    // Oct 14 client: the call answer (Anytime / these times / don't call) is saved by the API
    // into the real call hours (same list as Settings → Phone calls), keeping each row's note.
    const r = await api<{ data: AppData & { changed?: string[] } }>(appUrl, { method: 'PUT', body: JSON.stringify(body) });
    await qc.invalidateQueries({ queryKey: ['on-call', callUrl] });
    qc.invalidateQueries({ queryKey: ['on-call-now'] });
    qc.setQueryData(appKey, { data: r.data });
    if (office) {
      qc.invalidateQueries({ queryKey: ['volunteer-alerts', volunteerId] });
      qc.invalidateQueries({ queryKey: ['admin-volunteers'] });
    } else {
      qc.invalidateQueries({ queryKey: ['volunteer-self'] });
      qc.invalidateQueries({ queryKey: ['me-settings'] });
    }
    setEditing(false);
    top();
    const changed = (r.data.changed ?? []).length > 0;
    uiNotify(changed ? (office ? `Saved ${who}'s answers.` : 'Saved. The office was told about your changes.') : 'Saved. Nothing was changed.', 'ok');
  }

  if (app.isLoading || calls.isLoading) return <p className="text-muted text-center py-10">Loading…</p>;
  if (!answers || !d) return <LoadError onRetry={() => { app.refetch(); calls.refetch(); }} busy={app.isFetching || calls.isFetching} error={app.error ?? calls.error} what="your application" />;
  if (editing) return (
    <FadeUp>
      <div className="rounded-[12px] border border-line bg-cream/60 px-3.5 py-2.5 text-[15px] text-ink leading-snug">
        {office
          ? <>Change {who}'s answers (for a driver who can't use the app), then tap <b>Save answers</b>. It changes the same settings {who} sees in the app.</>
          : <>Change anything that is different now, then tap <b>Save my answers</b>. The office will see what you changed.</>}
      </div>
      <VolunteerApplicationForm initial={answers} selfEdit submitLabel={office ? 'Save answers' : 'Save my answers'} onSubmit={save} onCancel={() => setEditing(false)} />
    </FadeUp>
  );
  return (
    <FadeUp>
      <div className="text-[15px] text-muted leading-snug">
        {d.hasApplication
          ? <>{office ? `What ${who} told us` : 'What you told us'} on the volunteer sign-up form{d.receivedAt ? ` (${fmtDate(d.receivedAt)})` : ''}.</>
          : office ? <>No sign-up form from {who} yet — the office added them. You can fill in the answers for them.</>
          : <>We don't have a sign-up form from you yet — the office added you. You can fill in the answers now.</>}
        {d.updatedAt && <> Last updated {fmtDate(d.updatedAt)}.</>}
      </div>
      <ApplicationSummary answers={answers} />
      <div className="sticky bottom-0 -mx-5 mt-6 border-t border-line bg-paper/95 backdrop-blur px-5 py-3">
        <button onClick={() => { setEditing(true); top(); }} data-edit-answers
                className="haptic w-full min-h-[52px] rounded-[14px] bg-forest text-paper text-[17px] font-bold flex items-center justify-center gap-2">
          <Pencil size={18} /> {office ? (d.hasApplication ? 'Edit answers' : 'Fill in answers') : d.hasApplication ? 'Update my answers' : 'Fill in my answers'}
        </button>
      </div>
    </FadeUp>
  );
}
