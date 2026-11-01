/**
 * Oct 30 client (owner-approved plan): "🚚 Run to Lakewood / Fallsburg" — food or supplies from the
 * Monsey center (3 Regina) to our smaller locations, by a date + time. Texted ONLY to the drivers tagged
 * 🚚 Goes to Lakewood / Fallsburg (they text LAKEWOOD / FALLSBURG, or tick it on the application).
 * API: POST /api/pickup-instances { pickupType: 'run_lakewood' | 'run_fallsburg' } (date + time = the
 * "by" time), GET / PUT /api/runs/settings (the two locations' addresses). Rules: api src/run-rules.ts.
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, adminCRUD } from './api';
import { Button, cx, DateInput } from './design';
import { nyToday } from './time-format';
import { SubmittedByRow, submittedByError, submittedByValue, loadLastSubmittedBy, saveLastSubmittedBy, type SubmittedByState } from './submitted-by';

export type RunPlace = 'lakewood' | 'fallsburg';
export const RUN_PLACES: RunPlace[] = ['lakewood', 'fallsburg'];
export const RUN_PLACE_LABEL: Record<RunPlace, string> = { lakewood: 'Lakewood', fallsburg: 'Fallsburg' };
export const RUN_TYPE: Record<RunPlace, string> = { lakewood: 'run_lakewood', fallsburg: 'run_fallsburg' };
export const CENTER_ADDRESS = '3 Regina Road, Airmont, NY';

/** 'run_lakewood' → 'lakewood'; any other pickup → null. */
export function runPlaceOf(pickupType: unknown): RunPlace | null {
  const t = String(pickupType ?? '');
  return RUN_PLACES.find((p) => RUN_TYPE[p] === t) ?? null;
}

/** The "🚚 Run to Lakewood" tag (Live Board card, pickup page). */
export function RunTag({ pickupType, big }: { pickupType: unknown; big?: boolean }) {
  const place = runPlaceOf(pickupType);
  if (!place) return null;
  return (
    <span data-run-tag={place} title={`Goes from the center to our ${RUN_PLACE_LABEL[place]} location. Texted only to drivers who go there.`}
          className={cx('inline-flex items-center font-extrabold rounded-full bg-clay-soft text-clay border border-clay/30',
            big ? 'px-2.5 py-0.5 text-[11.5px]' : 'px-1.5 py-0.5 tracking-wide')}>
      🚚 Run to {RUN_PLACE_LABEL[place]}
    </span>
  );
}

type RunSettings = Record<RunPlace, { address: string }>;
export function useRunSettings() {
  return useQuery({ queryKey: ['run-settings'], queryFn: () => api<{ data: RunSettings }>('/api/runs/settings'), staleTime: 60_000 });
}

