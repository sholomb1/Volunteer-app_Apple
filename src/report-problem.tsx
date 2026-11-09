/**
 * Oct 14 client: "Report a problem" — a short form any office user can send.
 * Saved on the server as a Tasks & follow-ups item ("Bug report: …") and the
 * admins get a bell alert + phone alert (see apps/api/src/routes/help.ts).
 * The page, time, user, app version, browser/device and the last error the
 * app showed are attached by themselves.
 *
 * Open it from anywhere with openReportProblem(); <ReportProblemHost /> (in
 * the Help menu) shows the form.
 * Oct 14 client: a type choice at the top — "Comment / idea" (no "How bad?",
 * low priority, bell only) or "Problem" — and openReportProblem({ kind, whatsNewItem })
 * from a What's new item ("💬 Comment" / "🐞 Something's wrong with this"); the item
 * is shown on the form and saved with the report. Admin list: Type + filter.
 * Oct 16 client: the reporter's phone is required (pre-filled from their account);
 * the admin list is one simple row per report with a details view, and "Mark fixed"
 * offers a ready text to tell them it's fixed.
 * Oct 16 client: 💬 Text them + 📋 Copy for Claude (ReporterBox) in the details and the Task dialog;
 * the list is also a "Bug reports" tab in Tasks & follow-ups (ProblemReportsList embedded).
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, API_BASE, getToken, getUser } from './api';
import { cx } from './design';
import { msgWhen } from './display';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNightSend, ScheduledTexts, personalSched, refreshScheduled } from './late-night'; // Oct 23 client: late-night prompt

const OPEN_EVENT = 'zlz:report-problem';
// Oct 14 client: what a report can be about / start as.
export type ReportKind = 'problem' | 'comment';
export type WhatsNewItemRef = { liveAt: string | null; release: string; index: number; area: string; text: string };
export type ReportOpts = { kind?: ReportKind; whatsNewItem?: WhatsNewItemRef | null };
export function openReportProblem(opts?: ReportOpts) {
  try { window.dispatchEvent(new CustomEvent<ReportOpts>(OPEN_EVENT, { detail: opts ?? {} })); } catch { /* no window */ }
}

// Which page the user is on — set by the Help menu (CoordinatorPortal header).
let currentPage = '';
export function setReportPage(label: string) { currentPage = label; }

// Last error message the app showed (api.ts keeps it on window.__zlzLastApiError).
type LastErr = { at: number; status?: number; path?: string; message?: string };
function lastApiError(): string | null {
  try {
    const e = (window as any).__zlzLastApiError as LastErr | undefined;
    if (!e || !e.at || Date.now() - e.at > 30 * 60e3) return null;
    const mins = Math.round((Date.now() - e.at) / 60e3);
    return `${e.message ?? 'error'}${e.status ? ` (code ${e.status})` : ''}${e.path ? ` on ${e.path.split('?')[0]}` : ''} — ${mins < 1 ? 'just now' : `${mins} min ago`}`;
  } catch { return null; }
}
function filterBlockedSeen(): boolean {
  try { return !!localStorage.getItem('zlz_enc'); } catch { return false; }
}

function deviceText(): string {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const ver = (/(?:Edg|OPR|Chrome|Firefox|Version)\/(\d+)/.exec(ua) || [])[1];
  const app = (window as any).Capacitor?.isNativePlatform?.() ? ' (phone app)' : '';
  return `${br}${ver ? ' ' + ver : ''} on ${os}${app} · screen ${window.innerWidth}×${window.innerHeight}`;
}
function buildText(): string {
  let v = '';
  try { v = String(__APP_VERSION_NAME__); } catch { v = 'dev'; }
  const js = (Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[])
    .map((s) => /index-([A-Za-z0-9_-]+)\.js/.exec(s.src)?.[1]).find(Boolean);
  return `${v}${js ? ` · build ${js}` : ''}`;
}

/** Shrink big photos (≤1600px JPEG) before upload. */
async function shrink(file: File): Promise<Blob> {
  if (file.size < 1.5e6 || !/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.82));
  } catch { return file; }
}
async function uploadScreenshot(file: File): Promise<string> {
  const form = new FormData();
  const blob = await shrink(file);
  form.append('file', blob, /\.(png|jpe?g|webp|gif)$/i.test(file.name) ? file.name : 'screenshot.jpg');
  const r = await fetch(`${API_BASE}/api/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${getToken() ?? ''}` }, body: form });
  if (!r.ok) throw new Error(r.status === 413 ? 'That picture is too big.' : "Couldn't upload the picture.");
  const j = await r.json();
  if (!j?.url) throw new Error("Couldn't upload the picture.");
  return String(j.url);
}

/** Small "Report a problem" link (sidebar bottom, phone menu). */
export function ReportProblemLink({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <button onClick={() => { onClick?.(); openReportProblem(); }}
            className={className ?? 'w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-[12px] font-bold text-[#a9c2a0] hover:bg-paper/5 haptic'}>
      <span aria-hidden>🐞</span> Report a problem
    </button>
  );
}

