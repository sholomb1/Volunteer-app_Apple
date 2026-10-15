/**
 * Oct 14 client: "all the rules — I want people to be able to see them."
 * Messaging → How texting works: the texting rules in plain words, a few bullets
 * per topic. Written from the API code (text-recipients.ts, driver-prefs.ts,
 * new-pickup-slot.ts, next-pickup-text.ts, scheduled-drops-sweeper.ts,
 * shabbos-window.ts, driver-removed.ts, pickup-code-reopen.ts, food-check*.ts,
 * store-notices.ts, store-text-settings.ts, office-alerts.ts, office-alert-rules.ts).
 * When a rule changes there, change the bullet here too.
 */
import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cx } from './design';
import { api } from './api';

type Rule = { title: string; bullets: string[] };

// Oct 14 client: keep each section 2–4 short bullets, plain English.
const RULES: Rule[] = [
  {
    title: 'Who gets pickup texts',
    bullets: [
      'Drivers in the Default text group. Adding someone to the group is the office review — new drivers get nothing until then. "Inactive" is only a label: inactive drivers in the group still get texts. Do not contact, alumni and archived drivers never do.',
      'Each driver\'s own settings are followed: quiet hours (several allowed, even past midnight), quiet days, Away dates, "App only" (app pop-ups, no texts) and a pause by the office.',
      'Outside helpers (people not on our list who covered a pickup) never get our automatic texts.',
      'STOP turns off all our texts to that phone; START turns them back on. To see who gets a text and why not: Messaging → Who gets texts, or tap "N drivers" on a pickup.',
    ],
  },
  // Oct 14 client: the driver queue window (open-rule.ts).
  {
    title: 'When drivers see a pickup',
    bullets: [
      'Drivers see a pickup only from 2 hours before its time, or the hours set in Settings (a 5 PM pickup opens at 3 PM). Before that it is not in PICKUPS, not in any text\'s "Also still open" list, not in the app\'s Open list or map, and it cannot be taken — by text, in the app or by phone call. Late and reposted pickups ("now") stay open as before.',
      'A driver who texts its number or INFO before it opens gets "This pickup opens at 3:00 PM — we\'ll text you then." In the app the pickup page shows "Opens at 3:00 PM" instead of Take.',
      'The office still sees every pickup (Live Board, Pickups, counts). The pickup card says "Opens to drivers at 3:00 PM" while it waits. Drivers already on a steady pickup always see their own pickups.',
      'The office can still text a pickup early by hand (Send SMS / SEND by text) — that pickup opens to drivers right then; the rest of the list still follows the rule. Change the 2 hours in Admin → Settings ("Show pickups to drivers __ hours before their time").',
    ],
  },
  {
    title: 'When texts go out',
    bullets: [
      'A new pickup is texted at the top of the hour before its time (9:53 PM → 9:00 PM), or right away if that time already passed. "Text drivers now" sends it at once. The text lists the new pickup on top, then "Also still open".',
      'The hourly text goes at the top of each hour from 9 AM to 9 PM, only when an open pickup has never been texted yet. A reposted or late pickup says "now" instead of its old time.',
      // Oct 14 client: first text of the day at 9 AM; 8 AM only for pickups before 9.
      'First text of the day at 9:00 AM; an 8:00 AM text only when a pickup is before 9. The 8 AM text lists only pickups before 9:00 (and late "now" ones); pickups at 9:00 or later, like the Hive, go in the 9 AM text. Before 9 AM, "Also still open" also lists only pickups before 9.',
      'Catch-up: when a driver\'s own quiet time ends (between 9 AM and 10 PM), they get the open pickups once, 5–20 minutes later, if they had no pickup text since. A quiet time that ends before 9 AM counts as ending at 9:00 (catch-up at about 9:05) — or at 8:00 when a pickup before 9 is open (catch-up at about 8:05, listing only the pickups before 9).',
      'No automatic texts or app pop-ups from 15 minutes before Monsey candle lighting until Motzei Shabbos / the end of Yom Tov; what was waiting goes out right after. "Pause all texts" stops every text until the office turns it back on.',
    ],
  },
  {
    title: 'When a driver comes off a pickup',
    bullets: [
      'If the office takes a driver off (remove, Driver cancel, Mark unavailable today, edit or reschedule), the driver gets a text: "You\'re off the … pickup". Only STOP / texts off blocks it.',
      'If the pickup still needs a driver, it is texted again right away as a NEW pickup, with the same rules as any new pickup. The driver who just came off is not texted about it.',
      'The pickup gets its old text number back, so drivers can still reply with the number they already have. A driver can also give a pickup back: "I can\'t make it" in the app, or "347 CANCEL" by text.',
    ],
  },
  {
    title: 'Stores',
    bullets: [
      '"Do you have food today?" (steady pickups, off unless the office turns it on for that steady): we text the store 2 hours before (or the hours set), 8 AM–10 PM, never on Shabbos. YES → the pickup goes to drivers. NO → today is cancelled and the office is told. No answer by 30 minutes before → the office gets an alert to call. A driver already on that steady pickup is told the YES / NO.',
      '"Driver on the way" and "Your food was picked up, thank you" texts are off for every store until the office turns them on in the store profile. Then the store\'s own app choice decides: pop-up, text, both or off. Store texts go 8 AM–9 PM only, never on Shabbos.',
      'Oct 14: the office New pickup / Edit pickup form has "Text the contact when a driver is on the way" for each pickup. For a store it starts ticked only if that store\'s switch is on; ticking it texts the store for just that pickup, unticking skips just that pickup. Store pickups posted from the store app (no box) follow the store\'s switch.',
      'Oct 14: if a store replies CANCEL to "a driver accepted your pickup", the pickup is cancelled automatically (just that day, never the steady pickup; it is not sent to other drivers). The driver gets an app alert and a warm text: "Zeh L\'Zeh: Sorry, Hive just let us know the food isn\'t needed anymore, so the 4:00 PM pickup is cancelled. Thank you so much for heading out for it, it really means a lot. The office will give you a call." The store gets "Thanks — the pickup is cancelled and the driver has been told." The dispatcher gets an alert "Call Moshe: Hive cancelled" with the driver\'s phone, to make sure he got it. If the food was already picked up, nothing is cancelled: the store gets "Thanks — the dispatcher has been notified." and the office gets an alert. A second CANCEL does nothing. Other store replies go to the office with the store\'s name (a plain "thank you" is not passed on).',
      'When a store cancels or changes a pickup in its app, the drivers on it are told (not on Shabbos).',
    ],
  },
  {
    title: 'Donors (one-time pickups)',
    bullets: [
      'When a driver takes a one-time pickup (not a store, not a steady pickup, not a delivery), the donor can get: "Zeh L\'Zeh: A driver accepted your pickup and will be there soon. If it\'s no longer needed, reply CANCEL. Thanks!" (no driver name, no time).',
      'Oct 14: only when the office ticks "Text the contact when a driver is on the way" on that pickup (New pickup / Edit pickup). It starts unticked for one-time pickups for now, so donors are NOT texted unless ticked. One-time pickups made another way (public form, text NEW) are not texted. The card shows "Contact will be texted when a driver accepts" when it is on.',
      'Sent 8 AM–10 PM, never on Shabbos / Yom Tov or while texts are paused. Not sent if that phone texted STOP.',
      'Oct 14: a CANCEL reply cancels the pickup automatically, the same as for a store: the driver gets a warm text and an app alert, the donor gets "Thanks — the pickup is cancelled and the driver has been told.", and the dispatcher gets an alert to call the driver. Already picked up → not cancelled, the donor gets "Thanks — the dispatcher has been notified." and the office is alerted.',
    ],
  },
  {
    title: 'Office alerts',
    bullets: [
      'Alerts: a text reply that needs the office (incl. HELP), a driver gave a pickup back, a store post with no driver after 15 minutes, a pickup starting within an hour with no driver, a reply not opened in 10 minutes, and the store "food today?" and CANCEL answers.',
      'Who sees them: a pop-up with a beep and the bell in the portal, and a phone notification to the dispatcher on duty. Nobody on duty → office people who turned on phone alerts.',
      'They still come while texts are paused, but never on Shabbos / Yom Tov.',
      'An alert clears itself when it is no longer needed (a driver took it, the pickup is over, someone answered or opened the text). A store / donor CANCEL alert ("Call Moshe: Hive cancelled") stays until it is dismissed. Dismiss / Dismiss all clears it for everyone.',
    ],
  },
  {
    title: 'The nightly thank-you text',
    bullets: [
      'Once a day at 10 PM (Friday and before Yom Tov: 45 minutes before candle lighting; none on Yom Tov) to the Default text group. Each driver\'s settings and quiet hours apply.',
      'It names the unit numbers of drivers who really covered a pickup today: picked it up or finished it, signed in at the kiosk today, or took a pickup today that was for today. Only being on a steady list does not count.',
      'Drivers without a unit number (like outside helpers) are not listed. If nobody covered a pickup today, no thank-you is sent.',
    ],
  },
];