const input = 'w-full rounded-[10px] border-[1.4px] border-line-2 bg-paper px-3 py-2.5 text-[13.5px] focus:border-forest focus:ring-2 focus:ring-forest/15 outline-none';
const label = 'block text-[12px] font-bold text-ink mb-1.5';
const pill = (on: boolean) => cx('rounded-[999px] border-[2px] px-4 py-1.5 text-[13px] font-bold transition',
  on ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line hover:border-forest');

/** "Thu 5 PM" — same as the drivers' text (api run-rules.ts fmtBy). */
function byText(date: string, time: string): string {
  if (!date || !time) return '';
  const d = new Date(`${date}T12:00:00`);
  const day = d.toLocaleDateString('en-US', { weekday: 'short' });
  const [h, m] = time.split(':').map(Number);
  const t = `${((h ?? 0) % 12) || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${(h ?? 0) >= 12 ? 'PM' : 'AM'}`;
  return `${day} ${t}`;
}

/** The New pickup form's "🚚 Run to Lakewood / Fallsburg" (inside the New pickup window). */
export function RunPickupForm({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const qc = useQueryClient();
  const settings = useRunSettings();
  const [place, setPlace] = useState<RunPlace>('lakewood');
  const [what, setWhat] = useState('');
  const [size, setSize] = useState<'small' | 'large' | null>(null);
  const [date, setDate] = useState(() => nyToday());
  const [time, setTime] = useState('17:00');
  const [from, setFrom] = useState(CENTER_ADDRESS);
  const [notes, setNotes] = useState('');
  const [subBy, setSubBy] = useState<SubmittedByState>(() => loadLastSubmittedBy());
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [clientRequestId] = useState(() => (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const lock = useRef(false);
  const dest = settings.data?.data?.[place]?.address ?? '';

  const save = useMutation({
    mutationFn: async () => {
      const by = new Date(`${date}T${time}:00`);
      return adminCRUD.createPickup({
        clientRequestId,
        submittedBy: submittedByValue(subBy) ?? '',
        pickupType: RUN_TYPE[place],
        scheduledDate: date,
        scheduledTime: `${time}:00`,
        scheduledTimeExplicit: true,
        mustPickupBy: Number.isNaN(by.getTime()) ? undefined : by.toISOString(),
        isOneTime: true,
        slotsCapacity: 1,
        urgencyLevel: 'normal',
        pickupAddress: from.trim() || CENTER_ADDRESS,
        foodDescription: what.trim(),
        pickupInstructions: notes.trim() || null,
        size,
        contactEmail: null,
      });
    },
    onError: (e: any) => { lock.current = false; setErr(e?.message ?? 'Could not save. Please try again.'); },
    onSuccess: (res: any) => {
      saveLastSubmittedBy(subBy);
      qc.invalidateQueries({ queryKey: ['pickups'] });
      const ab = res?.autoBroadcast ?? {};
      const L = RUN_PLACE_LABEL[place];
      const msg = res?.duplicate || res?.repeated ? (res?.message || 'This run was already added a moment ago.')
        : ab.reason === 'run-sent' ? `✓ Saved. Texted ${ab.sent} driver${ab.sent === 1 ? '' : 's'} who go to ${L}.`
        : ab.reason === 'run-sending' ? `✓ Saved. Texting ${ab.recipients ?? ''} driver${ab.recipients === 1 ? '' : 's'} who go to ${L} now.`.replace('  ', ' ')
        : ab.reason === 'run-nobody-tagged' ? `✓ Saved. Nobody is tagged "Goes to ${L}" yet — it is texted as soon as someone signs up (they text ${place.toUpperCase()}).`
        : ab.reason === 'run-quiet-hours' || ab.reason === 'run-shabbos-quiet' ? '✓ Saved. It will be texted to the drivers who go there in the morning (after quiet hours / Shabbos).'
        : ab.reason === 'run-nobody-reachable' ? `✓ Saved. The drivers who go to ${L} can't get texts right now; it is texted when they can.`
        : ab.testMode ? '🧪 Test run saved — no texts.'
        : '✓ Saved.';
      setFlash(msg);
      setTimeout(onDone, 3200);
    },
  });

  useEffect(() => { setErr(null); }, [place, what, date, time]);
  function submit() {
    if (lock.current || save.isPending || save.isSuccess) return;
    const sbErr = submittedByError(subBy, true);
    if (!what.trim()) { setErr("Please write what's going (e.g. 4 boxes of food)."); return; }
    if (!date || !time) { setErr('Please pick the date and time it must be there by.'); return; }
    if (new Date(`${date}T${time}:00`).getTime() <= Date.now()) { setErr('The "by" time has already passed.'); return; }
    if (sbErr) { setErr(sbErr); return; }
    lock.current = true;
    save.mutate();
  }

  return (
    <div data-testid="run-form" className="grid grid-cols-2 gap-3">
      <div className="col-span-2 rounded-[10px] border border-clay/30 bg-clay-soft/50 px-3 py-2 text-[12.5px] text-ink">
        From the center to our location there. Texted <b>only to drivers who go there</b> (they texted LAKEWOOD / FALLSBURG or ticked it on their application).
      </div>
      <div className="col-span-2">
        <span className={label}>Where to</span>
        <div className="flex flex-wrap gap-2">
          {RUN_PLACES.map((p) => (
            <button key={p} type="button" data-run-place={p} onClick={() => setPlace(p)} className={pill(place === p)}>🚚 {RUN_PLACE_LABEL[p]}</button>
          ))}
        </div>
        <div className="mt-1 text-[11.5px] text-muted">
          {dest ? <>Drop off at: <b className="text-ink">{dest}</b></> : <>No {RUN_PLACE_LABEL[place]} address yet — add it in Admin → Settings → Lakewood / Fallsburg locations.</>}
        </div>
      </div>
      <label className="col-span-2">
        <span className={label}>What's going</span>
        <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder='e.g. "4 boxes of food"' className={input} data-run-what />
      </label>
      <div className="col-span-2">
        <span className={label}>Size — optional</span>
        <div className="flex gap-2">
          {(['small', 'large'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setSize(size === s ? null : s)} className={pill(size === s)}>{s === 'small' ? 'Small' : 'Large'}</button>
          ))}
        </div>
      </div>
      <label>
        <span className={label}>Must be there by — date</span>
        <DateInput value={date} onChange={setDate} className={input} />
      </label>
      <label>
        <span className={label}>By — time</span>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input} />
      </label>
      <label className="col-span-2">
        <span className={label}>Pick up at</span>
        <input value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
        <span className="block mt-1 text-[11.5px] text-muted">The Monsey center. Change it only if it leaves from somewhere else.</span>
      </label>
      <label className="col-span-2">
        <span className={label}>Notes for the driver — optional</span>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Ask for Yossi at the back door" className={input} />
      </label>
      <div className="col-span-2">
        <span className={label}>Form submitted by <span className="text-clay">*</span></span>
        <SubmittedByRow value={subBy} onChange={setSubBy} />
      </div>
      {what.trim() && date && time && (
        <div className="col-span-2 rounded-[10px] bg-cream px-3 py-2 text-[12.5px] text-muted" data-run-preview>
          Drivers get: <span className="text-ink">"🚚 Run to {RUN_PLACE_LABEL[place]} by {byText(date, time)}: {what.trim()}{size ? ` (${size} load)` : ''} from the center (3 Regina). Reply 531 to take it."</span>
        </div>
      )}
      {err && <p className="col-span-2 text-clay text-[12.5px] font-bold">{err}</p>}
      {flash && <div role="status" className="col-span-2 rounded-[10px] px-3 py-2 text-[13px] font-bold bg-sage text-forest border border-sage-line">{flash}</div>}
      <div className="col-span-2 flex justify-end gap-2 mt-1">
        <Button size="sm" variant="plain" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={save.isPending} disabled={save.isPending || save.isSuccess} onClick={submit} data-testid="run-save">
          {save.isPending ? 'Saving…' : save.isSuccess ? 'Saved ✓' : `Create run to ${RUN_PLACE_LABEL[place]}`}
        </Button>
      </div>
    </div>
  );
}

/** Admin → Settings: "Lakewood location address" / "Fallsburg location address". */
export function RunPlacesCard() {
  const qc = useQueryClient();
  const q = useRunSettings();
  const [vals, setVals] = useState<Record<RunPlace, string> | null>(null);
  useEffect(() => {
    if (q.data?.data && !vals) setVals({ lakewood: q.data.data.lakewood?.address ?? '', fallsburg: q.data.data.fallsburg?.address ?? '' });
  }, [q.data, vals]);
  const save = useMutation({
    mutationFn: () => api('/api/runs/settings', { method: 'PUT', body: JSON.stringify({ lakewood: { address: vals?.lakewood ?? '' }, fallsburg: { address: vals?.fallsburg ?? '' } }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['run-settings'] }),
  });
  const v = vals ?? { lakewood: '', fallsburg: '' };
  return (
    <div className="rounded-[14px] border border-line bg-paper p-4" data-testid="run-places-card">
      <div className="font-display font-bold text-[15px] text-ink">🚚 Lakewood / Fallsburg locations</div>
      <div className="text-[12px] text-muted mt-0.5 mb-3">Where a "Run to Lakewood / Fallsburg" goes. Drivers see it after they take the run.</div>
      {RUN_PLACES.map((p) => (
        <label key={p} className="block mb-2.5">
          <span className={label}>{RUN_PLACE_LABEL[p]} location address</span>
          <input value={v[p]} onChange={(e) => setVals({ ...v, [p]: e.target.value })} placeholder={p === 'lakewood' ? 'e.g. 120 Clifton Ave, Lakewood, NJ' : 'e.g. 5 Main St, South Fallsburg, NY'} className={input} />
        </label>
      ))}
      <div className="flex items-center gap-3">
        <Button size="sm" loading={save.isPending} disabled={!vals || save.isPending} onClick={() => save.mutate()}>Save addresses</Button>
        {save.isSuccess && <span className="text-[12px] font-bold text-forest">✓ Saved</span>}
        {save.isError && <span className="text-[12px] font-bold text-clay">{(save.error as Error)?.message ?? 'Could not save'}</span>}
      </div>
    </div>
  );
}
