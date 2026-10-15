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
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, API_BASE, getToken, getUser } from './api';
import { cx } from './design';

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
    setBusy(true); setErr(null);
    try {
      let screenshotUrl: string | null = null;
      if (file) screenshotUrl = await uploadScreenshot(file);
      const r = await api<{ id: number }>('/api/help/bug-reports', {
        method: 'POST',
        body: JSON.stringify({ kind, what: what.trim(), trying: trying.trim() || null, severity: isComment ? null : severity, screenshotUrl, context: ctx, whatsNewItem: item }),
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
              <div className="mt-1 text-[13.5px]">The admins were told. You can keep working.</div>
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
// Admin: all problem reports (open / fixed)
// ---------------------------------------------------------------------------
type BugRow = {
  id: number; status: 'open' | 'fixed'; createdAt: string; fixedAt: string | null;
  reporterName: string | null; reporterRole: string | null; what: string; trying: string | null;
  severity: 'small' | 'blocking' | null; screenshotUrl: string | null; context: Record<string, any>;
  kind?: ReportKind; whatsNewItem?: WhatsNewItemRef | null; // Oct 14 client
};

export function ProblemReportsModal({ onClose, onOpenTasks }: { onClose: () => void; onOpenTasks?: () => void }) {
  const [filter, setFilter] = useState<'open' | 'fixed' | 'all'>('open');
  const [kindF, setKindF] = useState<'all' | ReportKind>('all'); // Oct 14 client: type filter
  const [rows, setRows] = useState<BugRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  useEffect(() => {
    let alive = true;
    setErr(null);
    api<{ data: BugRow[] }>(`/api/help/bug-reports?status=${filter}&kind=${kindF}`)
      .then((r) => { if (alive) setRows(r.data); })
      .catch((e) => { if (alive) setErr(e?.message || "Couldn't load the reports."); });
    return () => { alive = false; };
  }, [filter, kindF, rev]);
  const setStatus = async (id: number, status: 'open' | 'fixed') => {
    try { await api(`/api/help/bug-reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); setRev((n) => n + 1); }
    catch (e: any) { setErr(e?.message || "Couldn't save."); }
  };
  const fmt = (iso: string) => new Date(iso.replace(' ', 'T').replace(/\+00$/, 'Z')).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const base = API_BASE.replace(/\/$/, '');

  return createPortal(
    <div className="fixed inset-0 z-[3000] bg-black/40 grid place-items-center p-3" role="dialog" aria-modal="true" aria-label="Problem reports">
      <div className="w-full max-w-[760px] max-h-[92vh] flex flex-col rounded-[16px] bg-paper shadow-lift border border-line">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="font-display font-semibold text-[18px]">🐞 Problem reports</div>
          <button onClick={onClose} aria-label="Close" className="haptic h-8 w-8 grid place-items-center rounded-full hover:bg-cream text-[18px]">✕</button>
        </div>
        <div className="px-5 pb-2 flex flex-wrap items-center gap-2 text-[13px]">
          {(['open', 'fixed', 'all'] as const).map((k) => (
            <button key={k} onClick={() => setFilter(k)}
                    className={cx('haptic rounded-full border px-3 py-1 font-bold', filter === k ? 'border-forest bg-forest text-paper' : 'border-line bg-paper text-ink hover:bg-cream')}>
              {k === 'open' ? 'Open' : k === 'fixed' ? 'Fixed' : 'All'}
            </button>
          ))}
          {/* Oct 14 client: Type filter */}
          <span className="mx-1 h-4 w-px bg-line" aria-hidden />
          {([['all', 'All types'], ['problem', 'Problems'], ['comment', 'Comments']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setKindF(k)} data-kind-filter={k}
                    className={cx('haptic rounded-full border px-3 py-1 font-bold', kindF === k ? 'border-forest bg-forest text-paper' : 'border-line bg-paper text-ink hover:bg-cream')}>
              {l}
            </button>
          ))}
          <span className="text-muted">Each report is also in Tasks &amp; follow-ups.</span>
          {onOpenTasks && <button onClick={onOpenTasks} className="haptic font-bold text-forest underline">Open Tasks</button>}
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2">
          {err && <div className="rounded-[10px] bg-clay-soft text-clay px-3 py-2 text-[13px] font-bold">{err}</div>}
          {rows == null && !err && <div className="text-[13px] text-muted">Loading…</div>}
          {rows && rows.length === 0 && <div className="text-[13px] text-muted">No {filter === 'all' ? '' : filter} reports.</div>}
          {rows?.map((r) => (
            <div key={r.id} className={cx('rounded-[12px] border px-4 py-3 text-[13.5px]', r.status === 'fixed' ? 'border-line bg-cream/50' : r.severity === 'blocking' ? 'border-clay/50 bg-clay-soft/40' : 'border-line bg-paper')}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-extrabold text-ink">#{r.id}</span>
                {/* Oct 14 client: Type */}
                <span data-report-type className={cx('rounded-full px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[.05em]',
                                    r.kind === 'comment' ? 'bg-sky-soft text-sky-deep' : 'bg-clay-soft text-clay')}>{r.kind === 'comment' ? 'Comment' : 'Problem'}</span>
                <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[.05em]',
                                    r.status === 'fixed' ? 'bg-sage text-forest' : 'bg-amber-soft text-[#9a7415]')}>{r.status === 'fixed' ? 'Fixed' : 'Open'}</span>
                {r.severity === 'blocking' && <span className="rounded-full bg-clay text-paper px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[.05em]">Blocking</span>}
                <span className="text-muted">{fmt(r.createdAt)} · {r.reporterName ?? 'Someone'}{r.reporterRole ? ` (${r.reporterRole})` : ''}</span>
                <span className="flex-1" />
                {r.status === 'open'
                  ? <button onClick={() => setStatus(r.id, 'fixed')} className="haptic rounded-[9px] bg-forest px-3 py-1 text-[12.5px] font-bold text-paper">Mark fixed</button>
                  : <button onClick={() => setStatus(r.id, 'open')} className="haptic rounded-[9px] border border-line px-3 py-1 text-[12.5px] font-bold text-ink hover:bg-cream">Reopen</button>}
              </div>
              {r.whatsNewItem && (
                <div className="mt-1.5 text-[12.5px] text-muted"><b>About the update:</b> [{r.whatsNewItem.area}] {r.whatsNewItem.text} <span className="whitespace-nowrap">({r.whatsNewItem.release}, {r.whatsNewItem.liveAt ? `live ${fmtLive(r.whatsNewItem.liveAt)}` : 'not live yet'})</span></div>
              )}
              <div className="mt-1.5 text-ink whitespace-pre-wrap">{r.what}</div>
              {r.trying && <div className="mt-1 text-muted"><b>Trying to:</b> {r.trying}</div>}
              <div className="mt-1 text-[12px] text-muted">
                {['Page', 'Last error shown', 'Device', 'App version'].filter((k) => r.context?.[k]).map((k) => (
                  <span key={k} className="mr-3"><b>{k}:</b> {String(r.context[k])}</span>
                ))}
              </div>
              {r.screenshotUrl && (
                <a href={base + r.screenshotUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12.5px] font-bold text-forest underline">See the picture</a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
