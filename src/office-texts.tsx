/**
 * Nov 2 client: "send someone a message here or there … integrate it". Texts from / to the OFFICE number
 * (Reliable), separate from the driver pickup texts (current texting service). Dispatchers → Texts:
 * conversations (newest first), one thread, a reply box. 💬 Text buttons (driver card, call rows) open the
 * thread for that number. API: /api/pbx/sms/* (routes/pbx.ts). Read every 20 s while open.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getUser } from './api';
import { useMySignature, SignatureEditor, EditSignatureLink, swapSignature } from './my-signature'; // Nov 3 client: My signature

type Conv = { cid: number; phone: string | null; who: string; last: string; at: string | null; unread: number; fromUs: boolean };
type Msg = { id: number; text: string; at: string | null; out: boolean; status: string; by?: string | null }; // Nov 3 client: by = who sent it

/** Nov 3 client: "Make a pickup" from a text — the new-pickup form, filled from the conversation (the office
 *  checks it, then creates it). Opened by CoordinatorPortal (event 'zlz:new-pickup-prefill'). */
const ADDRESS_RE = /\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s){0,4}(?:st|street|rd|road|ave|avenue|ln|lane|dr|drive|ct|court|blvd|way|pl|place|ter|terrace|cir|circle|hwy|highway|pkwy|parkway|tpke|turnpike)\b\.?(?:[ ,]+(?:apt|unit|#)\s*\w+)?(?:,?\s*(?:monsey|spring valley|suffern|airmont|pomona|new city|wesley hills|chestnut ridge|nanuet|new square|kaser|ramapo)\b)?/i;
export function pickupPrefillFromText(phone: string, who: string, inbound: string[]) {
  const all = inbound.join('\n').trim();
  const address = ADDRESS_RE.exec(all)?.[0]?.replace(/\s+/g, ' ').trim() ?? '';
  const isNumber = /^\(?\d{3}\)?[\s-]?\d{3}-?\d{4}$/.test(who.trim());
  const name = isNumber ? '' : who.replace(/\s*\((store|donor)\)$/i, '').replace(/\s+#\d+$/, '').trim();
  return {
    suppliers: /\(store\)$/i.test(who) ? name : '',
    donor_name: /\(store\)$/i.test(who) ? name : '',
    contact_name: /\(store\)$/i.test(who) ? '' : name,
    contact_phone: phone,
    pickup_address: address,
    food_description: all.slice(0, 300),
    notes: `From a text to the office number: "${all.replace(/\s+/g, ' ').slice(0, 300)}"`,
    slots_capacity: 1,
  };
}

// ---- Nov 3 client: TEXT TEMPLATES — named messages with fill-ins ({name} {store} {time} {driver} {me}, and on
// pickups {address} {contact}). Filled from that number's pickup today (blank when we don't know), editable before Send.
export type TextTemplate = { name: string; text: string; use?: string };
export type Fill = { name: string; store: string; time: string; driver: string; address: string; contact: string };
export type FillData = { fill: Fill; pickupId: number | null; status: string | null;
  store: { phone: string; name: string; first: string } | null; driver: { phone: string; name: string; first: string } | null };
type QuickData = { replies: string[]; templates?: TextTemplate[]; canEdit: boolean };
const myFirst = () => String(getUser()?.firstName ?? '').trim() || 'Office';
/** Put the fill-ins in; unknown ones are left blank and the spaces tidied. */
export function fillTemplate(text: string, f: Partial<Fill>): string {
  const vals: Record<string, string> = { ...f, me: myFirst() } as any;
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(vals[k] ?? '').trim())
    .replace(/[ \t]{2,}/g, ' ').replace(/ ([,.!?])/g, '$1').replace(/,\s*,/g, ',').replace(/Contact: ?\./, '').replace(/^Hi ,/, 'Hi,').trim();
}
export const quickQueryKey = ['office-text-quick'];
export const loadQuick = () => api<{ data: QuickData }>('/api/pbx/sms/quick-replies');

/** Nov 3 client: quick replies above the box — a short list; admins edit it (Edit). + 📝 Templates menu. */
function QuickReplies({ onPick, onTemplate, phone }: { onPick: (t: string) => void; onTemplate: (t: string) => void; phone: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: quickQueryKey, staleTime: 5 * 60_000, queryFn: loadQuick });
  const [edit, setEdit] = useState<string | null>(null);
  const [tpls, setTpls] = useState<TextTemplate[]>([]);
  const [menu, setMenu] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const d = q.data?.data;
  if (!d) return null;
  const templates = d.templates ?? [];
  const pickTemplate = async (t: TextTemplate) => {
    setMenu(false);
    let fill: Partial<Fill> = {};
    try { fill = (await qc.fetchQuery({ queryKey: ['text-fill', phone], staleTime: 60_000, queryFn: () => api<{ data: FillData }>(`/api/pbx/sms/fill?phone=${phone}`) })).data.fill; } catch { /* blanks */ }
    onTemplate(fillTemplate(t.text, fill));
  };
  const save = async () => {
    setErr(null);
    try {
      const replies = String(edit ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
      const r = await api<{ data: QuickData }>('/api/admin/pbx/sms/quick-replies', { method: 'PUT', body: JSON.stringify({ replies }) });
      const t = await api<{ data: { templates: TextTemplate[] } }>('/api/admin/pbx/sms/templates', { method: 'PUT', body: JSON.stringify({ templates: tpls }) });
      qc.setQueryData(quickQueryKey, { data: { ...r.data, templates: t.data.templates } });
      setEdit(null);
    } catch (e: any) { setErr(e?.body?.error || e?.message || "Couldn't save."); }
  };
  if (edit !== null) return (
    <div className="border-t border-line pt-2 space-y-1.5 max-h-[50vh] overflow-y-auto" data-templates-edit>
      <div className="text-[12px] text-muted">Quick replies — one per line (up to 12).</div>
      <textarea value={edit} onChange={(e) => setEdit(e.target.value)} rows={4} className="w-full rounded-[10px] border border-line bg-paper px-2 py-1.5 text-[13px]" />
      <div className="text-[12px] text-muted pt-1">Templates — a name and the message. These words get filled in: <b>{'{name}'}</b> (the person), <b>{'{store}'}</b>, <b>{'{time}'}</b>, <b>{'{driver}'}</b>, <b>{'{address}'}</b>, <b>{'{contact}'}</b> and <b>{'{me}'}</b> (your first name).</div>
      {tpls.map((t, i) => (
        <div key={i} className="rounded-[10px] border border-line p-2 space-y-1">
          <div className="flex gap-2">
            <input value={t.name} onChange={(e) => setTpls((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Name"
                   className="flex-1 rounded-[8px] border border-line bg-paper px-2 py-1 text-[13px] font-bold" />
            <button type="button" onClick={() => setTpls((l) => l.filter((_, j) => j !== i))} className="text-[12px] font-bold text-clay" aria-label="Remove">✕</button>
          </div>
          <textarea value={t.text} onChange={(e) => setTpls((l) => l.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} rows={2}
                    className="w-full rounded-[8px] border border-line bg-paper px-2 py-1 text-[13px]" />
        </div>
      ))}
      <button type="button" onClick={() => setTpls((l) => [...l, { name: '', text: "Hi {name}, … – {me}, Zeh L'Zeh" }])} className="text-[12px] font-bold text-forest underline">+ Add a template</button>
      <div className="flex gap-2 items-center">
        <button type="button" onClick={() => void save()} className="haptic rounded-[10px] bg-forest text-paper px-3 py-1.5 text-[12.5px] font-bold">Save</button>
        <button type="button" onClick={() => setEdit(null)} className="haptic text-[12.5px] font-bold text-muted">Cancel</button>
        {err && <span className="text-[12px] text-clay font-bold">{err}</span>}
      </div>
    </div>
  );
  return (
    <div className="relative flex flex-wrap items-center gap-1.5 border-t border-line pt-2" data-quick-replies>
      {templates.length > 0 && (
        <button type="button" onClick={() => setMenu((m) => !m)} data-templates-btn
                className="haptic rounded-full border border-forest bg-forest text-paper px-2.5 py-1 text-[12px] font-bold">📝 Templates ▾</button>
      )}
      {menu && (
        <div className="absolute bottom-full left-0 mb-1 z-10 w-[min(320px,90vw)] max-h-[45vh] overflow-y-auto rounded-[12px] border border-line bg-paper shadow-lift py-1" data-templates-menu>
          {templates.map((t, i) => (
            <button key={i} type="button" onClick={() => void pickTemplate(t)} className="block w-full text-left px-3 py-2 hover:bg-cream/70">
              <div className="text-[13px] font-bold text-ink">{t.name}</div>
              <div className="text-[11.5px] text-muted truncate">{t.text}</div>
            </button>
          ))}
        </div>
      )}
      {d.replies.map((t) => (
        <button key={t} type="button" onClick={() => onPick(t)}
                className="haptic rounded-full border border-forest/40 bg-sage/40 text-forest px-2.5 py-1 text-[12px] font-bold max-w-[220px] truncate">{t}</button>
      ))}
      {d.canEdit && <button type="button" onClick={() => { setEdit(d.replies.join('\n')); setTpls(templates.map((t) => ({ ...t }))); }}className="text-[11.5px] font-bold text-muted underline ml-1">Edit</button>}
    </div>
  );
}
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const pretty = (p: string) => (/^\d{10}$/.test(p) ? `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}` : p);

/** Open the office-texts thread for a number.
 * Nov 3 client ("when I click to send a message … a delay till it opens"): opens as a pop-up right where you
 * are (OfficeTextPopup, mounted once in the portal) instead of switching to Dispatchers → Texts first. */
type PopNext = { phone: string; who: string | null; draft: string | null };
export function openOfficeText(phone: string | null | undefined, who?: string | null, draft?: string | null, next?: PopNext | null) { // Nov 3 client: + draft (a ready message — Find a driver); nothing is sent until Send. + next: opens after this one closes (Text a whole pickup → Both)
  const p = String(phone ?? '').replace(/\D/g, '').slice(-10);
  if (p.length !== 10) return;
  window.dispatchEvent(new CustomEvent('zlz:office-text-pop', { detail: { phone: p, who: who ?? null, draft: draft ?? null, next: next ?? null } }));
}

/** The 💬 pop-up: one conversation over whatever screen you're on. */
export function OfficeTextPopup() {
  const [open, setOpen] = useState<{ phone: string; who: string; draft: string | null; next: PopNext | null } | null>(null);
  const closePop = () => setOpen((cur) => (cur?.next ? { phone: cur.next.phone, who: cur.next.who || pretty(cur.next.phone), draft: cur.next.draft, next: null } : null));
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail; if (d?.phone) setOpen({ phone: d.phone, who: d.who || pretty(d.phone), draft: d.draft ?? null, next: d.next ?? null }); };
    const close = () => setOpen(null); // Nov 3 client: "Make a pickup" opens the form in front
    window.addEventListener('zlz:office-text-pop', h);
    window.addEventListener('zlz:new-pickup-prefill', close);
    return () => { window.removeEventListener('zlz:office-text-pop', h); window.removeEventListener('zlz:new-pickup-prefill', close); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') closePop(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[2200] flex items-end sm:items-center justify-center bg-ink/30 p-0 sm:p-4" onClick={closePop}>
      <div className="w-full sm:max-w-[520px] rounded-t-[18px] sm:rounded-[18px] bg-paper p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {open.next && <div className="mb-2 rounded-[10px] bg-sage/60 px-3 py-1.5 text-[12.5px] font-bold text-forest" data-text-next>Text 1 of 2. When you close this one, the text to {open.next.who || pretty(open.next.phone)} opens.</div>}
        <Thread key={`${open.phone}|${open.draft ?? ''}`} phone={open.phone} cid={null} who={open.who} draft={open.draft} onBack={closePop} backLabel={open.next ? 'Next →' : '✕ Close'} autoFocus />
      </div>
    </div>, document.body);
}

export function TextButton({ phone, className }: { phone: string | null | undefined; className?: string }) {
  if (!phone) return null;
  return <button type="button" onClick={(e) => { e.stopPropagation(); openOfficeText(phone); }}
                 className={className ?? 'haptic shrink-0 inline-flex items-center gap-1 rounded-[10px] border border-forest/40 bg-paper text-forest px-3 py-1.5 text-[13px] font-bold'}>💬 Text</button>;
}

type Pending = { tmp: number; text: string; at: string; state: 'sending' | 'failed'; error?: string };
let tmpSeq = 0;
function Thread({ phone, cid, who, onBack, backLabel, autoFocus, draft }: { phone: string; cid: number | null; who: string; onBack: () => void; backLabel?: string; autoFocus?: boolean; draft?: string | null }) {
  const qc = useQueryClient();
  const key = ['office-text-thread', phone, cid];
  const q = useQuery({ queryKey: key, refetchInterval: 20_000,
    queryFn: () => api<{ data: { cid: number | null; messages: Msg[] } }>(`/api/pbx/sms/thread?phone=${phone}${cid ? `&cid=${cid}` : ''}`) });
  const [text, setText] = useState(draft ?? '');
  const [err, setErr] = useState<string | null>(null);
  // Nov 3 client ("sending a message … seems slow"): the text shows in the thread the moment you press Send,
  // marked "sending…"; Reliable takes ~1 s, then it turns "sent" (or "didn't send — tap to try again").
  const [pending, setPending] = useState<Pending[]>([]);
  const [sent, setSent] = useState<Msg[]>([]); // sent from this screen; kept until Reliable's list has them
  const end = useRef<HTMLDivElement>(null);
  const sendOne = async (pm: Pending) => {
    try {
      const r = await api<{ data: { sandboxed: boolean; id: number | null; status: string } }>('/api/pbx/sms/send', { method: 'POST', body: JSON.stringify({ to: phone, text: pm.text }) });
      const u = getUser();
      const me = `${String(u?.firstName ?? '').trim()}${u?.lastName ? ` ${String(u.lastName).trim().slice(0, 1)}.` : ''}`.trim() || null;
      const sent: Msg = { id: r.data.id ?? Date.now(), text: pm.text, at: new Date().toISOString(), out: true, status: r.data.status || 'sent', by: me };
      setSent((ss) => [...ss, sent]);
      setPending((ps) => ps.filter((x) => x.tmp !== pm.tmp));
      setErr(r.data.sandboxed ? 'Test site: sent to the sandbox phone.' : null);
      qc.invalidateQueries({ queryKey: ['office-texts'] });
    } catch (e: any) {
      setPending((ps) => ps.map((x) => (x.tmp === pm.tmp ? { ...x, state: 'failed', error: e?.body?.error || e?.message || 'The text didn’t send.' } : x)));
    }
  };
  const submit = () => {
    const t = text.trim();
    if (!t || t === sig) return;
    const pm: Pending = { tmp: ++tmpSeq, text: t, at: new Date().toISOString(), state: 'sending' };
    setPending((ps) => [...ps, pm]);
    setText('');
    setErr(null);
    void sendOne(pm);
  };
  const retry = (pm: Pending) => { const again = { ...pm, state: 'sending' as const, error: undefined }; setPending((ps) => ps.map((x) => (x.tmp === pm.tmp ? again : x))); void sendOne(again); };
  const server = q.data?.data?.messages ?? [];
  const have = new Set(server.map((m) => m.id));
  const msgs = [...server, ...sent.filter((m) => !have.has(m.id))];
  // Nov 3 client: the FIRST text of the day to someone carries a sign-off so they know it's a real person
  // from ZLZ. It's put in the box ready to see — delete it to send without.
  const box = useRef<HTMLTextAreaElement>(null);
  const signed = useRef(false);
  // Nov 3 client: the sign-off is the person's own "My signature" (text version; empty = none). Edit my signature below.
  const { sig: mySig, ready: sigReady } = useMySignature();
  const sig = mySig.text;
  const hasSig = (t: string) => !!sig && t.includes(sig);
  const [editSig, setEditSig] = useState(false);
  const nyDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York' }) : '');
  const today = nyDay(new Date().toISOString());
  const textedToday = msgs.some((m) => m.out && nyDay(m.at) === today);
  useEffect(() => {
    if (signed.current || q.isLoading || !sigReady || textedToday) return;
    signed.current = true;
    if (!sig) return;
    setText((t) => (t ? (draft && t === draft && !t.includes(sig) && !/Zeh L'Zeh\s*$/.test(t) ? `${t}\n\n${sig}` : t) : `\n\n${sig}`)); // Nov 3: a template already signs off // Nov 3: a ready message keeps its words; the name goes under it
    if (!draft) setTimeout(() => { box.current?.setSelectionRange(0, 0); }, 0);
  }, [q.isLoading, sigReady, textedToday]); // eslint-disable-line
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, pending.length]);
  useEffect(() => { if (!sent.length) return; const t = setTimeout(() => qc.invalidateQueries({ queryKey: key }), 4000); return () => clearTimeout(t); }, [sent.length]); // eslint-disable-line
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b border-line pb-2">
        <button type="button" onClick={onBack} className="text-[13px] font-bold text-forest">{backLabel ?? '← All texts'}</button>
        <div className="font-bold text-ink ml-2">{who}</div>
        <div className="text-[12px] text-muted">{pretty(phone)}</div>
        {/* Nov 3 client: make a pickup from this text (the form opens filled in; nothing is saved until you press Save). */}
        <button type="button" data-make-pickup
                onClick={() => window.dispatchEvent(new CustomEvent('zlz:new-pickup-prefill', { detail: {
                  title: `New pickup from ${who}'s text`,
                  prefill: pickupPrefillFromText(phone, who, msgs.filter((m) => !m.out).slice(-3).map((m) => m.text)) } }))}
                className="haptic ml-auto rounded-[10px] border border-forest/40 bg-paper text-forest px-2.5 py-1 text-[12px] font-bold">🚚 Make a pickup</button>
      </div>
      <div className="flex-1 overflow-y-auto py-3 space-y-2 min-h-[240px] max-h-[55vh]">
        {q.isLoading && <div className="text-[13px] text-muted">Loading…</div>}
        {!q.isLoading && msgs.length === 0 && pending.length === 0 && <div className="text-[13px] text-muted">No texts with this number yet. Write the first one below.</div>}
        {msgs.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.out ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[75%] rounded-[14px] px-3 py-2 ${m.out ? 'bg-forest text-paper' : 'bg-cream text-ink border border-line'}`}>
              <div className="whitespace-pre-wrap text-[14px]">{m.text}</div>
              <div className={`text-[10.5px] mt-0.5 ${m.out ? 'text-paper/70' : 'text-muted'}`}>{when(m.at)}{m.out && m.status ? ` · ${m.status.replace(/^message-/, '')}` : ''}</div>
            </div>
            {m.out && m.by && <div className="text-[10.5px] text-muted font-bold mt-0.5 pr-1" data-sent-by>{m.by}</div>}
          </div>
        ))}
        {pending.map((pm) => (
          <div key={`p${pm.tmp}`} className="flex justify-end">
            <button type="button" disabled={pm.state === 'sending'} onClick={() => retry(pm)}
                    className={`max-w-[75%] text-left rounded-[14px] px-3 py-2 ${pm.state === 'failed' ? 'bg-clay/10 text-ink border border-clay' : 'bg-forest/80 text-paper'}`}>
              <div className="whitespace-pre-wrap text-[14px]">{pm.text}</div>
              <div className={`text-[10.5px] mt-0.5 font-bold ${pm.state === 'failed' ? 'text-clay' : 'text-paper/80'}`}>
                {pm.state === 'sending' ? 'sending…' : `didn’t send — tap to try again${pm.error ? ` (${pm.error})` : ''}`}
              </div>
            </button>
          </div>
        ))}
        <div ref={end} />
      </div>
      <QuickReplies phone={phone} onTemplate={(t) => { setText(t); setTimeout(() => box.current?.focus(), 0); }} onPick={(t) => {
        // Nov 3 client: a quick reply goes in the box (above your name, if the sign-off is there) — edit, then Send.
        setText((cur) => {
          const body = hasSig(cur) ? cur.slice(0, cur.indexOf(sig)).trim() : cur.trim();
          const next = body ? `${body} ${t}` : t;
          return hasSig(cur) ? `${next}\n\n${sig}` : next;
        });
        setTimeout(() => box.current?.focus(), 0);
      }} />
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex gap-2 pt-2">
        <textarea ref={box} value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus={autoFocus}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} placeholder="Text from the office number (845) 363-5323…"
                  className="flex-1 rounded-[12px] border border-line bg-paper px-3 py-2 text-[14px]" />
        <button type="submit" disabled={!text.trim()} className="haptic self-end rounded-[12px] bg-forest text-paper px-4 py-2.5 text-[14px] font-bold disabled:opacity-40">
          Send
        </button>
      </form>
      {editSig ? (
        <div className="mt-2"><SignatureEditor onClose={() => setEditSig(false)} onSaved={(o, n) => setText((t) => swapSignature(t, o.text, n.text))} /></div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted mt-1">
          {hasSig(text) && <span>First text today, so your signature is added at the end. Delete it to send without.</span>}
          <EditSignatureLink onClick={() => setEditSig(true)} />
        </div>
      )}
      {err && <div className="text-[12.5px] font-bold text-clay mt-1">{err}</div>}
    </div>
  );
}

export function OfficeTextsPanel() {
  const [open, setOpen] = useState<{ phone: string; cid: number | null; who: string } | null>(null);
  const [search, setSearch] = useState('');
  const [newTo, setNewTo] = useState('');
  const q = useQuery({ queryKey: ['office-texts', search], refetchInterval: 60_000, enabled: !open, // Nov 3 client: speed (was 20 s)
    queryFn: () => api<{ data: Conv[] }>(`/api/pbx/sms/inbox${search ? `?search=${encodeURIComponent(search)}` : ''}`) });
  const list = q.data?.data ?? [];
  return (
    <section className="rounded-[18px] border border-line bg-paper p-5">
      {open ? <Thread phone={open.phone} cid={open.cid} who={open.who} onBack={() => setOpen(null)} /> : (<>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h3 className="font-display font-semibold text-[17px] text-ink mr-auto">💬 Texts — office number <span className="font-body font-normal text-[14px] text-muted">(845) 363-5323</span></h3>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="rounded-[10px] border border-line bg-paper px-3 py-1.5 text-[13px] w-[160px]" />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); const d = newTo.replace(/\D/g, '').slice(-10); if (d.length === 10) { setOpen({ phone: d, cid: null, who: pretty(d) }); setNewTo(''); } }}
              className="flex gap-2 mb-3">
          <input value={newTo} onChange={(e) => setNewTo(e.target.value)} inputMode="tel" placeholder="New text to a number…" className="flex-1 rounded-[10px] border border-line bg-paper px-3 py-2 text-[14px]" />
          <button type="submit" disabled={newTo.replace(/\D/g, '').length < 10} className="haptic rounded-[10px] bg-forest text-paper px-3 py-2 text-[13px] font-bold disabled:opacity-40">Write</button>
        </form>
        {q.isLoading && <div className="text-[13px] text-muted">Loading…</div>}
        {q.isError && <div className="text-[13px] text-clay font-bold">{(q.error as any)?.body?.error || "Couldn't load the texts."}</div>}
        {!q.isLoading && !q.isError && list.length === 0 && <div className="text-[13px] text-muted">No texts yet.</div>}
        <div className="divide-y divide-line">
          {list.map((c) => (
            <button key={c.cid} type="button" onClick={() => c.phone && setOpen({ phone: c.phone, cid: c.cid, who: c.who })}
                    className="w-full text-left py-2.5 flex items-start gap-3 hover:bg-cream/50 px-1 rounded-[8px]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="font-bold text-ink truncate">{c.who}</span>
                  {c.unread > 0 && <span className="rounded-full bg-clay text-paper text-[11px] font-bold px-1.5">{c.unread}</span>}</div>
                <div className="text-[13px] text-muted truncate">{c.fromUs ? 'You: ' : ''}{c.last}</div>
              </div>
              <span className="text-[11.5px] text-muted shrink-0">{when(c.at)}</span>
            </button>
          ))}
        </div>
      </>)}
    </section>
  );
}
