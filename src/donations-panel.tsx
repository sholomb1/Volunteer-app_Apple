// Oct 7 client: Food Donations. People email donate@zehlzeh.org to give food; vp-api reads
// that mailbox every minute and each email shows up here for the dispatchers to follow up.
// Oct 18 client: admins connect the mailbox here (⚙️ Email connection): email + Google app
// password (saved encrypted, never sent back), Test connection, Save, Disconnect.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, API_BASE, getUser } from './api';
import { cx } from './design';
import { QuickPickupModal } from './portal-sections'; // Nov 1 client: make a pickup from a donation email

type Status = 'new' | 'contacted' | 'pickup_created' | 'closed';
type Row = {
  id: number; from_name: string | null; from_email: string | null; subject: string; snippet: string;
  received_at: string; status: Status; file_count: number;
};
type FileRow = { id: number; filename: string; content_type: string; url: string };
type ReplyRow = { id: number; at: string; text: string; status: 'sent' | 'held' | 'failed'; error: string | null; by_name: string | null };
type Suggestion = { contactName: string; contactPhone: string; foodDescription: string; storeName: string | null; address: string | null };
type Detail = Omit<Row, 'snippet' | 'file_count'> & { body_text: string; notes: string | null; files: FileRow[]; replies?: ReplyRow[]; suggestion?: Suggestion };
type ListData = {
  connected: boolean; address: string; lastCheck: string | null; lastError: string | null;
  user?: string | null; source?: 'env' | 'site' | 'none'; lastOk?: string | null;
  counts: Partial<Record<Status, number>>; rows: Row[];
};

const STATUS_LABEL: Record<Status, string> = { new: 'New', contacted: 'Contacted', pickup_created: 'Pickup created', closed: 'Closed' };
const STATUS_TONE: Record<Status, string> = {
  new: 'bg-clay/10 text-clay border-clay/30',
  contacted: 'bg-ink/5 text-ink border-line',
  pickup_created: 'bg-forest/10 text-forest border-forest/30',
  closed: 'bg-paper text-muted border-line',
};
const VIEWS: { key: string; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'pickup_created', label: 'Pickup created' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
];
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
const fileUrl = (u: string) => API_BASE.replace(/\/$/, '') + u;
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
const ADMIN_ROLES = ['admin', 'staff', 'coordinator']; // = ADMIN_ONLY_ROLES on the server

