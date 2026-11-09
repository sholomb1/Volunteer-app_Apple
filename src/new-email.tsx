/**
 * Nov 3 client: "send a new email from the app … connect it to the same place my other email is". Sent from the
 * connected dispatch mailbox (Food Donations → ⚙️ Email connection) — the same login the replies use; no new setup.
 * ✉️ New email (Food Donations → Email) and ✉️ Email (driver / store cards) open this one pop-up, mounted once
 * in the portal. API: POST /api/food-donations/new-email (the test site saves it but never sends).
 * Nov 3 client: + 📝 Templates (admins edit them) and My signature — the signature is IN the message box, so you
 * see it and can change it; the server no longer adds one.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getUser } from './api';
import { useMySignature, SignatureEditor, EditSignatureLink, swapSignature, withoutSignature } from './my-signature'; // Nov 3 client

type Contact = { name: string | null; email: string; kind: 'driver' | 'store' | 'donor' | string };
const KIND: Record<string, string> = { driver: 'driver', store: 'store', donor: 'donor' };
const OFFICE = ['admin', 'staff', 'coordinator']; // the Food Donations page is office-only in the menu
const isEmail = (s: string) => /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(s.trim());

export function canSendEmail(): boolean { return OFFICE.includes(String(getUser()?.role ?? '').toLowerCase()); }

// ---- Nov 3 client: EMAIL TEMPLATES — a subject + message with fill-ins {name} {me} {store}; admins edit them.
// Picking one fills Subject + Message (your signature stays at the bottom); everything can be changed before Send.
// API: GET / PUT /api/food-donations/email-templates (portal_settings). Also used by the donation reply box.
export type EmailTemplate = { name: string; subject: string; text: string };
type TplData = { templates: EmailTemplate[]; canEdit: boolean };
export const emailTplKey = ['email-templates'];
const firstWord = (s: string | null | undefined) => String(s ?? '').trim().split(/\s+/)[0] ?? '';
/** Who the email is to → the fill-ins. A store's name goes in {store}; a person's first name in {name}. */
export function emailFill(toName: string | null | undefined, kind?: string | null, store?: string | null): Record<string, string> {
  const isStore = kind === 'store';
  const n = isStore || !toName || /@/.test(toName) ? '' : firstWord(toName);
  return { name: n, store: String(store ?? (isStore ? toName ?? '' : '')).trim(), me: String(getUser()?.firstName ?? '').trim() };
}
export function fillEmail(text: string, f: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => (k === 'store' && !f.store ? 'the store' : String(f[k] ?? '').trim()))
    .replace(/[ \t]{2,}/g, ' ').replace(/ ([,.!?])/g, '$1').replace(/\bHi ,/g, 'Hi,');
}
/** Put a picked template in the box, keeping the signature at the bottom. */
export function withTemplate(current: string, body: string, sig: string): string {
  const keepSig = !!sig && (current.includes(sig) || !current.trim());
  return keepSig ? `${body}\n\n${sig}` : body;
}

