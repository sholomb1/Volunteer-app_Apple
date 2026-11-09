/**
 * Nov 3 client: MY SIGNATURE — each office login sets how their emails and texts end. Shown at the bottom of the
 * message box (✉️ New email, the donation reply box, and the first office text of the day), so you see it and can
 * change or delete it before sending. Nothing is added out of sight. Saved per login: GET / PUT /api/me/signature.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getUser } from './api';

export type Sig = { email: string; text: string };
type SigData = Sig & { saved: boolean; defaults: Sig };
export const sigQueryKey = ['my-signature'];

/** The usual signature, used until the saved one has loaded. */
export function usualSignature(): Sig {
  const first = String(getUser()?.firstName ?? '').trim();
  return { email: `${first ? `${first}\n` : ''}Zeh L'Zeh\n(845) 363-5323`, text: `– ${first || 'Office'}, Zeh L'Zeh` };
}

export function useMySignature(): { sig: Sig; ready: boolean } {
  const q = useQuery({ queryKey: sigQueryKey, staleTime: 10 * 60_000, retry: 1,
    queryFn: () => api<{ data: SigData }>('/api/me/signature') });
  return { sig: q.data?.data ?? usualSignature(), ready: !q.isLoading };
}

/** Put the new signature where the old one was (if it's still in the box). */
export function swapSignature(text: string, oldSig: string, newSig: string): string {
  if (!oldSig) return text;
  const i = text.lastIndexOf(oldSig);
  if (i < 0) return text;
  const out = text.slice(0, i) + newSig + text.slice(i + oldSig.length);
  return newSig ? out : out.replace(/\s+$/, '');
}

/** The message without the signature at the end — to see if anything was written. */
export function withoutSignature(text: string, sig: string): string {
  const t = text.trim();
  return sig && t.endsWith(sig.trim()) ? t.slice(0, t.length - sig.trim().length).trim() : t;
}

export function EditSignatureLink({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} data-edit-signature className="text-[12px] font-bold text-forest underline">Edit my signature</button>;
}

/** Small form: email signature (a few lines) + text signature (one line). */
export function SignatureEditor({ onClose, onSaved }: { onClose: () => void; onSaved?: (oldSig: Sig, newSig: Sig) => void }) {
  const qc = useQueryClient();
  const { sig } = useMySignature();
  const usual = qc.getQueryData<{ data: SigData }>(sigQueryKey)?.data?.defaults ?? usualSignature();
  const [email, setEmail] = useState(sig.email);
  const [text, setText] = useState(sig.text);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ data: SigData }>('/api/me/signature', { method: 'PUT', body: JSON.stringify({ email, text }) });
      qc.setQueryData(sigQueryKey, r);
      onSaved?.(sig, { email: r.data.email, text: r.data.text });
      onClose();
    } catch (e: any) { setErr(e?.body?.error || e?.message || "Couldn't save. Please try again."); }
    finally { setBusy(false); }
  };
  const box = 'w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[13.5px] text-ink';
  return (
    <div className="rounded-[12px] border border-forest/40 bg-sage/30 p-3 space-y-2" data-signature-editor>
      <div className="text-[13.5px] font-bold text-ink">✍️ My signature</div>
      <p className="text-[12px] text-muted">This is how your emails and texts end. You can still change or delete it each time before you send. Leave a box empty for no signature.</p>
      <label className="block space-y-1">
        <span className="text-[12.5px] font-bold text-ink">For emails</span>
        <textarea className={box} rows={3} value={email} maxLength={400} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-[12.5px] font-bold text-ink">For texts</span>
        <input className={box} value={text} maxLength={120} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={() => void save()}
                className="haptic rounded-full bg-forest text-paper border border-forest px-4 py-1.5 text-[12.5px] font-bold disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={onClose} className="text-[12.5px] font-bold text-muted">Cancel</button>
        <button type="button" onClick={() => { setEmail(usual.email); setText(usual.text); }} className="ml-auto text-[12px] font-bold text-muted underline">Use the usual one</button>
      </div>
      {err && <div className="text-[12px] font-bold text-clay">{err}</div>}
    </div>
  );
}
