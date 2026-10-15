/**
 * Oct 14 client: the photo a store adds when it posts food (pickup_instances.photo_url,
 * store posts only -> API field store_photo_url / photoUrl). Shown to drivers (pickup
 * card + pickup page), the office (Live Board card + pickup page) and the store (My pickups).
 * Saved by the API as '/uploads/<random>.jpg' (no login needed), so the API base is put in
 * front: works on dev, on the live site and in the phone app. A broken link is hidden.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE } from './api';

export function storePhotoSrc(u: string | null | undefined): string | null {
  const s = String(u ?? '').trim();
  if (!s) return null;
  if (/^(data:image\/|https?:\/\/|blob:)/i.test(s)) return s;
  if (s.startsWith('/uploads/') || s.startsWith('/api/')) return API_BASE.replace(/\/$/, '') + s;
  return null;
}

/** Full-screen photo; tap anywhere or × to close. */
export function PhotoViewer({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  // Clicks inside a portal still bubble to the React parent (a clickable card) -> stop them.
  const close = (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); onClose(); };
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Photo from the store" onClick={close}
         className="fixed inset-0 z-[2000] bg-black/90 flex items-center justify-center p-3">
      <img src={src} alt="Photo from the store" className="max-w-full max-h-full object-contain rounded-[10px]"
           onClick={(e) => e.stopPropagation()} />
      <button type="button" aria-label="Close photo" onClick={close}
              className="absolute right-3 h-12 w-12 rounded-full bg-white/90 text-[30px] font-bold leading-none text-black flex items-center justify-center"
              style={{ top: 'max(12px, env(safe-area-inset-top))' }}>×</button>
    </div>,
    document.body,
  );
}

/** Small square thumbnail with a 📷 mark; tap opens the photo large. Renders nothing without a (working) photo. */
export function StorePhotoThumb({ url, size = 40, className }: { url: string | null | undefined; size?: number; className?: string }) {
  const src = storePhotoSrc(url);
  const [bad, setBad] = useState(false);
  const [open, setOpen] = useState(false);
  if (!src || bad) return null;
  return (
    <>
      <button type="button" aria-label="See the photo from the store" title="Photo from the store"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); }}
              className={`haptic relative shrink-0 rounded-[8px] overflow-hidden border border-line bg-cream ${className ?? ''}`}
              style={{ width: size, height: size }}>
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setBad(true)} className="h-full w-full object-cover" />
        <span className="absolute bottom-0 right-0 bg-white/90 rounded-tl-[5px] px-[2px] text-[10px] leading-[12px]">📷</span>
      </button>
      {open && <PhotoViewer src={src} onClose={() => setOpen(false)} />}
    </>
  );
}

/** "📷 Photo from the store" card for the pickup page; tap opens it full screen. */
export function StorePhotoCard({ url, className }: { url: string | null | undefined; className?: string }) {
  const src = storePhotoSrc(url);
  const [bad, setBad] = useState(false);
  const [open, setOpen] = useState(false);
  if (!src || bad) return null;
  return (
    <div className={`mt-3 rounded-[14px] border border-line bg-paper overflow-hidden ${className ?? ''}`}>
      <div className="px-3.5 pt-2.5 pb-2 text-[15px] font-bold text-ink">📷 Photo from the store</div>
      <button type="button" aria-label="See the photo bigger" className="block w-full bg-cream"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); }}>
        <img src={src} alt="Photo from the store" loading="lazy" decoding="async" onError={() => setBad(true)}
             className="block w-full max-h-[260px] object-cover" />
      </button>
      <div className="px-3.5 py-1.5 text-[12px] text-muted">Tap the photo to see it bigger</div>
      {open && <PhotoViewer src={src} onClose={() => setOpen(false)} />}
    </div>
  );
}
