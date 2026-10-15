// Oct 7 client: Food Donations. People email donate@zehlzeh.org to give food; vp-api reads
// that mailbox every minute and each email shows up here for the dispatchers to follow up.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, API_BASE } from './api';
import { cx } from './design';

type Status = 'new' | 'contacted' | 'pickup_created' | 'closed';
type Row = {
  id: number; from_name: string | null; from_email: string | null; subject: string; snippet: string;
  received_at: string; status: Status; file_count: number;
};
type FileRow = { id: number; filename: string; content_type: string; url: string };
type Detail = Omit<Row, 'snippet' | 'file_count'> & { body_text: string; notes: string | null; files: FileRow[] };
type ListData = {
  connected: boolean; address: string; lastCheck: string | null; lastError: string | null;
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

  return (
    <div className="max-w-3xl space-y-4">
      {d && !d.connected && (
        <p className="rounded-[12px] border border-clay/30 bg-clay/10 px-4 py-2.5 text-[13px] text-clay font-semibold">
          The donation email isn’t connected yet. Once {d.address} is set up, emails people send there will show up here automatically.
        </p>
      )}
      {d?.connected && d.lastError && (
        <p className="rounded-[12px] border border-clay/30 bg-clay/10 px-4 py-2.5 text-[13px] text-clay font-semibold">
          Couldn’t check {d.address} the last time: {d.lastError}
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
  const d = q.data?.data;
  if (!d) return <p className="px-4 pb-4 text-[13px] text-muted">{q.isError ? 'Couldn’t load this email.' : 'Loading…'}</p>;

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
            {replyHref && <a href={replyHref} className="text-[13px] font-bold text-forest hover:underline">Reply by email</a>}
          </div>
          {save.isError && <p className="text-[12.5px] text-clay">Couldn’t save. Try again.</p>}
        </>
      ) : (
        d.notes && <p className="text-[13px] text-ink"><span className="font-bold">Notes:</span> {d.notes}</p>
      )}
    </div>
  );
}