/**
 * Oct 14 client: Settings → "Show pickups to drivers __ hours before their time" (default 2).
 * GET/PUT /api/sms/driver-queue-hours (portal_settings 'driver_queue_hours', 1–24).
 */
export function DriverQueueHoursCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['driver-queue-hours'], queryFn: () => api<{ data: { hours: number } }>('/api/sms/driver-queue-hours') });
  const [draft, setDraft] = useState<string>('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (q.data) setDraft(String(q.data.data.hours)); }, [q.data]);
  const save = useMutation({
    mutationFn: (hours: number) => api<{ data: { hours: number } }>('/api/sms/driver-queue-hours', { method: 'PUT', body: JSON.stringify({ hours }) }),
    onSuccess: (r) => { setMsg({ ok: true, text: `Saved — drivers see a pickup ${r.data.hours} hour${r.data.hours === 1 ? '' : 's'} before its time.` }); qc.invalidateQueries({ queryKey: ['driver-queue-hours'] }); },
    onError: (e: any) => setMsg({ ok: false, text: String(e?.message ?? 'Could not save') }),
  });
  const n = Number(draft);
  const valid = Number.isInteger(n) && n >= 1 && n <= 24;
  const changed = q.data ? n !== q.data.data.hours : false;
  return (
    <div className="rounded-[14px] border border-line bg-paper p-4">
      <div className="font-display font-semibold text-[16px]">When drivers see a pickup</div>
      <label className="mt-2 flex flex-wrap items-center gap-2 text-[14px] text-ink">
        Show pickups to drivers
        <input type="number" min={1} max={24} step={1} value={draft} disabled={!q.data}
               onChange={(e) => { setDraft(e.target.value); setMsg(null); }}
               className="w-[64px] rounded-[8px] border border-line bg-cream/60 px-2 py-1 text-[14px] text-right" />
        hours before their time
        <span className="text-muted text-[12.5px]">(default 2)</span>
        <button type="button" onClick={() => valid && save.mutate(n)} disabled={!valid || !changed || save.isPending}
                className="haptic ml-1 rounded-[10px] bg-forest px-3 py-1.5 text-[13px] font-bold text-paper disabled:opacity-40">
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </label>
      <div className="mt-1.5 text-[12.5px] text-muted">
        Before that, a pickup is not in PICKUPS, the texts or the drivers' app, and nobody can take it. Late pickups stay open. The office still sees everything.
      </div>
      {!valid && draft !== '' && <div className="mt-1 text-[12.5px] text-clay">Use a whole number from 1 to 24.</div>}
      {msg && <div className={cx('mt-1 text-[12.5px] font-bold', msg.ok ? 'text-forest' : 'text-clay')}>{msg.text}</div>}
    </div>
  );
}

