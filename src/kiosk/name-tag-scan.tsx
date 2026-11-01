/**
 * Oct 30 client (owner approved): kiosk "📷 Scan my name tag".
 * Opens the tablet's front camera and reads the QR code on the driver's name tag with the browser's
 * built-in BarcodeDetector (no package). Only Zeh L'Zeh tags ("ZLZ1:…") are taken; the server checks
 * the signature (POST /api/kiosk/:secret/signin-qr) and signs the driver in like his 4-digit code.
 * A device without BarcodeDetector or without a camera gets a plain message: type the 4 digits.
 * The kiosk tablet runs the phone app: it needs Sholo's next app build (and the camera permission).
 */
import { useEffect, useRef, useState } from 'react';

type State = 'starting' | 'scanning' | 'unsupported' | 'nocamera' | 'timeout';
const GIVE_UP_MS = 60_000;

export function nameTagScanSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
}

export function NameTagScanner({ onToken, onClose }: { onToken: (token: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<State>('starting');
  const [notOurs, setNotOurs] = useState(false);
  const done = useRef(onToken);
  done.current = onToken;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const giveUp = setTimeout(() => { stopped = true; stream?.getTracks().forEach((t) => t.stop()); setState('timeout'); }, GIVE_UP_MS);
    const BD = (window as any).BarcodeDetector;
    if (!nameTagScanSupported()) { setState('unsupported'); clearTimeout(giveUp); return; }
    (async () => {
      try {
        const formats: string[] | null = await BD.getSupportedFormats?.().catch(() => null) ?? null;
        if (formats && !formats.includes('qr_code')) { setState('unsupported'); return; }
        const detector = new BD({ formats: ['qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (stopped || !video.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        video.current.srcObject = stream;
        await video.current.play().catch(() => undefined);
        setState('scanning');
        const tick = async () => {
          if (stopped || !video.current) return;
          try {
            const codes: Array<{ rawValue?: string }> = await detector.detect(video.current);
            const ours = codes.map((c) => String(c.rawValue ?? '').trim()).find((v) => v.startsWith('ZLZ1:'));
            if (ours) {
              stopped = true;
              stream?.getTracks().forEach((t) => t.stop());
              try { navigator.vibrate?.(30); } catch { /* not supported */ }
              done.current(ours);
              return;
            }
            if (codes.length) setNotOurs(true);
          } catch { /* a frame that couldn't be read */ }
          timer = setTimeout(() => { void tick(); }, 200);
        };
        void tick();
      } catch {
        setState('nocamera');
      }
    })();
    return () => { stopped = true; clearTimeout(timer); clearTimeout(giveUp); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  const msg = state === 'unsupported' ? "This tablet can't read name tags yet. Please type your 4-digit code."
    : state === 'nocamera' ? "The camera didn't open. Please type your 4-digit code, or see a coordinator."
    : state === 'timeout' ? 'No name tag seen. Please try again, or type your 4-digit code.'
    : null;

  return (
    <div className="fixed inset-0 z-[3500] bg-ink/85 flex flex-col items-center justify-center p-6" role="dialog" aria-modal="true">
      <div className="text-paper text-[28px] font-extrabold text-center">📷 Scan my name tag</div>
      {msg ? (
        <div className="mt-6 max-w-[560px] rounded-[18px] bg-paper text-ink text-[22px] font-bold text-center px-6 py-6">{msg}</div>
      ) : (
        <>
          <div className="text-paper/85 text-[19px] mt-2 text-center">Hold the QR code on your name tag up to the camera.</div>
          <div className="relative mt-5 w-[min(80vw,560px)] aspect-[4/3] rounded-[22px] overflow-hidden bg-black border-[3px] border-paper/70">
            <video ref={video} playsInline muted className="absolute inset-0 w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
            <div className="absolute inset-[18%] rounded-[16px] border-[4px] border-amber/90 pointer-events-none" />
            {state === 'starting' && <div className="absolute inset-0 grid place-items-center text-paper text-[20px] font-bold">Opening the camera…</div>}
          </div>
          {notOurs && <div className="text-amber text-[17px] font-bold mt-3">That code isn't a Zeh L'Zeh name tag.</div>}
        </>
      )}
      <button type="button" onClick={onClose}
              className="mt-6 min-h-[64px] px-10 rounded-[16px] bg-paper text-ink text-[22px] font-extrabold border-[2px] border-line">
        ← Back to 4-digit sign-in
      </button>
    </div>
  );
}
