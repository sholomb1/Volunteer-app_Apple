/**
 * Oct 30 client (owner approved): printable driver name tags.
 * Office: Drivers list → tick drivers (or one driver card) → "🪪 Make name tags".
 * Standard ID-card size (CR80, 3.375 × 2.125 in), 10 per Letter page (2 × 5) with cut marks.
 * Each tag: photo (or initials), full name, unit #, the Zeh L'Zeh logo, and a QR code (Oct 31 client: cream & gold design).
 * The QR holds a sign-in token the server signs ("ZLZ1:<id>:<sig>", api nametag-token.ts), NOT just the
 * unit number; the kiosk's "📷 Scan my name tag" reads it. The API sends the QR as rows of modules
 * (qr-encode.ts, no package); this page draws them as an SVG. Print = the browser's print (Save as PDF works too).
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { storePhotoSrc } from './store-photo';
import { uiNotify } from './ui-dialogs';

export type NameTag = {
  volunteerId: number; firstName: string; lastName: string; unitNumber: number | null; initials: string;
  roleLine: string; photoUrl: string | null; token: string; qr: string[];
};

const LOGO = `${(import.meta as any).env?.BASE_URL ?? '/'}zlz-logo-wordmark.png`;
const PER_PAGE = 10;
// Letter 8.5 × 11 in; grid 2 × 5 of 3.375 × 2.125 = 6.75 × 10.625 in, centred.
const MX = (8.5 - 2 * 3.375) / 2;   // 0.875 in
const MY = (11 - 5 * 2.125) / 2;    // 0.1875 in

/** QR modules -> SVG (quiet zone of 3 modules). */
export function QrSvg({ rows, size }: { rows: string[]; size: string }) {
  const n = rows.length, q = 3;
  let d = '';
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === '1') d += `M${x + q} ${y + q}h1v1h-1z`; });
  return (
    <svg viewBox={`0 0 ${n + 2 * q} ${n + 2 * q}`} style={{ width: size, height: size, display: 'block' }} shapeRendering="crispEdges" aria-label="QR code">
      <rect width={n + 2 * q} height={n + 2 * q} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

// Oct 31 client chose "Option A — cream & gold": cream card, thin gold frame, first name large in Fraunces,
// round photo with a gold ring, "DRIVER NO. 20", a small QR in the corner (still easy for the kiosk to read).
const SERIF = "'Fraunces', Georgia, serif";
const SANS = "'Hanken Grotesk Variable', 'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', Arial, sans-serif";
const CREAM = '#FAF5EC', GOLD = '#B8955A', DEEP = '#1E3F29';

export function NameTagCard({ t }: { t: NameTag }) {
  const photo = storePhotoSrc(t.photoUrl);
  const first = String(t.firstName ?? '').trim();
  const last = String(t.lastName ?? '').trim();
  const firstSize = first.length > 11 ? '14pt' : first.length > 8 ? '17pt' : '21pt';
  return (
    <div className="nt-tag" style={{ width: '3.375in', height: '2.125in', boxSizing: 'border-box', position: 'relative', overflow: 'hidden',
      background: CREAM, color: '#1C2A21', fontFamily: SANS }}>
      {/* thin gold frame */}
      <div style={{ position: 'absolute', inset: '0.07in', border: `1px solid ${GOLD}`, borderRadius: '0.1in' }} />
      {/* top: logo + "FOOD RESCUE VOLUNTEER" */}
      <img src={LOGO} alt="Zeh L'Zeh" style={{ position: 'absolute', left: '0.2in', top: '0.15in', height: '0.32in', width: 'auto' }} />
      <div style={{ position: 'absolute', right: '0.2in', top: '0.21in', fontSize: '6pt', fontWeight: 600, letterSpacing: '.22em', color: DEEP }}>
        FOOD RESCUE VOLUNTEER
      </div>
      {/* round photo with a gold ring */}
      <div style={{ position: 'absolute', left: '0.24in', top: '0.6in', width: '0.98in', height: '0.98in', borderRadius: '50%', overflow: 'hidden',
        boxShadow: `0 0 0 1.5px ${CREAM}, 0 0 0 2.5px ${GOLD}`, background: '#E5EEE2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {photo
          ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontFamily: SERIF, fontSize: '24pt', fontWeight: 600, color: DEEP }}>{t.initials}</span>}
      </div>
      {/* name, then "DRIVER NO. 20" */}
      <div style={{ position: 'absolute', left: '1.4in', top: '0.6in', right: '0.2in' }}>
        <div dir="auto" style={{ fontFamily: SERIF, fontSize: firstSize, fontWeight: 600, lineHeight: 1.02, color: DEEP, wordBreak: 'break-word' }}>{first}</div>
        <div dir="auto" style={{ fontFamily: SERIF, fontSize: last.length > 16 ? '8.5pt' : '10.5pt', fontWeight: 500, lineHeight: 1.2, color: DEEP, marginTop: '0.03in', wordBreak: 'break-word' }}>{last}</div>
        <div style={{ width: '0.5in', height: '1px', background: GOLD, margin: '0.07in 0 0.05in' }} />
        {t.unitNumber != null && (
          <div style={{ fontSize: '6.5pt', fontWeight: 600, letterSpacing: '.14em', color: '#6E7C70' }}>DRIVER NO. {t.unitNumber}</div>
        )}
      </div>
      {/* small QR in the corner (the kiosk's "Scan my name tag") */}
      <div style={{ position: 'absolute', right: '0.18in', bottom: '0.16in', width: '0.62in', height: '0.62in' }}>
        <QrSvg rows={t.qr} size="0.62in" />
      </div>
      <div style={{ position: 'absolute', left: '0.24in', bottom: '0.17in', fontFamily: SERIF, fontStyle: 'italic', fontSize: '7pt', color: '#2C5A3B' }}>
        Rescuing food, feeding families
      </div>
    </div>
  );
}