export function HowTextingWorksPanel({ onOpenCodeWords }: { onOpenCodeWords?: () => void }) {
  const [closed, setClosed] = useState<Record<number, boolean>>({});
  return (
    <div className="space-y-3">
      <div className="rounded-[14px] border border-line bg-paper px-4 py-3 text-[13px] text-ink">
        How our texts work, in short. Tap a heading to fold it.
        {onOpenCodeWords && (
          <> Every word people can text us is in{' '}
            <button type="button" onClick={onOpenCodeWords} className="haptic font-bold text-forest underline">Driver messages → Code words</button>.</>
        )}
      </div>
      {RULES.map((r, i) => {
        const open = !closed[i];
        return (
          <section key={r.title} className="rounded-[14px] border border-line bg-paper">
            <h3 className="m-0">
              <button type="button" aria-expanded={open} aria-controls={`rule-${i}`}
                      onClick={() => setClosed((c) => ({ ...c, [i]: open }))}
                      className="haptic flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-[14.5px] font-extrabold text-ink">
                {r.title}
                <ChevronDown size={18} aria-hidden className={cx('shrink-0 text-muted transition-transform', open ? 'rotate-180' : '')} />
              </button>
            </h3>
            {open && (
              <ul id={`rule-${i}`} className="list-disc space-y-1.5 px-4 pb-3 pl-8 text-[13px] leading-snug text-ink">
                {r.bullets.map((b, j) => <li key={j}>{b}</li>)}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