export function DonationsPanel({ canEdit }: { canEdit: boolean }) {
  const [view, setView] = useState('open');
  const [openId, setOpenId] = useState<number | null>(null);
  const q = useQuery({
    queryKey: ['food-donations', view],
    queryFn: () => api<{ data: ListData }>(`/api/food-donations?view=${view}`),
    refetchInterval: 60_000,
  });
  const d = q.data?.data;
  const openCount = (d?.counts.new ?? 0) + (d?.counts.contacted ?? 0);
  const isAdmin = ADMIN_ROLES.includes(String(getUser()?.role ?? '').toLowerCase());
  const [showConn, setShowConn] = useState(false);

  return (
    <div className="max-w-3xl space-y-4">
      {(d || isAdmin) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12.5px] text-muted">
            {d?.connected && (
              <>Connected to <span className="font-bold text-ink">{d.user || d.address}</span>
                {d.lastCheck ? ` · last checked ${clock(d.lastCheck)}` : ' · checking…'}
                {d.lastError ? <span className="text-clay font-bold"> · ✗</span> : d.lastOk ? <span className="text-forest font-bold"> · ✓</span> : null}</>
            )}
          </span>
          {isAdmin && (
            <button type="button" onClick={() => setShowConn((v) => !v)}
                    className={cx('px-3 py-1.5 rounded-full text-[12.5px] font-bold border haptic',
                      showConn ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line')}>
              ⚙️ Email connection
            </button>
          )}
        </div>
      )}
      {showConn && isAdmin && <ConnectionBox onClose={() => setShowConn(false)} />}
      {d && !d.connected && (
        <p className="rounded-[12px] border border-clay/30 bg-clay/10 px-4 py-2.5 text-[13px] text-clay font-semibold">
          {d.lastError
            ? <>The donation email isn’t connected: {d.lastError}</>
            : <>The donation email isn’t connected yet. Once {d.address} is set up, emails people send there will show up here automatically.</>}
          {isAdmin && !showConn && ' Tap ⚙️ Email connection to connect it.'}
        </p>
      )}
      {d?.connected && d.lastError && (
        <p className="rounded-[12px] border border-clay/30 bg-clay/10 px-4 py-2.5 text-[13px] text-clay font-semibold">
          Couldn’t check {d.user || d.address} the last time: {d.lastError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button key={v.key} type="button" onClick={() => { setView(v.key); setOpenId(null); }}
                  className={cx('px-3 py-1.5 rounded-full text-[12.5px] font-bold border haptic',
                    view === v.key ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line')}>
            {v.label}{v.key === 'open' && openCount > 0 ? ` (${openCount})` : ''}
          </button>
        ))}
      </div>
      <section className="rounded-[14px] border border-line bg-paper">
        {q.isLoading ? (
          <p className="px-4 py-6 text-[13px] text-muted">Loading…</p>
        ) : q.isError ? (
          <p className="px-4 py-6 text-[13px] text-clay">Couldn’t load donations. Try again in a moment.</p>
        ) : !d?.rows.length ? (
          <p className="px-4 py-6 text-[13px] text-muted">{view === 'open' ? 'No open donations right now.' : 'Nothing here.'}</p>
        ) : (
          <ul>
            {d.rows.map((r, i) => (
              <li key={r.id} className={cx(i > 0 && 'border-t border-line')}>
                <button type="button" className="w-full text-left px-4 py-3" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-[14px] text-ink truncate">{r.from_name || r.from_email || 'Unknown sender'}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="text-[13.5px] text-ink truncate">{r.subject || '(no subject)'}</div>
                  <div className="text-[12px] text-muted truncate">
                    {when(r.received_at)}
                    {r.file_count > 0 ? ` · ${r.file_count} ${r.file_count === 1 ? 'attachment' : 'attachments'}` : ''}
                    {r.snippet ? ` · ${r.snippet}` : ''}
                  </div>
                </button>
                {openId === r.id && <DonationDetail id={r.id} canEdit={canEdit} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type Conn = {
  source: 'env' | 'site' | 'none'; editable: boolean; user: string | null; address: string;
  savedAddress: string | null; passHint: string | null; problem: string | null;
  lastCheck: string | null; lastOk: string | null; lastError: string | null;
};
type TestResult = { ok: true; count: number | null } | { ok: false; reason: string };

// Oct 18 client: "Do you have a way that I can log on to it from the site?" — admins only.
function ConnectionBox({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['food-donations-connection'], queryFn: () => api<{ data: Conn }>('/api/food-donations/connection') });
  const c = q.data?.data;
  const [user, setUser] = useState<string | null>(null);       // null = not typed in yet
  const [address, setAddress] = useState<string | null>(null);
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const userVal = user ?? c?.user ?? '';
  const addrVal = address ?? c?.savedAddress ?? '';
  const errText = (e: unknown) => (e as Error)?.message || 'Something went wrong. Try again.';
  const done = (data: Conn, text: string) => {
    qc.setQueryData(['food-donations-connection'], { data });
    qc.invalidateQueries({ queryKey: ['food-donations'] });
    setUser(null); setAddress(null); setPass('');
    setMsg({ ok: true, text });
  };
  const test = useMutation({
    mutationFn: () => api<{ data: TestResult }>('/api/food-donations/connection/test', { method: 'POST', body: JSON.stringify({ user: userVal.trim(), pass }) }),
    onMutate: () => setMsg(null),
    onSuccess: (r) => setMsg(r.data.ok
      ? { ok: true, text: `Connected ✓ — ${r.data.count ?? 0} ${r.data.count === 1 ? 'email' : 'emails'} in the inbox` }
      : { ok: false, text: r.data.reason }),
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  const save = useMutation({
    mutationFn: () => api<{ data: Conn }>('/api/food-donations/connection', { method: 'PUT', body: JSON.stringify({ user: userVal.trim(), pass, address: addrVal.trim() }) }),
    onMutate: () => setMsg(null),
    onSuccess: (r) => done(r.data, 'Saved ✓ New emails will show up here within a minute.'),
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  const disconnect = useMutation({
    mutationFn: () => api<{ data: Conn }>('/api/food-donations/connection', { method: 'DELETE' }),
    onMutate: () => setMsg(null),
    onSuccess: (r) => done(r.data, 'Disconnected. The site no longer reads this mailbox.'),
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  const busy = test.isPending || save.isPending || disconnect.isPending;
  const input = 'w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[14px] text-ink';
  const btn = 'px-3 py-1.5 rounded-full text-[12.5px] font-bold border haptic disabled:opacity-50';

  return (
    <section className="rounded-[14px] border border-line bg-paper p-4 space-y-3" data-testid="donation-connection">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-[15px] text-ink">Connect the donation email</h3>
        <button type="button" onClick={onClose} className="text-[13px] font-bold text-muted hover:underline">Close</button>
      </div>
      {!c ? (
        <p className="text-[13px] text-muted">{q.isError ? errText(q.error) : 'Loading…'}</p>
      ) : !c.editable ? (
        <p className="text-[13px] text-ink">
          Set on the server (can’t change here): <span className="font-bold">{c.user}</span>
          {c.passHint ? ` · app password ending in ${c.passHint}` : ''}. Ask Sholo to change it.
        </p>
      ) : (
        <>
          <p className="text-[12.5px] text-muted">
            Use a Google app password, not the normal password: Google Account → Security → 2-Step Verification on → App passwords → create one → paste the 16 letters here.
          </p>
          <label className="block space-y-1">
            <span className="text-[12.5px] font-bold text-ink">Email address</span>
            <input className={input} type="email" autoComplete="off" value={userVal} placeholder="Dispatch@zehlzeh.org"
                   onChange={(e) => setUser(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-[12.5px] font-bold text-ink">Google app password</span>
            <input className={input} type="password" autoComplete="new-password" value={pass}
                   placeholder={c.passHint ? 'Leave empty to keep the saved one' : 'abcd efgh ijkl mnop'}
                   onChange={(e) => setPass(e.target.value)} />
            {c.passHint && !pass && <span className="block text-[12px] text-forest font-bold">saved ✓ · ending in {c.passHint}</span>}
            {c.problem && <span className="block text-[12px] text-clay font-bold">{c.problem}</span>}
          </label>
          <label className="block space-y-1">
            <span className="text-[12.5px] font-bold text-ink">Address donors write to <span className="font-normal text-muted">(optional)</span></span>
            <input className={input} type="email" autoComplete="off" value={addrVal} placeholder={userVal || 'same as the email above'}
                   onChange={(e) => setAddress(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || !userVal.trim() || (!pass && !c.passHint)} onClick={() => test.mutate()}
                    className={cx(btn, 'bg-paper text-ink border-line')}>
              {test.isPending ? 'Testing… (up to 15 s)' : 'Test connection'}
            </button>
            <button type="button" disabled={busy || !userVal.trim() || (!pass && !c.passHint)} onClick={() => save.mutate()}
                    className={cx(btn, 'bg-forest text-paper border-forest')}>
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
            {c.source === 'site' && (
              <button type="button" disabled={busy}
                      onClick={() => { if (window.confirm(`Disconnect ${c.user}? The site will stop reading this mailbox.`)) disconnect.mutate(); }}
                      className={cx(btn, 'bg-paper text-clay border-clay/40')}>
                Disconnect
              </button>
            )}
          </div>
        </>
      )}
      {msg && <p className={cx('text-[13px] font-bold', msg.ok ? 'text-forest' : 'text-clay')} role="status">{msg.text}</p>}
      {c && c.source !== 'none' && (
        <p className="text-[12px] text-muted">
          {c.lastCheck ? `Last checked ${clock(c.lastCheck)}` : 'Not checked yet'}
          {c.lastError ? ` · ✗ ${c.lastError}` : c.lastOk ? ' · ✓' : ''}
        </p>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={cx('shrink-0 px-2 py-0.5 rounded-full text-[11.5px] font-bold border', STATUS_TONE[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function DonationDetail({ id, canEdit }: { id: number; canEdit: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['food-donation', id], queryFn: () => api<{ data: Detail }>(`/api/food-donations/${id}`) });
  const [notes, setNotes] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (b: { status?: Status; notes?: string }) =>
      api(`/api/food-donations/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
    onSuccess: () => {
      setNotes(null);
      qc.invalidateQueries({ queryKey: ['food-donations'] });
      qc.invalidateQueries({ queryKey: ['food-donation', id] });
    },
  });
  // Nov 1 client: reply from the dispatch email, and "Make a pickup" (the office checks the form, then creates it).
  const [replyText, setReplyText] = useState('');
  const [replyMsg, setReplyMsg] = useState<string | null>(null);
  const [makePickup, setMakePickup] = useState(false);
  const send = useMutation({
    mutationFn: (text: string) => api<{ data: { status: string; error: string | null } }>(`/api/food-donations/${id}/reply`, { method: 'POST', body: JSON.stringify({ text }) }),
    onSuccess: (r) => {
      setReplyText('');
      setReplyMsg(r.data.status === 'sent' ? 'Sent from the dispatch email.' : (r.data.error || 'Saved, not sent.'));
      qc.invalidateQueries({ queryKey: ['food-donations'] });
      qc.invalidateQueries({ queryKey: ['food-donation', id] });
    },
    onError: (e: any) => { setReplyMsg(e?.body?.error || e?.message || 'The reply didn’t send.'); qc.invalidateQueries({ queryKey: ['food-donation', id] }); },
  });
  const d = q.data?.data;
  if (!d) return <p className="px-4 pb-4 text-[13px] text-muted">{q.isError ? 'Couldn’t load this email.' : 'Loading…'}</p>;
  const sug = d.suggestion;
  const pickupPrefill = {
    suppliers: sug?.storeName ?? '',
    donor_name: sug?.storeName ?? '', // a person's name goes in Contact name, not Store / hall name
    food_description: sug?.foodDescription ?? d.subject ?? '',
    pickup_address: sug?.address ?? '',
    contact_name: sug?.contactName || d.from_name || '',
    contact_phone: sug?.contactPhone ?? '',
    notes: `From the donation email: ${d.subject || '(no subject)'}${d.from_email ? ` (${d.from_email})` : ''}`,
    slots_capacity: 1,
  };

  const notesValue = notes ?? d.notes ?? '';
  const notesChanged = notes !== null && notes !== (d.notes ?? '');
  const replyHref = d.from_email
    ? `mailto:${d.from_email}?subject=${encodeURIComponent(`Re: ${d.subject || 'Your food donation'}`)}`
    : null;

  return (
    <div className="px-4 pb-4 space-y-3">
      <div className="text-[12.5px] text-muted">
        From {d.from_name ? `${d.from_name} · ` : ''}{d.from_email ?? 'unknown address'}
      </div>
      <p className="whitespace-pre-wrap break-words text-[14px] text-ink rounded-[10px] border border-line bg-ink/5 p-3 max-h-80 overflow-auto">
        {d.body_text || '(empty email)'}
      </p>
      {d.files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {d.files.map((f) => f.content_type.startsWith('image/') ? (
            <a key={f.id} href={fileUrl(f.url)} target="_blank" rel="noreferrer">
              <img src={fileUrl(f.url)} alt={f.filename} className="h-24 w-24 object-cover rounded-[8px] border border-line" />
            </a>
          ) : (
            <a key={f.id} href={fileUrl(f.url)} target="_blank" rel="noreferrer" className="text-[13px] font-bold text-forest hover:underline">
              {f.filename}
            </a>
          ))}
        </div>
      )}
      {canEdit ? (
        <>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <button key={s} type="button" disabled={save.isPending || d.status === s} onClick={() => save.mutate({ status: s })}
                      className={cx('px-3 py-1.5 rounded-full text-[12.5px] font-bold border haptic',
                        d.status === s ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line')}>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <textarea value={notesValue} onChange={(e) => setNotes(e.target.value)} rows={2}
                    placeholder="Notes: who called them, what was arranged…"
                    className="w-full rounded-[10px] border border-line bg-paper p-2 text-[13.5px] text-ink" />
          <div className="flex flex-wrap items-center gap-3">
            {notesChanged && (
              <button type="button" disabled={save.isPending} onClick={() => save.mutate({ notes: notesValue })}
                      className="px-3 py-1.5 rounded-full text-[12.5px] font-bold bg-forest text-paper border border-forest haptic">
                Save notes
              </button>
            )}
            {replyHref && <a href={replyHref} className="text-[13px] font-bold text-muted hover:underline">Open in my email app</a>}
            <button type="button" onClick={() => setMakePickup(true)}
                    className="ml-auto px-3 py-1.5 rounded-full text-[12.5px] font-bold bg-forest text-paper border border-forest haptic">
              🚚 Make a pickup from this
            </button>
          </div>
          {save.isError && <p className="text-[12.5px] text-clay">Couldn’t save. Try again.</p>}

          {/* Nov 1 client: replies from the dispatch email */}
          {(d.replies?.length ?? 0) > 0 && (
            <div className="space-y-2">
              {d.replies!.map((r) => (
                <div key={r.id} className="rounded-[10px] border border-line bg-sage/40 p-2.5 text-[13px]">
                  <div className="text-[11.5px] text-muted font-bold">
                    {r.status === 'sent' ? '✓ Sent' : r.status === 'held' ? 'Not sent (test site)' : '⚠️ Didn’t send'}
                    {r.by_name ? ` by ${r.by_name}` : ''} · {new Date(r.at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {r.status === 'failed' && r.error ? ` — ${r.error}` : ''}
                  </div>
                  <div className="whitespace-pre-wrap break-words text-ink mt-0.5">{r.text}</div>
                </div>
              ))}
            </div>
          )}
          {d.from_email && (
            <div className="space-y-2">
              <textarea value={replyText} onChange={(e) => { setReplyText(e.target.value); setReplyMsg(null); }} rows={3}
                        placeholder={`Reply to ${d.from_name || d.from_email}… (sent from the dispatch email)`}
                        className="w-full rounded-[10px] border border-line bg-paper p-2 text-[13.5px] text-ink" />
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" disabled={send.isPending || !replyText.trim()} onClick={() => send.mutate(replyText.trim())}
                        className="px-4 py-1.5 rounded-full text-[12.5px] font-bold bg-forest text-paper border border-forest haptic disabled:opacity-50">
                  {send.isPending ? 'Sending…' : '✉️ Send reply'}
                </button>
                {replyMsg && <span className="text-[12.5px] font-bold text-ink">{replyMsg}</span>}
              </div>
            </div>
          )}
          {makePickup && (
            <QuickPickupModal title="New pickup from this email" duplicateFrom={pickupPrefill} onClose={() => setMakePickup(false)}
              onDone={() => {
                setMakePickup(false);
                const note = [d.notes, 'Pickup created from this email.'].filter(Boolean).join('\n');
                save.mutate({ status: 'pickup_created', notes: note });
                qc.invalidateQueries({ queryKey: ['admin-pickups'] });
              }} />
          )}
        </>
      ) : (
        d.notes && <p className="text-[13px] text-ink"><span className="font-bold">Notes:</span> {d.notes}</p>
      )}
    </div>
  );
}