/** 📝 Templates ▾ — the menu (+ Edit for admins). */
export function EmailTemplatesButton({ onPick, onEdit }: { onPick: (t: EmailTemplate) => void; onEdit: () => void }) {
  const q = useQuery({ queryKey: emailTplKey, staleTime: 5 * 60_000, queryFn: () => api<{ data: TplData }>('/api/food-donations/email-templates') });
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menu]);
  const d = q.data?.data;
  if (!d) return null;
  return (
    <div ref={ref} className="relative inline-flex items-center gap-2">
      <button type="button" onClick={() => setMenu((m) => !m)} data-email-templates-btn
              className="haptic rounded-full border border-forest bg-forest text-paper px-2.5 py-1 text-[12px] font-bold">📝 Templates ▾</button>
      {d.canEdit && <button type="button" onClick={onEdit} className="text-[11.5px] font-bold text-muted underline">Edit</button>}
      {menu && (
        <div className="absolute top-full left-0 mt-1 z-20 w-[min(340px,85vw)] max-h-[45vh] overflow-y-auto rounded-[12px] border border-line bg-paper shadow-lift py-1" data-email-templates-menu>
          {d.templates.length === 0 && <div className="px-3 py-2 text-[12.5px] text-muted">No templates yet.</div>}
          {d.templates.map((t, i) => (
            <button key={i} type="button" onClick={() => { setMenu(false); onPick(t); }} className="block w-full text-left px-3 py-2 hover:bg-cream/70">
              <div className="text-[13px] font-bold text-ink">{t.name}</div>
              <div className="text-[11.5px] text-muted truncate">{t.subject || t.text}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Admins: add / change / remove the email templates (same style as the text templates). */
export function EmailTemplatesEditor({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const cur = qc.getQueryData<{ data: TplData }>(emailTplKey)?.data?.templates ?? [];
  const [list, setList] = useState<EmailTemplate[]>(cur.map((t) => ({ ...t })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (i: number, p: Partial<EmailTemplate>) => setList((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ data: TplData }>('/api/food-donations/email-templates', { method: 'PUT', body: JSON.stringify({ templates: list }) });
      qc.setQueryData(emailTplKey, r);
      onClose();
    } catch (e: any) { setErr(e?.body?.error || e?.message || "Couldn't save."); }
    finally { setBusy(false); }
  };
  const box = 'w-full rounded-[8px] border border-line bg-paper px-2 py-1 text-[13px]';
  return (
    <div className="space-y-2 max-h-[60vh] overflow-y-auto" data-email-templates-edit>
      <div className="text-[13.5px] font-bold text-ink">📝 Email templates</div>
      <div className="text-[12px] text-muted">Each one has a name, a subject and the message. These words get filled in: <b>{'{name}'}</b> (the person's first name), <b>{'{store}'}</b> (the store) and <b>{'{me}'}</b> (your first name). Your signature goes under it by itself, so you don't need it here.</div>
      {list.map((t, i) => (
        <div key={i} className="rounded-[10px] border border-line p-2 space-y-1">
          <div className="flex gap-2">
            <input value={t.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Name" maxLength={60} className={`${box} flex-1 font-bold`} />
            <button type="button" onClick={() => setList((l) => l.filter((_, j) => j !== i))} className="text-[12px] font-bold text-clay" aria-label="Remove">✕</button>
          </div>
          <input value={t.subject} onChange={(e) => set(i, { subject: e.target.value })} placeholder="Subject" maxLength={250} className={box} />
          <textarea value={t.text} onChange={(e) => set(i, { text: e.target.value })} rows={4} placeholder="Message" className={box} />
        </div>
      ))}
      <button type="button" onClick={() => setList((l) => [...l, { name: '', subject: '', text: 'Hi {name},\n\n' }])} className="text-[12px] font-bold text-forest underline">+ Add a template</button>
      <div className="flex gap-2 items-center">
        <button type="button" disabled={busy} onClick={() => void save()} className="haptic rounded-[10px] bg-forest text-paper px-3 py-1.5 text-[12.5px] font-bold disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={onClose} className="haptic text-[12.5px] font-bold text-muted">Cancel</button>
        {err && <span className="text-[12px] text-clay font-bold">{err}</span>}
      </div>
    </div>
  );
}

/** Open the compose pop-up (optionally filled in with who it goes to). */
export function openNewEmail(to?: { email?: string | null; name?: string | null; kind?: string | null } | null) {
  window.dispatchEvent(new CustomEvent('zlz:new-email', { detail: { email: to?.email ?? '', name: to?.name ?? null, kind: to?.kind ?? null } }));
}

/** ✉️ Email — on driver / store cards that have an email address. (kind 'driver' | 'store' — for the template fill-ins) */
export function EmailButton({ email, name, kind, className }: { email: string | null | undefined; name?: string | null; kind?: string | null; className?: string }) {
  if (!email || !isEmail(String(email)) || !canSendEmail()) return null;
  return <button type="button" data-email-btn onClick={(e) => { e.stopPropagation(); openNewEmail({ email, name, kind }); }}
                 className={className ?? 'haptic shrink-0 inline-flex items-center gap-1 rounded-[10px] border border-forest/40 bg-paper text-forest px-3 py-1.5 text-[13px] font-bold'}>✉️ Email</button>;
}

export function NewEmailPopup() {
  const [open, setOpen] = useState<{ email: string; name: string | null; kind: string | null; n: number } | null>(null);
  useEffect(() => {
    let n = 0;
    const h = (e: Event) => { const d = (e as CustomEvent).detail ?? {}; setOpen({ email: String(d.email ?? ''), name: d.name ?? null, kind: d.kind ?? null, n: ++n }); };
    window.addEventListener('zlz:new-email', h);
    return () => window.removeEventListener('zlz:new-email', h);
  }, []);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[2200] flex items-end sm:items-center justify-center bg-ink/30 p-0 sm:p-4" onClick={() => setOpen(null)}>
      <div className="w-full sm:max-w-[560px] max-h-[100dvh] overflow-y-auto rounded-t-[18px] sm:rounded-[18px] bg-paper p-4 shadow-xl" onClick={(e) => e.stopPropagation()} data-new-email>
        <Compose key={open.n} toEmail={open.email} toName={open.name} toKind={open.kind} onClose={() => setOpen(null)} />
      </div>
    </div>, document.body);
}

function Compose({ toEmail, toName, toKind, onClose }: { toEmail: string; toName: string | null; toKind: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [to, setTo] = useState(toEmail);
  const [name, setName] = useState<string | null>(toName);
  const [kind, setKind] = useState<string | null>(toKind);
  const [search, setSearch] = useState('');
  const [typed, setTyped] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<'sig' | 'tpl' | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const t = setTimeout(() => setSearch(typed.trim()), 250); return () => clearTimeout(t); }, [typed]);
  const found = useQuery({ queryKey: ['email-contacts', search], enabled: search.length >= 2 && !isEmail(search), staleTime: 60_000,
    queryFn: () => api<{ data: Contact[] }>(`/api/food-donations/email-contacts?q=${encodeURIComponent(search)}`) });
  // Nov 3 client: your signature sits at the bottom of the message — see it, change it or delete it.
  const { sig: mySig, ready: sigReady } = useMySignature();
  const sig = mySig.email;
  const started = useRef(false);
  useEffect(() => {
    if (!sigReady || started.current) return;
    started.current = true;
    if (sig) setText((t) => (t.trim() ? t : `\n\n${sig}`));
  }, [sigReady]); // eslint-disable-line
  const body = withoutSignature(text, sig);
  const ready = isEmail(to) && subject.trim() && body && !busy;
  const send = async () => {
    if (!ready) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ data: { status: string; error: string | null } }>('/api/food-donations/new-email', { method: 'POST',
        body: JSON.stringify({ to: to.trim(), toName: name, subject: subject.trim(), text }) });
      qc.invalidateQueries({ queryKey: ['food-donations-sent'] });
      if (r.data.status === 'sent') { setMsg({ ok: true, text: 'Sent! ✓ It went out from the dispatch email.' }); setText(sig ? `\n\n${sig}` : ''); setSubject(''); }
      else setMsg({ ok: true, text: r.data.error === 'Test site: not sent.' ? 'This is the test site, so it’s saved under Sent but not really sent.' : (r.data.error || 'Saved, not sent.') });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.body?.error || e?.message || 'The email didn’t send.' });
      qc.invalidateQueries({ queryKey: ['food-donations-sent'] });
    } finally { setBusy(false); }
  };
  const pickTemplate = (t: EmailTemplate) => {
    const f = emailFill(name, kind);
    setSubject(fillEmail(t.subject, f));
    setText((cur) => withTemplate(cur, fillEmail(t.text, f), sig));
    setMsg(null);
    setTimeout(() => box.current?.focus(), 0);
  };
  const input = 'w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[14px] text-ink';
  const list = found.data?.data ?? [];
  if (editing === 'tpl') return <EmailTemplatesEditor onClose={() => setEditing(null)} />;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 border-b border-line pb-2">
        <h3 className="font-bold text-[16px] text-ink mr-auto">✉️ New email</h3>
        <button type="button" onClick={onClose} className="text-[13px] font-bold text-forest">✕ Close</button>
      </div>
      <p className="text-[12px] text-muted">Sent from the dispatch email (the one connected in Food Donations).</p>
      <div className="space-y-1">
        <span className="text-[12.5px] font-bold text-ink">To</span>
        {to && isEmail(to) && !typed ? (
          <div className="flex items-center gap-2 rounded-[10px] border border-line bg-sage/30 px-3 py-2 text-[14px]">
            <span className="font-bold text-ink truncate">{name || to}</span>
            {name && <span className="text-muted truncate">{to}</span>}
            <button type="button" onClick={() => { setTo(''); setName(null); setKind(null); }} className="ml-auto text-[12.5px] font-bold text-muted underline">Change</button>
          </div>
        ) : (
          <div className="relative">
            <input className={input} autoFocus value={typed} placeholder="Type an email, or a driver / store / donor name"
                   onChange={(e) => { const v = e.target.value; setTyped(v); setTo(isEmail(v) ? v.trim() : ''); setName(null); setKind(null); }} />
            {typed.trim().length >= 2 && !isEmail(typed) && (
              <div className="absolute z-10 left-0 right-0 mt-1 rounded-[10px] border border-line bg-paper shadow-lg max-h-60 overflow-auto">
                {found.isLoading ? <div className="px-3 py-2 text-[13px] text-muted">Searching…</div>
                  : list.length === 0 ? <div className="px-3 py-2 text-[13px] text-muted">No one with an email by that name.</div>
                  : list.map((c) => (
                    <button key={`${c.kind}|${c.email}`} type="button" onClick={() => { setTo(c.email); setName(c.name); setKind(c.kind); setTyped(''); }}
                            className="w-full text-left px-3 py-2 hover:bg-cream/60 flex items-center gap-2 text-[13.5px]">
                      <span className="font-bold text-ink truncate">{c.name || c.email}</span>
                      <span className="text-[11px] rounded-full border border-line px-1.5 text-muted">{KIND[c.kind] ?? c.kind}</span>
                      <span className="ml-auto text-muted truncate">{c.email}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
      <EmailTemplatesButton onPick={pickTemplate} onEdit={() => setEditing('tpl')} />
      <label className="block space-y-1">
        <span className="text-[12.5px] font-bold text-ink">Subject</span>
        <input className={input} value={subject} maxLength={250} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-[12.5px] font-bold text-ink">Message</span>
        <textarea ref={box} className={input} rows={9} value={text} maxLength={5000} data-email-message
                  onFocus={(e) => { if (sig && text === `\n\n${sig}`) { const el = e.currentTarget; setTimeout(() => el.setSelectionRange(0, 0), 0); } }}
                  onChange={(e) => { setText(e.target.value); setMsg(null); }} />
      </label>
      {editing === 'sig' ? (
        <SignatureEditor onClose={() => setEditing(null)} onSaved={(o, n) => setText((t) => (t.trim() ? swapSignature(t, o.email, n.email) : (n.email ? `\n\n${n.email}` : '')))} />
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
          <span>{sig ? 'Your signature is at the bottom of the message. Change it or delete it if you like.' : 'No signature.'}</span>
          <EditSignatureLink onClick={() => setEditing('sig')} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!ready} onClick={() => void send()}
                className="haptic rounded-full bg-forest text-paper border border-forest px-4 py-1.5 text-[13px] font-bold disabled:opacity-50">
          {busy ? 'Sending…' : 'Send'}
        </button>
        {msg && <span role="status" className={`text-[12.5px] font-bold ${msg.ok ? 'text-forest' : 'text-clay'}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