/** One Letter page: 10 tags + cut marks in the margins. */
function Page({ tags }: { tags: NameTag[] }) {
  const xs = [0, 3.375, 6.75].map((x) => MX + x);
  const ys = [0, 1, 2, 3, 4, 5].map((i) => MY + i * 2.125);
  const mark = { position: 'absolute' as const, background: '#000' };
  return (
    <div className="nt-page" style={{ width: '8.5in', height: '11in', position: 'relative', background: '#fff', boxSizing: 'border-box' }}>
      {xs.map((x, i) => (
        <span key={`v${i}`}>
          <span style={{ ...mark, left: `${x}in`, top: 0, width: '0.5pt', height: `${MY - 0.04}in` }} />
          <span style={{ ...mark, left: `${x}in`, bottom: 0, width: '0.5pt', height: `${MY - 0.04}in` }} />
        </span>
      ))}
      {ys.map((y, i) => (
        <span key={`h${i}`}>
          <span style={{ ...mark, top: `${y}in`, left: '0.25in', height: '0.5pt', width: `${MX - 0.33}in` }} />
          <span style={{ ...mark, top: `${y}in`, right: '0.25in', height: '0.5pt', width: `${MX - 0.33}in` }} />
        </span>
      ))}
      <div style={{ position: 'absolute', left: `${MX}in`, top: `${MY}in`, display: 'grid', gridTemplateColumns: 'repeat(2, 3.375in)', gridAutoRows: '2.125in' }}>
        {tags.map((t) => <div key={t.volunteerId} style={{ outline: '0.5pt dashed #c8c8c8', outlineOffset: '-0.25pt' }}><NameTagCard t={t} /></div>)}
      </div>
    </div>
  );
}

const PRINT_CSS = `
@page { size: letter portrait; margin: 0; }
#zlz-nametags .nt-tag, #zlz-nametags .nt-tag * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@media print {
  html, body { background: #fff !important; }
  body > *:not(#zlz-nametags) { display: none !important; }
  #zlz-nametags { position: static !important; inset: auto !important; overflow: visible !important; background: #fff !important; padding: 0 !important; }
  #zlz-nametags .nt-toolbar { display: none !important; }
  #zlz-nametags .nt-pages { gap: 0 !important; padding: 0 !important; }
  #zlz-nametags .nt-page-wrap { box-shadow: none !important; break-after: page; page-break-after: always; }
  #zlz-nametags .nt-page-wrap:last-child { break-after: auto; page-break-after: auto; }
}`;

