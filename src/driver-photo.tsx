/**
 * Oct 30 client (owner approved): a driver's profile photo.
 *  - Shown ONLY to office + dispatcher (+ view-only) logins and to the driver himself: driver card,
 *    Drivers list (small round avatar), pickup page driver line, driver app My profile.
 *    Never on store-facing or public screens (the API refuses those logins: routes/volunteer-photos.ts).
 *  - Added from the camera or the gallery, shrunk on the phone to ~600 px JPEG ~80%, uploaded with
 *    the normal /api/uploads (random file name), then the link is saved (no migration: portal_settings).
 *  - The office changes / removes anyone's photo; the driver his own; dispatchers only look.
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, API_BASE, getToken, getUser } from './api';
import { storePhotoSrc, PhotoViewer } from './store-photo';
import { uiConfirm, uiNotify } from './ui-dialogs';
import { PhotoCropDialog } from './photo-crop'; // Oct 31 client: zoom + choose the part

export type PhotoMap = Record<string, string>;
const VIEW_ROLES = ['admin', 'staff', 'coordinator', 'dispatcher', 'viewer'];
const EDIT_ROLES = ['admin', 'staff', 'coordinator'];

export function canSeeDriverPhotos(): boolean { return VIEW_ROLES.includes(String(getUser()?.role ?? '').toLowerCase()); }
export function canEditDriverPhotos(): boolean { return EDIT_ROLES.includes(String(getUser()?.role ?? '').toLowerCase()); }

/** Every driver's photo link (office / dispatcher logins only). One small request, cached a minute. */
export function usePhotoMap(enabled = true) {
  const on = enabled && canSeeDriverPhotos();
  const q = useQuery({
    queryKey: ['volunteer-photos'],
    queryFn: () => api<{ data: PhotoMap }>('/api/volunteer-photos'),
    enabled: on, staleTime: 60_000, retry: 1,
  });
  return on ? q.data?.data : undefined;
}

export function initialsOf(first?: string | null, last?: string | null): string {
  return ((String(first ?? '').trim().charAt(0) + String(last ?? '').trim().charAt(0)).toUpperCase()) || '?';
}

/** Round photo, or the initials when there is none (or it fails to load). */
export function DriverAvatar({ url, first, last, size = 32, className = '', onClick }: {
  url?: string | null; first?: string | null; last?: string | null; size?: number; className?: string; onClick?: () => void;
}) {
  const [bad, setBad] = useState(false);
  const src = !bad ? storePhotoSrc(url) : null;
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) };
  return src ? (
    <img src={src} alt="" loading="lazy" onError={() => setBad(true)} onClick={onClick} style={style}
         className={`rounded-full object-cover shrink-0 border border-line bg-sage ${onClick ? 'cursor-zoom-in' : ''} ${className}`} />
  ) : (
    <span aria-hidden style={style}
          className={`rounded-full shrink-0 grid place-items-center bg-sage text-forest font-extrabold select-none ${className}`}>
      {initialsOf(first, last)}
    </span>
  );
}

const MAX_SIDE = 600;
function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That picture couldn't be opened. Try another one.")); };
    img.src = url;
  });
}
/** Shrink on the phone: longest side ~600 px, JPEG ~80%. */
export async function shrinkProfilePhoto(file: Blob): Promise<Blob> {
  const img = await loadImage(file);
  const w0 = img.naturalWidth || 1, h0 = img.naturalHeight || 1;
  const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error("That picture couldn't be opened. Try another one.");
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("That picture couldn't be saved. Try again."))), 'image/jpeg', 0.8));
}
async function uploadBlob(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append('file', blob, 'photo.jpg');
  const r = await fetch(`${API_BASE.replace(/\/$/, '')}/api/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${getToken() ?? ''}` }, body: form })
    .catch(() => { throw new Error("Can't reach the server. Check the internet connection and try again."); });
  if (!r.ok) throw new Error("The photo didn't upload. Please try again.");
  const j = await r.json().catch(() => null);
  if (!j?.url) throw new Error("The photo didn't upload. Please try again.");
  return String(j.url);
}

