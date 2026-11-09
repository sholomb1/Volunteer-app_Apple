/**
 * Nov 4 Yakov: center help punch in / punch out on the quick kiosk (quick-kiosk.tsx).
 *   "When someone signs in with the last 4 digits of the cell it should have a (if they are assigned
 *    'In center') punch in, (if you are coming with a group please add amount of people). And they
 *    should be able to see there the shifts of the last 2 months."
 * Shown after "Yes, that's me" when the reply has `center` (🏠 In center, a center help shift today,
 * or punched in now). Someone with pickups today first gets the choice
 * "I'm dropping off food" / "I'm here to help in the center".
 *   status (Not punched in / Punched in at 9:02 AM · 1 h 20 min so far) + big Punch in / Punch out
 *   → Punch in: "Coming with a group? How many people (including you)?" 1–6 or a number → Punch in
 *   → "You're punched in!" / "Thank you!" → back to the start by itself.
 *   + Your shifts (next 2 weeks) + Recent activity (last 2 months).
 * API: POST /api/kiosk/:secret/center/punch (vp-api routes/center-punch.ts). Laid out on the same
 * 800×1280 (portrait) / 1280×800 (landscape) stage as the rest of the quick kiosk.
 */
import { useEffect, useState } from 'react';
import { kiosk, type CenterCard } from './kiosk-api';
import { TapButton } from './tap-button';

const TZ = 'America/New_York';
const BTN_PRIMARY = 'rounded-[22px] bg-forest text-paper font-extrabold inline-flex items-center justify-center gap-3 shadow-[0_6px_0_#1E3F29] disabled:opacity-35 disabled:shadow-none active:translate-y-[2px]';
const BTN_OUT = 'rounded-[22px] bg-clay text-paper font-extrabold inline-flex items-center justify-center gap-3 shadow-[0_6px_0_#A85A33] disabled:opacity-35 disabled:shadow-none active:translate-y-[2px]';
const BTN_OUTLINE = 'rounded-[22px] bg-paper text-forest border-[3px] border-forest font-extrabold inline-flex items-center justify-center';
const H1 = 'font-extrabold text-forest leading-[1.08] tracking-[-.01em]';
const LINK = 'text-[19px] font-extrabold text-muted underline underline-offset-4 py-[10px] px-1';
const DONE_SECONDS = 8;

export const timeText = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const ymdOf = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });
export function dayText(iso: string, nowMs = Date.now()): string {
  const d = ymdOf(new Date(iso));
  if (d === ymdOf(new Date(nowMs))) return 'Today';
  if (d === ymdOf(new Date(nowMs + 86400e3))) return 'Tomorrow';
  if (d === ymdOf(new Date(nowMs - 86400e3))) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
}
export function durText(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}
const groupText = (n: number) => (n > 1 ? `group of ${n}` : '');

/** "I'm dropping off food" / "I'm here to help in the center" (someone with pickups today and center help). */
export function CenterChoice({ name, card, P, onFood, onCenter }: { name: string; card: CenterCard; P: boolean; onFood: () => void; onCenter: () => void }) {
  const tile = `w-full flex items-center gap-[26px] bg-paper border-[3px] rounded-[28px] text-left shadow-[0_5px_0_#E0D8C6] ${P ? 'px-8 py-9' : 'px-8 py-7'}`;
  return (
    <div className={`flex-1 min-h-0 flex flex-col ${P ? 'px-10 pt-8' : 'w-[940px] mx-auto pt-4'}`}>
      <div className={`${H1} text-[48px]`}>Hi {name}!</div>
      <div className="text-[26px] text-muted mt-[10px]">What are you here for today?</div>
      <TapButton onTap={onFood} className={`${tile} border-line mt-8`} downClass="!bg-sage !border-forest">
        <span className="text-[64px] leading-none">🍲</span>
        <span className="min-w-0">
          <span className="block text-[38px] font-extrabold text-ink">I'm dropping off food</span>
          <span className="block text-[22px] text-muted mt-1">Your pickups and labels</span>
        </span>
        <span className="ml-auto text-[46px] font-extrabold text-forest">›</span>
      </TapButton>
      <TapButton onTap={onCenter} className={`${tile} border-sage-line mt-6`} downClass="!bg-sage !border-forest">
        <span className="text-[64px] leading-none">🏠</span>
        <span className="min-w-0">
          <span className="block text-[38px] font-extrabold text-ink">I'm here to help in the center</span>
          <span className="block text-[22px] text-muted mt-1">{card.open ? `Punched in at ${timeText(card.open.inAt)}` : 'Punch in / punch out'}</span>
        </span>
        <span className="ml-auto text-[46px] font-extrabold text-forest">›</span>
      </TapButton>
    </div>
  );
}

type Done = { did: 'in' | 'out'; at: string; minutes?: number; groupSize?: number };