/** Full-screen print page for these drivers. */
export function NameTagsSheet({ ids, onClose }: { ids: number[]; onClose: () => void }) {
  const [pdfTip, setPdfTip] = useState(false); // Oct 31 client: Save as PDF tip
  const q = useQuery({
    queryKey: ['name-tags', ids.join(',')],
    queryFn: () => api<{ data: { tags: NameTag[] } }>(`/api/name-tags?ids=${ids.join(',')}`),
    staleTime: 0, gcTime: 0, retry: 1,
  });
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const tags = q.data?.data?.tags ?? [];
  const pages: NameTag[][] = [];
  for (let i = 0; i < tags.length; i += PER_PAGE) pages.push(tags.slice(i, i + PER_PAGE));
  return createPortal(
    <div id="zlz-nametags" className="fixed inset-0 z-[4000] overflow-auto bg-[#e9ece8]">
      <style>{PRINT_CSS}</style>
      <div className="nt-toolbar sticky top-0 z-10 flex flex-wrap items-center gap-3 bg-paper border-b border-line px-4 py-3 shadow-card">
        <div className="font-bold text-[15px] text-ink">🪪 Name tags</div>
        <div className="text-[12.5px] text-muted">
          {q.isLoading ? 'Making the tags…' : q.isError ? '' : `${tags.length} ${tags.length === 1 ? 'tag' : 'tags'} · ${pages.length} ${pages.length === 1 ? 'page' : 'pages'} · ID-card size (3.375 × 2.125 in), 10 per Letter page. Print at 100% ("Actual size").`}
          {pdfTip && <div className="text-[13px] font-bold text-forest mt-0.5">In the print window, set Destination to <b>Save as PDF</b>, then tap Save.</div>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Oct 31 client: "the option to download as a PDF" — the print window's "Save as PDF" (no extra
              package), with a clear file name and a one-line tip. */}
          <button type="button" disabled={!tags.length}
                  onClick={() => {
                    setPdfTip(true);
                    const old = document.title;
                    document.title = `Zeh L'Zeh name tags ${new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })}`;
                    setTimeout(() => { window.print(); document.title = old; }, 50);
                  }}
                  className="haptic rounded-[10px] border border-forest bg-paper px-4 py-2 text-[14px] font-bold text-forest disabled:opacity-50">⬇️ Save as PDF</button>
          <button type="button" onClick={() => window.print()} disabled={!tags.length}
                  className="haptic bg-forest text-paper rounded-[10px] px-4 py-2 text-[14px] font-bold shadow-ctag disabled:opacity-50">🖨️ Print</button>
          <button type="button" onClick={onClose} className="haptic rounded-[10px] border border-line bg-paper px-4 py-2 text-[14px] font-bold text-ink">Close</button>
        </div>
      </div>
      {q.isError && <div className="m-6 rounded-[12px] bg-clay-soft text-clay font-bold px-4 py-3">{(q.error as Error)?.message || "Couldn't make the name tags."}</div>}
      <div className="nt-pages flex flex-col items-center gap-6 py-6">
        {pages.map((p, i) => <div key={i} className="nt-page-wrap shadow-lift"><Page tags={p} /></div>)}
      </div>
    </div>,
    document.body,
  );
}

/** "🪪 Make name tags" button (office only; the caller decides whether to show it). */
export function MakeNameTagsButton({ ids, label, className, title }: { ids: number[]; label?: string; className?: string; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Oct 31 client: the greyed-out button was confusing — tapping it with nobody ticked now says what to do. */}
      <button type="button" aria-disabled={!ids.length}
              onClick={(e) => { e.stopPropagation(); if (ids.length) setOpen(true); else uiNotify('First tick the drivers (the box next to each name), then tap Make name tags.', 'info'); }}
              title={title ?? (ids.length ? 'Print ID-card name tags with photo and QR code' : 'Tick drivers first')}
              className={className ?? 'haptic text-[12px] font-bold border border-line bg-paper text-forest px-3 py-1.5 rounded-[8px] hover:bg-sage aria-disabled:opacity-60'}>
        {label ?? `🪪 Make name tags${ids.length ? ` (${ids.length})` : ''}`}
      </button>
      {open && <NameTagsSheet ids={ids} onClose={() => setOpen(false)} />}
    </>
  );
}