/** Photo + "Add photo / Change / Remove". `save(url|null)` stores the link. */
function PhotoEditor({ url, first, last, canEdit, save, size, big }: {
  url: string | null; first?: string | null; last?: string | null; canEdit: boolean;
  save: (url: string | null) => Promise<unknown>; size: number; big?: boolean;
}) {
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState(false);
  const src = storePhotoSrc(url);
  // Oct 31 client: a picked photo first opens "Fit your photo" (drag / zoom), then the square is saved.
  const [crop, setCrop] = useState<Blob | null>(null);
  function picked(f: File | undefined | null) {
    if (cam.current) cam.current.value = ''; if (gal.current) gal.current.value = '';
    if (!f) return;
    setErr(null); setCrop(f);
  }
  async function cropped(b: Blob) {
    setCrop(null); setErr(null); setBusy('Saving photo…');
    try { await save(await uploadBlob(await shrinkProfilePhoto(b))); }
    catch (e: any) { setErr(e?.message || "Couldn't save the photo. Please try again."); }
    finally { setBusy(null); }
  }
  // "Adjust" = fit the photo that is already saved.
  async function adjust() {
    if (!src) return;
    setErr(null); setBusy('Opening…');
    try {
      const r = await fetch(src);
      if (!r.ok) throw new Error();
      setCrop(await r.blob());
    } catch { setErr("Couldn't open the photo. Tap New photo instead."); }
    finally { setBusy(null); }
  }
  async function remove() {
    if (!(await uiConfirm('Remove this photo?'))) return;
    setErr(null); setBusy('Removing…');
    try { await save(null); } catch (e: any) { setErr(e?.message || "Couldn't remove the photo. Please try again."); }
    finally { setBusy(null); }
  }
  const btn = big
    ? 'haptic min-h-[44px] px-4 rounded-[12px] text-[15px] font-bold border border-line bg-paper text-forest disabled:opacity-50'
    : 'haptic px-2.5 py-1 rounded-[8px] text-[12px] font-bold border border-line bg-paper text-forest hover:bg-sage disabled:opacity-50';
  return (
    <div className="flex items-center gap-3 min-w-0">
      <DriverAvatar url={url} first={first} last={last} size={size} onClick={src ? () => setView(true) : undefined} />
      <div className="min-w-0">
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btn} disabled={!!busy} onClick={() => cam.current?.click()}>📷 {url ? 'New photo' : 'Add photo'}</button>
            <button type="button" className={btn} disabled={!!busy} onClick={() => gal.current?.click()}>🖼️ From gallery</button>
            {url && <button type="button" className={btn} disabled={!!busy} onClick={() => void adjust()}>✂️ Adjust</button>}
            {url && <button type="button" disabled={!!busy} onClick={() => void remove()}
                            className={big ? 'haptic min-h-[44px] px-3 text-[15px] font-bold text-clay underline underline-offset-2' : 'haptic text-[12px] font-bold text-clay underline underline-offset-2'}>Remove</button>}
          </div>
        )}
        {busy && <div className={big ? 'text-[14px] text-muted mt-1' : 'text-[11.5px] text-muted mt-1'}>{busy}</div>}
        {err && <div className={big ? 'text-[14px] font-bold text-clay mt-1' : 'text-[11.5px] font-bold text-clay mt-1'}>{err}</div>}
        {!canEdit && !url && <div className="text-[11.5px] text-muted">No photo yet.</div>}
      </div>
      <input ref={cam} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => picked(e.target.files?.[0])} />
      <input ref={gal} type="file" accept="image/*" className="hidden" onChange={(e) => picked(e.target.files?.[0])} />
      {view && src && <PhotoViewer src={src} onClose={() => setView(false)} />}
      {crop && <PhotoCropDialog file={crop} onDone={(b) => void cropped(b)} onCancel={() => setCrop(null)} />}
    </div>
  );
}

/** Office driver card: the photo (+ change / remove for the office; dispatchers only see it). */
export function DriverPhotoRow({ volunteerId, firstName, lastName, extra }: {
  volunteerId: number; firstName?: string | null; lastName?: string | null; extra?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const map = usePhotoMap();
  if (!canSeeDriverPhotos()) return null;
  const url = map?.[String(volunteerId)] ?? null;
  const save = async (u: string | null) => {
    if (u) await api(`/api/volunteers/${volunteerId}/photo`, { method: 'PUT', body: JSON.stringify({ url: u }) });
    else await api(`/api/volunteers/${volunteerId}/photo`, { method: 'DELETE' });
    qc.setQueryData(['volunteer-photos'], (old: any) => {
      const next = { ...(old?.data ?? {}) };
      if (u) next[String(volunteerId)] = u; else delete next[String(volunteerId)];
      return { data: next };
    });
    uiNotify(u ? 'Photo saved.' : 'Photo removed.', 'ok');
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
      <PhotoEditor url={url} first={firstName} last={lastName} canEdit={canEditDriverPhotos()} save={save} size={64} />
      {extra}
    </div>
  );
}

/** Driver app → My profile: "Add photo" (camera or gallery), change, remove. */
export function MyPhotoSection({ firstName, lastName }: { firstName?: string | null; lastName?: string | null }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me-photo'], queryFn: () => api<{ data: { volunteerId: number; url: string | null } }>('/api/me/photo'), staleTime: 60_000, retry: 1 });
  const m = useMutation({
    mutationFn: (u: string | null) => u
      ? api<{ data: { url: string | null } }>('/api/me/photo', { method: 'PUT', body: JSON.stringify({ url: u }) })
      : api<{ data: { url: string | null } }>('/api/me/photo', { method: 'DELETE' }),
    onSuccess: (r) => { qc.setQueryData(['me-photo'], (old: any) => ({ data: { ...(old?.data ?? {}), url: r?.data?.url ?? null } })); void qc.invalidateQueries({ queryKey: ['volunteer-photos'] }); },
  });
  if (q.isError) return null; // not linked / offline: the rest of the page still works
  return (
    <div className="mt-6">
      <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-forest mb-3">My photo</div>
      <PhotoEditor url={q.data?.data?.url ?? null} first={firstName} last={lastName} canEdit={!q.isLoading}
                   save={(u) => m.mutateAsync(u)} size={88} big />
      <p className="text-[14px] text-muted mt-2 leading-snug">Only the office and the dispatchers see it. It goes on your name tag.</p>
    </div>
  );
}
