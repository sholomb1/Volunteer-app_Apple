/**
 * Oct 31 client: "let them fit their photo — zoom in and choose which part" (crop).
 * A round preview (same circle as the name tag and the avatars): drag to move, the slider (or two
 * fingers / the mouse wheel) to zoom. "Use photo" makes a 600 × 600 JPEG of just that square.
 * No package: canvas only.
 */
import { useEffect, useRef, useState } from 'react';

const S = 280;      // preview size (px)
const OUT = 600;    // saved size (px)

export function PhotoCropDialog({ file, onDone, onCancel }: {
  file: Blob; onDone: (cropped: Blob) => void; onCancel: () => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // image top-left inside the circle box
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      setImg(im);
      const k = S / Math.min(im.naturalWidth, im.naturalHeight);
      setPos({ x: (S - im.naturalWidth * k) / 2, y: (S - im.naturalHeight * k) / 2 });
    };
    im.onerror = () => setErr("That picture couldn't be opened. Try another one.");
    im.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const base = img ? S / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const k = base * zoom;
  const clamp = (p: { x: number; y: number }, kk = k) => img ? {
    x: Math.min(0, Math.max(S - img.naturalWidth * kk, p.x)),
    y: Math.min(0, Math.max(S - img.naturalHeight * kk, p.y)),
  } : p;

  function setZoomKeepCenter(z: number) {
    const nz = Math.min(4, Math.max(1, z));
    const nk = base * nz;
    const cx = (S / 2 - pos.x) / k, cy = (S / 2 - pos.y) / k;
    setPos(clamp({ x: S / 2 - cx * nk, y: S / 2 - cy * nk }, nk));
    setZoom(nz);
  }

  function down(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom };
    }
  }
  function move(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      setZoomKeepCenter(pinch.current.z * (Math.hypot(a.x - b.x, a.y - b.y) / (pinch.current.d || 1)));
      return;
    }
    setPos((p) => clamp({ x: p.x + (e.clientX - prev.x), y: p.y + (e.clientY - prev.y) }));
  }
  function up(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  function save() {
    if (!img) return;
    const c = document.createElement('canvas');
    c.width = OUT; c.height = OUT;
    const ctx = c.getContext('2d');
    if (!ctx) { setErr("That picture couldn't be saved. Try again."); return; }
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, OUT, OUT);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, -pos.x / k, -pos.y / k, S / k, S / k, 0, 0, OUT, OUT);
    c.toBlob((b) => (b ? onDone(b) : setErr("That picture couldn't be saved. Try again.")), 'image/jpeg', 0.85);
  }

  return (
    <div className="fixed inset-0 z-[4000] bg-ink/70 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-paper rounded-[20px] shadow-lift w-full max-w-[360px] p-5 text-center">
        <div className="text-[18px] font-extrabold text-ink">Fit your photo</div>
        <div className="text-[13px] text-muted mt-0.5">Drag to move. Zoom to make it bigger.</div>
        {err ? (
          <div className="mt-4 text-[14px] font-bold text-clay">{err}</div>
        ) : (
          <div className="mx-auto mt-4 relative overflow-hidden rounded-full bg-sage touch-none select-none cursor-grab"
               style={{ width: S, height: S, boxShadow: '0 0 0 3px #B8955A' }}
               onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
               onWheel={(e) => setZoomKeepCenter(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}>
            {img && (
              <img src={img.src} alt="" draggable={false}
                   style={{ position: 'absolute', left: pos.x, top: pos.y, width: img.naturalWidth * k, height: img.naturalHeight * k, maxWidth: 'none' }} />
            )}
          </div>
        )}
        <div className="flex items-center gap-3 mt-4 px-2">
          <span className="text-[16px] text-muted">−</span>
          <input type="range" min={1} max={4} step={0.01} value={zoom} disabled={!img}
                 onChange={(e) => setZoomKeepCenter(Number(e.target.value))} className="flex-1 accent-[#2C5A3B]" aria-label="Zoom" />
          <span className="text-[16px] text-muted">+</span>
        </div>
        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onCancel} className="haptic flex-1 min-h-[46px] rounded-[12px] border border-line bg-paper font-bold text-ink">Cancel</button>
          <button type="button" onClick={save} disabled={!img} className="haptic flex-1 min-h-[46px] rounded-[12px] bg-forest text-paper font-bold disabled:opacity-50">Use photo</button>
        </div>
      </div>
    </div>
  );
}