/** Listens for openReportProblem() and shows the form. Mount once (Help menu). */
export function ReportProblemHost() {
  // Oct 14 client: the options it was opened with (null = closed); n remounts the form.
  const [open, setOpen] = useState<(ReportOpts & { n: number }) | null>(null);
  useEffect(() => {
    const h = (e: Event) => setOpen({ ...(((e as CustomEvent<ReportOpts>).detail) ?? {}), n: Date.now() });
    window.addEventListener(OPEN_EVENT, h);
    return () => window.removeEventListener(OPEN_EVENT, h);
  }, []);
  return open ? <ReportProblemModal key={open.n} initialKind={open.kind ?? 'problem'} item={open.whatsNewItem ?? null} onClose={() => setOpen(null)} /> : null;
}

const fmtLive = (s: string | null) => (s ? new Date(`${s}:00`).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'not live yet');

function ReportProblemModal({ onClose, initialKind, item }: { onClose: () => void; initialKind: ReportKind; item: WhatsNewItemRef | null }) {
  const user = getUser();
  const [kind, setKind] = useState<ReportKind>(initialKind); // Oct 14 client
  const isComment = kind === 'comment';
  const [what, setWhat] = useState('');
  const [trying, setTrying] = useState('');
  const [severity, setSeverity] = useState<'small' | 'blocking' | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<number | null>(null);
  const [phone, setPhone] = useState(''); // Oct 16 client: required, pre-filled
  const phoneTouched = useRef(false);
  useEffect(() => {
    let alive = true;
    api<{ phone: string | null }>('/api/help/my-phone')
      .then((r) => { if (alive && r?.phone && !phoneTouched.current) setPhone(`${r.phone.slice(0, 3)}-${r.phone.slice(3, 6)}-${r.phone.slice(6)}`); })
      .catch(() => { /* they type it */ });
    return () => { alive = false; };
  }, []);
  const firstRef = useRef<HTMLTextAreaElement | null>(null);
  // Captured when the form opens, so the page is where the problem happened.
  const [ctx] = useState(() => ({
    Page: currentPage || document.title,
    Link: window.location.hash || window.location.pathname,
    Time: new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }) + ' (NY)',
    User: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || null,
    Role: user?.role ?? null,
    'App version': buildText(),
    Device: deviceText(),
    'Last error shown': lastApiError(),
    'Internet filter seen': filterBlockedSeen() ? 'yes (filter-proof mode on)' : null,
    Online: navigator.onLine ? null : 'offline',
  }));
  useEffect(() => { firstRef.current?.focus(); }, []);

  const send = async () => {
    if (!what.trim()) { setErr(isComment ? 'Please write your comment.' : 'Please write what happened.'); return; }
    if (!isComment && !severity) { setErr('Please pick how bad it is.'); return; }
    const ph = phone10(phone);
    if (!ph) { setErr('Please enter your phone number (10 digits).'); return; }
    setBusy(true); setErr(null);
    try {
      let screenshotUrl: string | null = null;
      if (file) screenshotUrl = await uploadScreenshot(file);
      const r = await api<{ id: number }>('/api/help/bug-reports', {
        method: 'POST',
        body: JSON.stringify({ kind, what: what.trim(), trying: trying.trim() || null, severity: isComment ? null : severity, screenshotUrl, context: ctx, whatsNewItem: item, phone: ph }),
      });
      setDoneId(Number(r.id));
      try { window.dispatchEvent(new Event('zlz:report-sent')); } catch { /* Oct 14 client: What's new comment counts refresh */ }
    } catch (e: any) {
      setErr(e?.message || "Couldn't send. Please try again.");
    } finally { setBusy(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[3000] bg-black/40 grid place-items-center p-3" role="dialog" aria-modal="true" aria-label={isComment ? 'Comment or idea' : 'Report a problem'} data-report-form>
      <div className="w-full max-w-[520px] max-h-[92vh] overflow-y-auto rounded-[16px] bg-paper shadow-lift border border-line">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="font-display font-semibold text-[18px]">{isComment ? '💬 Comment / idea' : '🐞 Report a problem'}</div>
          <button onClick={onClose} aria-label="Close" className="haptic h-8 w-8 grid place-items-center rounded-full hover:bg-cream text-[18px]">✕</button>
        </div>
        {doneId != null ? (
          <div className="px-5 pb-5">
            <div className="rounded-[12px] bg-sage/60 border border-forest/30 px-4 py-4 text-[15px] text-ink">
              <div className="font-bold text-forest text-[16px]">{isComment ? 'Thanks for your comment.' : 'Thanks — we got it.'} #{doneId}</div>
              <div className="mt-1 text-[13.5px]">The admins were told. You can keep working.{isComment ? '' : " We'll let you know when it's fixed."}</div>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={onClose} className="haptic rounded-[10px] bg-forest px-4 py-2 text-[14px] font-bold text-paper">Close</button>
            </div>
          </div>
        ) : (
          <div className="px-5 pb-5 space-y-3 text-[14px]">
            {/* Oct 14 client: type choice */}
            <div className="flex gap-2" role="group" aria-label="Type">
              {([['comment', '💬 Comment / idea'], ['problem', '🐞 Problem']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} data-report-kind={k}
                        className={cx('haptic flex-1 rounded-[10px] border px-3 py-2 text-[13px] font-bold',
                                      kind === k ? 'border-forest bg-forest text-paper' : 'border-line bg-paper text-ink hover:bg-cream')}>
                  {l}
                </button>
              ))}
            </div>
            {item && (
              <div className="rounded-[10px] border-l-[3px] border-forest/40 bg-cream/60 px-3 py-2 text-[13px] text-ink" data-report-item>
                <div className="text-[11.5px] font-extrabold uppercase tracking-[.05em] text-muted">About this update</div>
                <div className="mt-0.5"><b>{item.area}:</b> {item.text}</div>
                <div className="mt-0.5 text-[12px] text-muted">{item.release} · {item.liveAt ? `Live ${fmtLive(item.liveAt)}` : 'Not live yet'}</div>
              </div>
            )}
            <label className="block">
              <span className="font-bold text-ink">{isComment ? 'Your comment or idea' : 'What happened?'} <span className="text-clay">*</span></span>
              <textarea ref={firstRef} value={what} onChange={(e) => setWhat(e.target.value)} rows={4} maxLength={4000}
                        placeholder={isComment ? 'Example: Could this also show the store phone?' : item ? 'Example: This does not work the way it says.' : 'Example: I pressed Assign driver and nothing happened.'}
                        className="mt-1 w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[14px] focus:outline-none focus:border-forest" />
            </label>
            <label className="block">
              <span className="font-bold text-ink">What were you trying to do? <span className="font-normal text-muted">(if you want)</span></span>
              <textarea value={trying} onChange={(e) => setTrying(e.target.value)} rows={2} maxLength={2000}
                        placeholder="Example: Give the 3 PM pickup to Moshe."
                        className="mt-1 w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[14px] focus:outline-none focus:border-forest" />
            </label>
            {!isComment && (
            <div>
              <div className="font-bold text-ink">How bad is it? <span className="text-clay">*</span></div>
              <div className="mt-1 flex gap-2">
                {([['small', 'Small — I can keep working'], ['blocking', 'Blocking me — I can\'t do my work']] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setSeverity(k)} aria-pressed={severity === k}
                          className={cx('haptic flex-1 rounded-[10px] border px-3 py-2 text-[13px] font-bold text-left',
                                        severity === k ? (k === 'blocking' ? 'border-clay bg-clay-soft text-clay' : 'border-forest bg-sage text-forest')
                                                       : 'border-line bg-paper text-ink hover:bg-cream')}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            )}
            {/* Oct 16 client: phone required (so the office can text back when it's fixed) */}
            <label className="block">
              <span className="font-bold text-ink">Your phone number <span className="text-clay">*</span></span>
              <input type="tel" inputMode="tel" autoComplete="tel" value={phone} data-report-phone
                     onChange={(e) => { phoneTouched.current = true; setPhone(e.target.value); }}
                     placeholder="845-555-0123" maxLength={20}
                     className={cx('mt-1 w-full rounded-[10px] border bg-paper px-3 py-2 text-[14px] focus:outline-none focus:border-forest',
                                   phone && !phone10(phone) ? 'border-clay' : 'border-line')} />
              <span className="mt-0.5 block text-[12px] text-muted">We text you here when it's fixed.</span>
            </label>
            <label className="block">
              <span className="font-bold text-ink">Picture of the screen <span className="font-normal text-muted">(if you want)</span></span>
              <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                     className="mt-1 block w-full text-[13px]" />
            </label>
            <details className="rounded-[10px] bg-cream/70 border border-line px-3 py-2 text-[12.5px] text-muted">
              <summary className="cursor-pointer font-bold">Sent with it by itself</summary>
              <ul className="mt-1 space-y-0.5">
                {Object.entries(ctx).filter(([, v]) => v).map(([k, v]) => <li key={k}><b>{k}:</b> {String(v)}</li>)}
              </ul>
            </details>
            {err && <div className="rounded-[10px] bg-clay-soft text-clay px-3 py-2 text-[13px] font-bold">{err}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="haptic rounded-[10px] border border-line px-4 py-2 text-[14px] font-bold text-ink hover:bg-cream">Cancel</button>
              <button onClick={send} disabled={busy}
                      className="haptic rounded-[10px] bg-forest px-4 py-2 text-[14px] font-bold text-paper disabled:opacity-60">
                {busy ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Admin: all problem reports
// Oct 16 client: a simple list (one row each: #, who + phone, what happened, when, New/Fixed);
// tap a row for the details; "Mark fixed" opens "Tell them it's fixed" (Send text / Skip text);
// the reporter also gets an in-app notice (server side).
// ---------------------------------------------------------------------------
type FixedTextRec = { at: string; to: string; toName: string | null; byName: string | null; ok: boolean; error: string | null; body: string };
type BugRow = {
  id: number; status: 'open' | 'fixed'; createdAt: string; fixedAt: string | null;
  reporterName: string | null; reporterRole: string | null; what: string; trying: string | null;
  severity: 'small' | 'blocking' | null; screenshotUrl: string | null; context: Record<string, any>;
  kind?: ReportKind; whatsNewItem?: WhatsNewItemRef | null; // Oct 14 client
  phone?: string | null; phoneShown?: string | null; firstName?: string | null; // Oct 16 client
  fixedTextDraft?: string; fixedText?: FixedTextRec | null;
};

/** Oct 16 client: 10 digits (a leading 1 is dropped), or null. Same rule as the server. */
export function phone10(raw: string): string | null {
  const d = String(raw ?? '').replace(/\D/g, '');
  const t = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  return t.length === 10 && !/^[01]/.test(t) ? t : null;
}
const showPhone = (p: string | null | undefined) => (p && p.length === 10 ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : p ?? '');
const fmtWhen = (iso: string) => msgWhen(iso.replace(' ', 'T').replace(/\+00$/, 'Z')); // Oct 27 client: "Always write date"

function StatusPill({ status }: { status: 'open' | 'fixed' }) {
  return (
    <span data-report-status={status} className={cx('inline-block rounded-full px-2.5 py-0.5 text-[11.5px] font-extrabold uppercase tracking-[.05em]',
                        status === 'fixed' ? 'bg-sage text-forest' : 'bg-amber-soft text-[#9a7415]')}>
      {status === 'fixed' ? 'Fixed' : 'New'}
    </span>
  );
}

export function ProblemReportsModal({ onClose, onOpenTasks }: { onClose: () => void; onOpenTasks?: () => void }) {
  return <ProblemReportsList onClose={onClose} onOpenTasks={onOpenTasks} />;
}

/** Oct 16 client: the list itself — in the modal (Help menu) or embedded (Tasks & follow-ups → Bug reports tab). */
export function ProblemReportsList({ onClose, onOpenTasks, embedded }: { onClose?: () => void; onOpenTasks?: () => void; embedded?: boolean }) {
  const [filter, setFilter] = useState<'open' | 'fixed' | 'all'>('open');
  const [kindF, setKindF] = useState<'all' | ReportKind>('all'); // Oct 14 client: type filter
  const [all, setAll] = useState<BugRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null); // Oct 16 client: details
  const [fixBox, setFixBox] = useState(false);
  useEffect(() => {
    let alive = true;
    setErr(null);
    api<{ data: BugRow[] }>('/api/help/bug-reports?status=all&kind=all')
      .then((r) => { if (alive) setAll(r.data); })
      .catch((e) => { if (alive) setErr(e?.message || "Couldn't load the reports."); });
    if (rev) { try { window.dispatchEvent(new Event('zlz:bug-reports-changed')); } catch { /* Oct 16 client: tab count */ } }
    return () => { alive = false; };
  }, [rev]);
  const rows = all?.filter((r) => (filter === 'all' || r.status === filter) && (kindF === 'all' || (r.kind ?? 'problem') === kindF)) ?? null;
  const sel = openId != null ? all?.find((r) => r.id === openId) ?? null : null;
  const reopen = async (id: number) => {
    try { await api(`/api/help/bug-reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'open' }) }); setRev((n) => n + 1); }
    catch (e: any) { setErr(e?.message || "Couldn't save."); }
  };
  const base = API_BASE.replace(/\/$/, '');
  const chip = (on: boolean) => cx('haptic rounded-full border px-3 py-1 font-bold', on ? 'border-forest bg-forest text-paper' : 'border-line bg-paper text-ink hover:bg-cream');

  const inner = (
      <div data-problem-reports-list={embedded ? 'tab' : 'modal'}
           className={embedded ? 'relative w-full min-h-[320px] flex flex-col rounded-[16px] bg-paper border border-line pb-1'
                               : 'relative w-full max-w-[680px] max-h-[92vh] flex flex-col rounded-[16px] bg-paper shadow-lift border border-line'}>
        <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2">
          {sel
            ? <button onClick={() => { setOpenId(null); setFixBox(false); }} className="haptic font-bold text-forest text-[14px]" data-report-back>← All reports</button>
            : <div className="font-display font-semibold text-[18px]">🐞 Problem reports</div>}
          <div className="flex items-center gap-3">
            {onOpenTasks && !embedded && <button onClick={onOpenTasks} className="haptic text-[12.5px] font-bold text-forest underline" title="Tasks & follow-ups → Bug reports">Open in Tasks</button>}
            {onClose && !embedded && <button onClick={onClose} aria-label="Close" className="haptic h-8 w-8 grid place-items-center rounded-full hover:bg-cream text-[18px]">✕</button>}
          </div>
        </div>
        {err && <div className="mx-5 mb-2 rounded-[10px] bg-clay-soft text-clay px-3 py-2 text-[13px] font-bold">{err}</div>}

        {!sel && (
          <>
            <div className="px-5 pb-2 flex flex-wrap items-center gap-1.5 text-[12.5px]">
              {([['open', 'New'], ['fixed', 'Fixed'], ['all', 'All']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)} className={chip(filter === k)} data-status-filter={k}>{l}</button>
              ))}
              <span className="mx-1 h-4 w-px bg-line" aria-hidden />
              {([['all', 'All types'], ['problem', 'Problems'], ['comment', 'Comments']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setKindF(k)} data-kind-filter={k} className={chip(kindF === k)}>{l}</button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-4">
              {rows == null && !err && <div className="px-2 text-[13px] text-muted">Loading…</div>}
              {rows && rows.length === 0 && <div className="px-2 py-3 text-[13.5px] text-muted">No {filter === 'open' ? 'new ' : filter === 'fixed' ? 'fixed ' : ''}reports.</div>}
              <ul className="divide-y divide-line">
                {rows?.map((r) => (
                  <li key={r.id}>
                    <button onClick={() => setOpenId(r.id)} data-report-row={r.id}
                            className="haptic w-full text-left flex items-center gap-3 px-2 py-2.5 rounded-[10px] hover:bg-cream">
                      <span className="w-11 shrink-0 font-extrabold text-muted text-[13px]">#{r.id}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-bold text-ink text-[14.5px]">{r.reporterName ?? 'Someone'}</span>
                          {r.phoneShown && <span className="text-[12.5px] text-muted whitespace-nowrap">{r.phoneShown}</span>}
                        </span>
                        <span className="block truncate text-[13.5px] text-ink/80">
                          {r.kind === 'comment' ? '💬 ' : r.severity === 'blocking' ? '🔴 ' : ''}{r.what}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <StatusPill status={r.status} />
                        <span className="block mt-0.5 text-[11.5px] text-muted whitespace-nowrap">{fmtWhen(r.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {sel && (
          <div className="flex-1 overflow-y-auto px-5 pb-5 text-[14px]" data-report-details={sel.id}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display font-semibold text-[19px]">#{sel.id}</span>
              <StatusPill status={sel.status} />
              <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[.05em]', sel.kind === 'comment' ? 'bg-sky-soft text-sky-deep' : 'bg-clay-soft text-clay')}>
                {sel.kind === 'comment' ? 'Comment' : 'Problem'}
              </span>
              {sel.severity === 'blocking' && <span className="rounded-full bg-clay text-paper px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[.05em]">Blocking</span>}
            </div>
            {/* Oct 16 client: From: name · phone + 💬 Text them + 📋 Copy for Claude */}
            <ReporterBox taskId={sel.id} rev={rev} className="mt-2" />
            {sel.whatsNewItem && (
              <div className="mt-3 text-[13px] text-muted"><b>About the update:</b> [{sel.whatsNewItem.area}] {sel.whatsNewItem.text} ({sel.whatsNewItem.release}, {sel.whatsNewItem.liveAt ? `live ${fmtLive(sel.whatsNewItem.liveAt)}` : 'not live yet'})</div>
            )}
            <div className="mt-3">
              <div className="text-[11.5px] font-extrabold uppercase tracking-[.05em] text-muted">{sel.kind === 'comment' ? 'Comment' : 'What happened'}</div>
              <div className="mt-0.5 whitespace-pre-wrap text-ink text-[15px]">{sel.what}</div>
            </div>
            {sel.trying && <div className="mt-2"><div className="text-[11.5px] font-extrabold uppercase tracking-[.05em] text-muted">Trying to</div><div className="whitespace-pre-wrap">{sel.trying}</div></div>}
            {sel.context?.Page && <div className="mt-2 text-[13.5px]"><b>Page:</b> {String(sel.context.Page)}</div>}
            {sel.screenshotUrl && (
              <a href={base + sel.screenshotUrl} target="_blank" rel="noreferrer" className="mt-3 block" title="Open the picture">
                <img src={base + sel.screenshotUrl} alt="Screenshot" className="max-h-[260px] rounded-[10px] border border-line" />
              </a>
            )}
            {sel.fixedText && (
              <div data-fixed-text className={cx('mt-3 rounded-[10px] px-3 py-2 text-[13px]', sel.fixedText.ok ? 'bg-sage/60 text-forest' : 'bg-clay-soft text-clay')}>
                <b>{sel.fixedText.ok ? '✓ Text sent' : '✗ Text not sent'}</b> to {sel.fixedText.toName ?? 'them'} ({showPhone(sel.fixedText.to)}) · {fmtWhen(sel.fixedText.at)}{sel.fixedText.byName ? ` · by ${sel.fixedText.byName}` : ''}
                {!sel.fixedText.ok && sel.fixedText.error ? ` (${sel.fixedText.error})` : ''}
              </div>
            )}
            {sel.status === 'fixed' && sel.fixedAt && <div className="mt-2 text-[12.5px] text-muted">Marked fixed {fmtWhen(sel.fixedAt)}.</div>}
            <details className="mt-3 rounded-[10px] bg-cream/70 border border-line px-3 py-2 text-[12.5px] text-muted" data-more-details>
              <summary className="cursor-pointer font-bold">More details</summary>
              <ul className="mt-1 space-y-0.5 break-words">
                {Object.entries(sel.context ?? {}).filter(([, v]) => v !== null && v !== '').map(([k, v]) => <li key={k}><b>{k}:</b> {String(v)}</li>)}
              </ul>
            </details>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {sel.status === 'open'
                ? <button onClick={() => setFixBox(true)} className="haptic rounded-[10px] bg-forest px-4 py-2 text-[14px] font-bold text-paper" data-mark-fixed>Mark fixed</button>
                : <>
                    {!sel.fixedText?.ok && <button onClick={() => setFixBox(true)} className="haptic rounded-[10px] border border-forest px-4 py-2 text-[14px] font-bold text-forest hover:bg-sage/40">Text them it's fixed</button>}
                    <button onClick={() => reopen(sel.id)} className="haptic rounded-[10px] border border-line px-4 py-2 text-[14px] font-bold text-ink hover:bg-cream" data-reopen>Reopen</button>
                  </>}
            </div>
          </div>
        )}
        {sel && fixBox && <FixedTextBox row={sel} onClose={() => setFixBox(false)} onDone={() => { setFixBox(false); setRev((n) => n + 1); }} />}
      </div>
  );
  if (embedded) return inner;
  return createPortal(
    <div className="fixed inset-0 z-[3000] bg-black/40 grid place-items-center p-3" role="dialog" aria-modal="true" aria-label="Problem reports" data-problem-reports>
      {inner}
    </div>,
    document.body,
  );
}

/** Oct 16 client: "Tell them it's fixed" — marks the report fixed, then Send text / Skip text. */
function FixedTextBox({ row, onClose, onDone }: { row: BugRow; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState(row.fixedTextDraft ?? '');
  const [busy, setBusy] = useState<'send' | 'skip' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const markFixed = async () => {
    if (row.status !== 'fixed') await api(`/api/help/bug-reports/${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'fixed' }) });
  };
  // Oct 23 client: late at night "Send now, or schedule it?" (late-night.tsx).
  const night = useNightSend({
    send: (c: boolean) => api(`/api/help/bug-reports/${row.id}/fixed-text`, { method: 'POST', body: JSON.stringify({ body: text.trim(), ...(c ? { confirmNight: true } : {}) }) }),
    schedule: (iso: string) => personalSched.create({ kind: 'bug', reportId: Number(row.id), text: text.trim() }, iso),
    onSent: () => onDone(),
    onScheduled: () => onDone(),
    onError: (e: any) => { setErr(e?.message || "Couldn't send. Please try again."); setBusy(null); },
  });
  const go = async (send: boolean) => {
    if (send && !text.trim()) { setErr('Please write the text.'); return; }
    setBusy(send ? 'send' : 'skip'); setErr(null);
    try {
      await markFixed();
    } catch (e: any) {
      setErr(e?.message || "Couldn't send. Please try again.");
      setBusy(null);
      return;
    }
    if (!send) { onDone(); return; }
    await night.start();
    setBusy(null);
  };
  return (
    <div className="absolute inset-0 z-10 rounded-[16px] bg-black/30 grid place-items-center p-3" data-fixed-box>
      <div className="w-full max-w-[460px] rounded-[14px] bg-paper border border-line shadow-lift p-4 text-[14px]">
        <div className="flex items-center justify-between">
          <div className="font-display font-semibold text-[17px]">Tell them it's fixed</div>
          <button onClick={onClose} aria-label="Close" className="haptic h-8 w-8 grid place-items-center rounded-full hover:bg-cream text-[16px]">✕</button>
        </div>
        <div className="mt-1 text-[13px] text-muted">
          To: <b className="text-ink">{row.reporterName ?? 'the reporter'}</b>{row.phoneShown ? ` · ${row.phoneShown}` : ''}
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={600} data-fixed-text-input
                  className="mt-2 w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[14px] focus:outline-none focus:border-forest" />
        <div className="mt-1 text-[12px] text-muted">They also get a notice in the app that #{row.id} was fixed.</div>
        {!row.phone && <div className="mt-2 rounded-[10px] bg-amber-soft px-3 py-2 text-[13px] text-[#9a7415] font-bold">No phone number on this report — you can only skip the text.</div>}
        {err && <div className="mt-2 rounded-[10px] bg-clay-soft text-clay px-3 py-2 text-[13px] font-bold">{err}</div>}
        {night.prompt}
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={() => go(false)} disabled={!!busy} data-skip-text
                  className="haptic rounded-[10px] border border-line px-4 py-2 text-[14px] font-bold text-ink hover:bg-cream disabled:opacity-60">
            {busy === 'skip' ? 'Saving…' : 'Skip text'}
          </button>
          <button onClick={() => go(true)} disabled={!!busy || !row.phone} data-send-text
                  className="haptic rounded-[10px] bg-forest px-4 py-2 text-[14px] font-bold text-paper disabled:opacity-60">
            {busy === 'send' ? 'Sending…' : 'Send text'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Oct 16 client: "Text them" + "Copy for Claude" — in the Task dialog (Tasks & follow-ups)
// and in the Problem reports details. Server: GET /api/help/bug-reports/by-task/:id,
// POST /api/help/bug-reports/:id/reply, GET /api/help/tasks/:id/copy-text.
// ---------------------------------------------------------------------------
type ReplyRec = { at: string; to: string; toName: string | null; byName: string | null; ok: boolean; error: string | null; body: string };
type TaskReport = {
  id: number; kind: ReportKind; name: string | null; firstName: string | null; role: string | null; createdAt?: string | null;
  phone: string | null; phoneShown: string | null; replyDraft: string; replies: ReplyRec[]; lastReply: ReplyRec | null;
};

/** Copy text to the clipboard (navigator.clipboard, or the old textarea way). */
export async function copyText(text: string): Promise<boolean> {
  const old = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.left = '0'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  };
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); return true; } catch { return old(); }
  }
  return old();
}

/** Oct 16 client: 📋 Copy for Claude — the text is loaded ahead, so the click copies right away. */
export function CopyForClaudeButton({ taskId, rev, className }: { taskId: number; rev?: unknown; className?: string }) {
  const [text, setText] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const load = () => {
    const shotBase = new URL(API_BASE.replace(/\/$/, '') || '/', window.location.href).href.replace(/\/$/, '');
    const appUrl = window.location.origin + window.location.pathname;
    return api<{ text: string }>(`/api/help/tasks/${taskId}/copy-text?shotBase=${encodeURIComponent(shotBase)}&appUrl=${encodeURIComponent(appUrl)}`)
      .then((r) => r.text);
  };
  useEffect(() => {
    let alive = true;
    load().then((t) => { if (alive) setText(t); }).catch(() => { /* loads again on click */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, rev]);
  const click = async () => {
    let t = text;
    if (t == null) { try { t = await load(); setText(t); } catch { setState('failed'); return; } }
    const ok = await copyText(t);
    setState(ok ? 'copied' : 'failed');
    window.setTimeout(() => setState('idle'), 2500);
  };
  return (
    <button type="button" onClick={click} data-copy-claude
            className={className ?? cx('haptic rounded-[10px] border px-3 py-1.5 text-[12.5px] font-bold',
                                       state === 'copied' ? 'border-forest bg-sage text-forest' : state === 'failed' ? 'border-clay text-clay' : 'border-line bg-paper text-ink hover:bg-cream')}>
      {state === 'copied' ? '✓ Copied' : state === 'failed' ? "Couldn't copy" : '📋 Copy for Claude'}
    </button>
  );
}

/**
 * Oct 16 client: the top box of a task that came from a problem report / comment:
 * "From: <name> · <phone>" + 💬 Text them + 📋 Copy for Claude.
 * Ordinary tasks (or no access to reports): only 📋 Copy for Claude when copyAlways is set.
 */
export function ReporterBox({ taskId, rev, onSent, copyAlways, className }: { taskId: number; rev?: unknown; onSent?: () => void; copyAlways?: boolean; className?: string }) {
  const [rep, setRep] = useState<TaskReport | null | undefined>(undefined);
  const [n, setN] = useState(0);
  const [box, setBox] = useState(false);
  const [text, setText] = useState('');
  const [typedPhone, setTypedPhone] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const qc = useQueryClient();
  useEffect(() => {
    let alive = true;
    api<{ report: TaskReport | null }>(`/api/help/bug-reports/by-task/${taskId}`)
      .then((r) => { if (alive) setRep(r.report ?? null); })
      .catch(() => { if (alive) setRep(null); }); // not an admin, or not a report
    return () => { alive = false; };
  }, [taskId, n]);
  const openBox = () => { setText(rep?.replyDraft ?? ''); setErr(null); setBox(true); };
  // Oct 23 client: late at night "Send now, or schedule it?" (late-night.tsx).
  const night = useNightSend({
    send: (c: boolean) => api(`/api/help/bug-reports/${rep!.id}/reply`, { method: 'POST', body: JSON.stringify({ body: text.trim(), phone: rep!.phone ? null : phone10(typedPhone), ...(c ? { confirmNight: true } : {}) }) }),
    schedule: (iso: string) => personalSched.create({ kind: 'bug', reportId: Number(rep!.id), text: text.trim(), phone: rep!.phone ? null : phone10(typedPhone) }, iso),
    onSent: () => { setBox(false); setN((k) => k + 1); onSent?.(); },
    onScheduled: () => { setBox(false); refreshScheduled(qc); },
    onError: (e: any) => { setErr(e?.message || "Couldn't send. Please try again."); setN((k) => k + 1); onSent?.(); },
  });
  const busy = night.busy;
  const send = async () => {
    if (!rep) return;
    if (!text.trim()) { setErr('Please write the text.'); return; }
    if (!rep.phone && !phone10(typedPhone)) { setErr('Please enter a 10-digit phone number.'); return; }
    setErr(null);
    await night.start();
  };
  if (rep === undefined) return copyAlways ? <div className={cx('flex justify-end', className)}><CopyForClaudeButton taskId={taskId} rev={rev} /></div> : null;
  if (!rep) return copyAlways ? <div className={cx('flex justify-end', className)} data-task-copy-row><CopyForClaudeButton taskId={taskId} rev={rev} /></div> : null;
  const last = rep.lastReply;
  return (
    <div className={cx('rounded-[12px] bg-cream/60 border border-line px-3 py-2 text-[13.5px]', className)} data-reporter-box={rep.id}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-muted">From: </span>
          <b className="text-ink text-[14.5px]">{rep.name ?? 'Someone'}</b>
          {rep.role ? <span className="text-muted text-[12.5px]"> ({rep.role})</span> : null}
          {' · '}
          {rep.phoneShown ? <a href={`tel:${rep.phone}`} className="font-bold text-forest underline" data-reporter-phone>{rep.phoneShown}</a>
                          : <span className="text-[#9a7415] font-bold">No phone on this report</span>}
          {rep.createdAt ? <span className="text-muted"> · {fmtWhen(rep.createdAt)}</span> : null}
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={openBox} data-text-them
                  className="haptic rounded-[10px] bg-forest px-3 py-1.5 text-[12.5px] font-bold text-paper">💬 Text them</button>
          <CopyForClaudeButton taskId={taskId} rev={`${String(rev ?? '')}:${n}`} />
        </div>
      </div>
      {last && (
        <div data-reply-sent className={cx('mt-1.5 text-[12.5px]', last.ok ? 'text-forest' : 'text-clay')}>
          {last.ok ? '✓ Sent' : '✗ Not sent'} to {showPhone(last.to)} · {fmtWhen(last.at)}{last.byName ? ` · by ${last.byName}` : ''}
          {!last.ok && last.error ? ` (${last.error})` : ''}
        </div>
      )}
      <ScheduledTexts filter={{ reportId: Number(rep.id) }} className="mt-1.5" />
      {night.prompt}
      {box && (
        <div className="mt-2 rounded-[10px] border border-line bg-paper p-2.5" data-text-them-box>
          <div className="text-[12.5px] text-muted">To: <b className="text-ink">{rep.name ?? 'them'}</b>{rep.phoneShown ? ` · ${rep.phoneShown}` : ''}</div>
          {!rep.phone && (
            <label className="mt-1 block text-[12.5px]">
              <span className="font-bold text-[#9a7415]">No phone on this report.</span> Type one:
              <input type="tel" inputMode="tel" value={typedPhone} onChange={(e) => setTypedPhone(e.target.value)} placeholder="845-555-0123" maxLength={20}
                     data-reply-phone className={cx('mt-1 w-full rounded-[10px] border bg-paper px-3 py-1.5 text-[14px]', typedPhone && !phone10(typedPhone) ? 'border-clay' : 'border-line')} />
            </label>
          )}
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={600} data-reply-input autoFocus
                    className="mt-1.5 w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[14px] focus:outline-none focus:border-forest" />
          <div className="text-[11.5px] text-muted text-right">{text.length}/600</div>
          {err && <div className="mt-1 rounded-[10px] bg-clay-soft text-clay px-3 py-1.5 text-[12.5px] font-bold">{err}</div>}
          <div className="mt-1.5 flex justify-end gap-2">
            <button type="button" onClick={() => setBox(false)} disabled={busy}
                    className="haptic rounded-[10px] border border-line px-3 py-1.5 text-[13px] font-bold text-ink hover:bg-cream">Cancel</button>
            <button type="button" onClick={send} disabled={busy} data-reply-send
                    className="haptic rounded-[10px] bg-forest px-3 py-1.5 text-[13px] font-bold text-paper disabled:opacity-60">{busy ? 'Sending…' : 'Send'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Oct 16 client: open problem reports + comments — the count on the "Bug reports" tab (admins). */
export function BugReportsBadge() {
  // Nov 3 client: speed — asks for the number only (was the whole list), and not while the portal is in a hidden browser tab.
  const q = useQuery({
    queryKey: ['bug-reports-open-count'],
    queryFn: () => api<{ data: { count: number } }>('/api/help/bug-reports?status=open&kind=all&count=1'),
    refetchInterval: 60_000, retry: false,
  });
  const { refetch } = q;
  useEffect(() => {
    const h = () => { void refetch(); };
    window.addEventListener('zlz:report-sent', h);
    window.addEventListener('zlz:bug-reports-changed', h);
    return () => { window.removeEventListener('zlz:report-sent', h); window.removeEventListener('zlz:bug-reports-changed', h); };
  }, [refetch]);
  const count = Number(q.data?.data?.count ?? 0) || 0;
  if (!count) return null;
  return <span data-bug-reports-count className="inline-grid place-items-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-red-500 text-paper text-[11px] font-extrabold">{count > 99 ? '99+' : count}</span>;
}
