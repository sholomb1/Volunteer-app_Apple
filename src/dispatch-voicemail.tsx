/**
 * Nov 3 client: VOICEMAIL IN THE APP — admins only (dispatchers never see it). On Dispatchers → Now:
 * the dispatch line's voicemails from the phone system — who, when, how long, ▶ Listen (played through our
 * server, admins only), 📞 Call back and ✓ Handled (saved with who; also leaves the admin's To do).
 * API: GET /api/pbx/voicemail, GET /api/pbx/voicemail/:id/audio, POST /api/dispatch/todo/handled {key:'vm:<id>'}.
 * Asks every 60 s, only while the page is on screen.
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, API_BASE, getToken } from './api';
import { callNumber } from './office-phone';
import { onlyThisAudio } from './one-audio'; // Nov 5 client: one recording at a time

type Vm = { id: number; at: string | null; phone: string | null; seconds: number | null; unread: boolean; who: string;
  matchType: string | null; matchId: number | null; handledBy: string | null; handledAt: string | null };
type VmData = { rows: Vm[]; error: string | null; mailbox: string | null };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const len = (s: number | null) => (s == null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

/** ▶ Listen: the audio comes through our server (needs the login), played from memory. */
export function VoicemailListen({ id }: { id: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ msg: string; detail: string | null } | null>(null);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const load = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`${API_BASE.replace(/\/$/, '')}/api/pbx/voicemail/${id}/audio`, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } });
      if (!r.ok) { const b = await r.json().catch(() => ({})); setErr({ msg: b?.error || "Couldn't play it.", detail: b?.detail ?? null }); return; }
      setUrl(URL.createObjectURL(await r.blob()));
    } catch { setErr({ msg: "Couldn't play it. Try again.", detail: null }); } finally { setBusy(false); }
  };
  if (url) return <audio onPlay={onlyThisAudio} src={url} controls autoPlay className="mt-1.5 w-full max-w-[420px]" />;
  return (
    <span className="inline-flex flex-col">
      <button type="button" disabled={busy} onClick={() => void load()} className="text-[12px] font-bold text-forest underline disabled:opacity-50">{busy ? 'Loading…' : '▶ Listen'}</button>
      {err && <span className="text-[12px] text-clay">{err.msg}{err.detail && <span className="block text-[11px] text-muted">({err.detail})</span>}</span>}
    </span>
  );
}

export function VoicemailPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['pbx-voicemail'], refetchInterval: 60_000, refetchIntervalInBackground: false,
    queryFn: () => api<{ data: VmData }>('/api/pbx/voicemail') });
  const [showDone, setShowDone] = useState(false);
  const d = q.data?.data;
  const handled = async (v: Vm) => {
    qc.setQueryData<{ data: VmData }>(['pbx-voicemail'], (old) => old && ({ data: { ...old.data, rows: old.data.rows.map((x) => (x.id === v.id ? { ...x, handledBy: 'you', handledAt: new Date().toISOString() } : x)) } }));
    try { await api('/api/dispatch/todo/handled', { method: 'POST', body: JSON.stringify({ key: `vm:${v.id}` }) }); qc.invalidateQueries({ queryKey: ['dispatch-todo'] }); }
    catch { void q.refetch(); }
  };
  const rows = (d?.rows ?? []).filter((v) => showDone || !v.handledAt);
  const doneCount = (d?.rows ?? []).filter((v) => v.handledAt).length;
  const open = (v: Vm) => { if (v.matchId && (v.matchType === 'volunteer' || v.matchType === 'supplier')) window.dispatchEvent(new CustomEvent(v.matchType === 'volunteer' ? 'zlz:open-volunteer' : 'zlz:open-store', { detail: { id: v.matchId, tab: 'overview' }, cancelable: true })); };
  return (
    <section className="rounded-[18px] border border-line bg-paper p-5 space-y-3" data-voicemail>
      <div className="flex items-center gap-2">
        <h3 className="font-display font-semibold text-[17px] text-ink mr-auto">📼 Voicemail <span className="font-body font-normal text-[12px] text-muted">(only admins see this)</span></h3>
        {doneCount > 0 && <button type="button" onClick={() => setShowDone((x) => !x)} className="text-[12.5px] font-bold text-forest underline">{showDone ? 'Hide handled' : `${doneCount} handled — show`}</button>}
      </div>
      {!d && <div className="text-[13px] text-muted">{q.isError ? "Couldn't load the voicemail." : 'Loading…'}</div>}
      {d?.error && <div className="text-[13px] text-clay font-bold">Couldn't read the voicemail box from the phone system. <span className="font-normal text-muted">It said: “{d.error}”</span></div>}
      {d && !d.error && rows.length === 0 && <div className="text-[13px] text-forest font-bold">No new voicemail. 👍</div>}
      <div className="divide-y divide-line/70">
        {rows.map((v) => (
          <div key={v.id} className={`py-2.5 text-[13px] ${v.handledAt ? 'opacity-60' : ''}`} data-vm-row>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="w-[150px] text-muted">{when(v.at)}</span>
              <button type="button" onClick={() => open(v)} className={`font-bold text-ink text-left ${v.matchId ? 'hover:underline' : ''}`}>{v.who}</button>
              {v.seconds != null && <span className="rounded-full bg-sage px-2 py-0.5 text-[12px] font-bold text-forest">⏱ {len(v.seconds)}</span>}
              {v.unread && !v.handledAt && <span className="rounded-full bg-clay text-paper px-2 py-0.5 text-[11px] font-bold">New</span>}
              {v.handledAt && <span className="text-forest font-bold">✓ Handled{v.handledBy ? ` by ${v.handledBy}` : ''}</span>}
              <span className="ml-auto flex flex-wrap gap-3 items-start">
                <VoicemailListen id={v.id} />
                {v.phone && <button type="button" onClick={() => callNumber(v.phone)} className="text-[12px] font-bold text-forest underline">📞 Call back</button>}
                {!v.handledAt && <button type="button" onClick={() => void handled(v)} className="text-[12px] font-bold text-muted underline hover:text-forest">✓ Handled</button>}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