/** The center help card: status, Punch in / Punch out, Your shifts, Recent activity. */
export function CenterHelpScreen({ secret, volunteerId, firstName, card, P, onCard, onFood, onFinish, onFeedback, topbar }: {
  secret: string; volunteerId: number; firstName: string; card: CenterCard; P: boolean;
  onCard: (c: CenterCard) => void; onFood: () => void; onFinish: () => void; onFeedback?: () => void;
  topbar: React.ReactNode;
}) {
  const [asking, setAsking] = useState(false);
  const [group, setGroup] = useState(1);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [left, setLeft] = useState(DONE_SECONDS);
  const [now, setNow] = useState(Date.now());

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!done) return;
    setLeft(DONE_SECONDS);
    const t = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, [done]);
  useEffect(() => { if (done && left <= 0) onFinish(); }, [left, done, onFinish]);

  async function punch(action: 'in' | 'out') {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const n = action === 'in' ? Math.max(1, Math.min(500, Number(typed) || group)) : undefined;
      const r = await kiosk.centerPunch(secret, { volunteerId, action, groupSize: n });
      if (r.data.center) onCard(r.data.center);
      if (r.data.did === 'not-in') { setErr("You're not punched in right now."); return; }
      if (r.data.did === 'already-in') { setAsking(false); setErr(`You're already punched in (since ${timeText(r.data.at!)}).`); return; }
      setDone({ did: r.data.did, at: r.data.at!, minutes: r.data.minutes, groupSize: r.data.did === 'in' ? n : r.data.groupSize });
    } catch (e: any) { setErr(e?.message || 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  }

  if (done) {
    return (
      <>
        <div className={`flex-1 min-h-0 flex flex-col items-center justify-center text-center ${P ? 'px-10 pb-20' : 'px-20 pb-10'}`}>
          <div className="w-[132px] h-[132px] rounded-full bg-forest text-paper grid place-items-center text-[78px] font-black shadow-[0_0_0_16px_#E5EEE2]">✓</div>
          {done.did === 'in' ? (
            <>
              <div className={`${H1} text-[50px] mt-[34px]`}>You're punched in, {firstName}!</div>
              <div className="text-[28px] text-ink mt-4">{timeText(done.at)}{done.groupSize && done.groupSize > 1 ? ` · ${groupText(done.groupSize)}` : ''}</div>
              <div className="text-[26px] text-ink font-bold mt-3">Thanks for coming! Don't forget to punch out at the end of your shift.</div>
              <div className="text-[22px] text-muted mt-2">When you leave, sign in again and tap Punch out.</div>
            </>
          ) : (
            <>
              <div className={`${H1} text-[50px] mt-[34px]`}>Thank you, {firstName}!</div>
              <div className="text-[28px] text-ink mt-4">Punched out at {timeText(done.at)}</div>
              {done.minutes != null && <div className="text-[24px] text-muted mt-3">You helped {durText(done.minutes)} today{done.groupSize && done.groupSize > 1 ? ` (${groupText(done.groupSize)})` : ''}.</div>}
            </>
          )}
          <TapButton onTap={onFinish} className={`${BTN_PRIMARY} h-[96px] px-16 text-[30px] mt-12`} downClass="scale-[.99]">Done</TapButton>
          {onFeedback && <button type="button" onClick={onFeedback} className="mt-6 text-[24px] font-bold text-forest underline underline-offset-4">Any feedback or ideas? Tell us</button>/* Nov 8 client */}
        </div>
        <div className="absolute left-0 right-0 bottom-[34px] text-center text-[20px] text-muted font-bold">Back to start in {Math.max(0, left)}s</div>
      </>
    );
  }

  const open = card.open;
  const soFar = open ? Math.max(0, Math.round((now - Date.parse(open.inAt)) / 60000)) : 0;
  const total = card.recent.reduce((n, s) => n + s.minutes, 0);
  const groupBtn = (n: number) => (
    <TapButton key={n} onTap={() => { setGroup(n); setTyped(''); }}
               className={`h-[92px] rounded-[20px] border-[3px] text-[40px] font-extrabold ${group === n && !typed ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line-2'}`}
               downClass="scale-[.97]">{n}</TapButton>
  );

  const status = (
    <div className={`bg-paper border-[3px] rounded-[26px] px-[30px] py-[26px] shadow-[0_10px_30px_rgba(28,42,33,.08)] ${open ? 'border-forest' : 'border-line'}`}>
      <div className="flex items-center gap-4">
        <span className={`w-5 h-5 rounded-full flex-none ${open ? 'bg-forest' : 'bg-line-2'}`} />
        <span className="text-[34px] font-extrabold text-ink">{open ? `Punched in at ${timeText(open.inAt)}` : 'Not punched in'}</span>
      </div>
      <div className="text-[24px] text-muted mt-2 ml-9">
        {open ? [`${durText(soFar)} so far`, groupText(open.groupSize)].filter(Boolean).join(' · ') : 'Ready to start helping?'}
      </div>
      {!asking && (
        <TapButton onTap={() => (open ? void punch('out') : (setErr(null), setGroup(1), setTyped(''), setAsking(true)))} disabled={busy}
                   className={`${open ? BTN_OUT : BTN_PRIMARY} w-full h-[110px] text-[38px] mt-6`} downClass="scale-[.99]">
          {busy ? 'One moment…' : open ? 'Punch out' : 'Punch in'}
        </TapButton>
      )}
      {asking && !open && (
        <div className="mt-6 border-t-2 border-line pt-5">
          <div className="text-[30px] font-extrabold text-ink">Coming with a group?</div>
          <div className="text-[23px] text-muted mt-1">How many people (including you)?</div>
          <div className="grid grid-cols-6 gap-3 mt-4">{[1, 2, 3, 4, 5, 6].map(groupBtn)}</div>
          <div className="flex items-center gap-4 mt-4">
            <span className="text-[22px] text-muted font-bold">More:</span>
            <input value={typed} inputMode="numeric" placeholder="e.g. 12" aria-label="How many people"
                   onChange={(e) => setTyped(e.target.value.replace(/\D/g, '').slice(0, 3))}
                   className={`w-[180px] rounded-[16px] border-[3px] bg-paper px-5 py-3 text-[30px] font-extrabold outline-none ${typed ? 'border-forest' : 'border-line-2'}`} />
            {typed && <span className="text-[22px] text-forest font-bold">{Number(typed) || 1} people</span>}
          </div>
          <TapButton onTap={() => void punch('in')} disabled={busy} className={`${BTN_PRIMARY} w-full h-[104px] text-[36px] mt-6`} downClass="scale-[.99]">
            {busy ? 'One moment…' : `Punch in${(Number(typed) || group) > 1 ? ` (${Number(typed) || group} people)` : ''}`}
          </TapButton>
          <div className="text-center mt-2"><button type="button" onClick={() => setAsking(false)} className={LINK}>Cancel</button></div>
        </div>
      )}
      {err && <div className="text-clay text-[22px] font-bold text-center bg-clay/10 rounded-[16px] py-3 px-5 mt-4">{err}</div>}
    </div>
  );

  const shifts = (
    <div>
      <div className="text-[26px] font-extrabold text-ink">Your shifts</div>
      {card.shifts.length === 0
        ? <div className="text-[21px] text-muted mt-2">No center help shifts on your list for the next 2 weeks.</div>
        : card.shifts.slice(0, P ? 4 : 3).map((s, i) => (
          <div key={i} className="flex items-baseline gap-4 border-b-2 border-line/70 py-3">
            <span className={`text-[23px] font-extrabold w-[190px] flex-none ${s.today ? 'text-forest' : 'text-ink'}`}>{dayText(s.startsAt, now)}</span>
            <span className="text-[23px] text-ink">{timeText(s.startsAt)} – {timeText(s.endsAt)}</span>
            <span className="ml-auto text-[20px] text-muted truncate">{s.task}</span>
          </div>
        ))}
    </div>
  );

  const recent = (
    <div className="flex flex-col min-h-0">
      <div className="flex items-baseline gap-3">
        <div className="text-[26px] font-extrabold text-ink">Recent activity</div>
        <div className="text-[20px] text-muted">last 2 months{total ? ` · ${durText(total)} in all` : ''}</div>
      </div>
      <div className="overflow-y-auto min-h-0 mt-1">
        {card.recent.length === 0 && <div className="text-[21px] text-muted mt-2">Nothing yet. Your visits will show here.</div>}
        {card.recent.map((s, i) => (
          <div key={i} className="flex items-center gap-4 border-b-2 border-line/70 py-3">
            <span className="text-[22px] font-extrabold text-ink w-[190px] flex-none">{dayText(s.inAt, now)}</span>
            <span className="text-[22px] text-ink">
              {timeText(s.inAt)} – {s.outAt ? timeText(s.outAt) : '…'}
              {s.noPunchOut && <span className="ml-2 text-[16px] font-bold text-[#7A5713] bg-amber-soft rounded-full px-3 py-[3px] align-middle">no punch-out</span>}
              {s.groupSize > 1 && <span className="ml-2 text-[16px] font-bold text-forest bg-sage rounded-full px-3 py-[3px] align-middle">{groupText(s.groupSize)}</span>}
            </span>
            <span className="ml-auto text-[22px] font-extrabold text-forest whitespace-nowrap">{durText(s.minutes)}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const food = (
    <TapButton onTap={onFood} className={`${BTN_OUTLINE} w-full h-[84px] text-[26px] flex-none`} downClass="!bg-sage">
      🍲 I'm dropping off food ›
    </TapButton>
  );

  return (
    <>
      {topbar}
      {P ? (
        <div className="flex-1 min-h-0 flex flex-col gap-6 px-10 pt-2 pb-8">
          <div className={`${H1} text-[46px]`}>Center help</div>
          {status}
          {!asking && shifts}
          {!asking && <div className="flex-1 min-h-0 flex flex-col">{recent}</div>}
          {asking && <div className="flex-1" />}
          {food}
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-[560px_1fr] gap-10 px-10 pt-2 pb-8">
          <div className="flex flex-col gap-6 min-h-0">
            <div className={`${H1} text-[46px]`}>Center help</div>
            {status}
            <div className="flex-1" />
            {food}
          </div>
          <div className="flex flex-col gap-6 min-h-0">{shifts}{recent}</div>
        </div>
      )}
    </>
  );
}
