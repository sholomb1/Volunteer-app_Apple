/**
 * Oct 24 client: "There's too many steps. This should not be a technical thing. This is just for a
 * dispatcher to see the timeline. Make it shorter."
 *
 * The pickup History tab's SHORT timeline (the default view). Pure: no React
 * (tests: scripts/pickup-timeline.test.mjs). The full list stays behind "Show all details".
 *
 *   Pickup created 9:32 PM + Texted to drivers 9:32 PM          → 9:32 PM   Posted and texted to drivers
 *   Yisroel Herskovitz #73 accepted + assigned 10:34 PM         → 10:34 PM  Yisroel H. took it
 *   Checked in at the kiosk 11:20 PM + Marked completed 11:20 PM → 11:20 PM ✓ Dropped off at the kiosk (Yisroel H.)
 *
 * Events within 2 minutes of each other that mean one thing become one line. Internal / system
 * rows (alerts, "needs a driver — started", offer deadlines) are left out. Names "First L.", no
 * unit numbers; times "h:mm AM/PM", with the day in front when it isn't the pickup's day.
 */
import { dayText, nyParts, stripUnit, time12 } from './display.ts'; // .ts: node --test loads this file directly
import { driverShort } from './pickup-label.ts';

/** One row of GET /api/pickup-instances/:id/history. */
export type HistoryRow = {
  at: string;
  kind: string;
  text: string;
  detail: string | null;
  vid?: string | number | null;
  who?: string | null;
  by_name?: string | null;
  who_first?: string | null;
  who_last?: string | null;
};

export type TimelineTone = 'done' | 'bad' | 'plain';
export type TimelineLine = { at: string; when: string; text: string; tone: TimelineTone; note?: string };

const WINDOW_MS = 2 * 60_000;
const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** "2026-10-25 01:32:54.63+00" (Postgres) or ISO → ms. */
function msOf(at: string): number {
  const s = clean(at);
  let t = Date.parse(s);
  if (Number.isNaN(t)) t = Date.parse(s.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
  return t;
}

/** "Yisroel Herskovitz #73" / "Chaya Cohen" / "Chaya" → "Yisroel H." / "Chaya C." / "Chaya". */
export function shortName(full: string | null | undefined): string {
  const w = stripUnit(full).split(' ').filter(Boolean);
  if (!w.length) return '';
  return driverShort(w[0], w.slice(1).join(' '));
}

/** The driver a row is about, "First L.". */
function driverOf(r: HistoryRow): string {
  if (clean(r.who_first)) return driverShort(r.who_first, r.who_last);
  if (clean(r.who)) return shortName(r.who);
  const m = /^(.*?)\s+(accepted|assigned|cancelled|declined|claimed it (?:in the app|by text|by phone call)|released from the pickup)\b/.exec(clean(r.text))
    ?? /^Checked in at the kiosk by (.*?)(?: \(was assigned to .*\))?$/.exec(clean(r.text));
  return m ? shortName(m[1]) : 'The driver';
}
const by = (name: string | null | undefined) => (clean(name) ? ` by ${shortName(name)}` : '');

/** "9:32 PM", or "Fri Oct 23 · 9:32 PM" when it isn't the pickup's day. */
export function timelineWhen(at: string, pickupDate?: string | null): string {
  const t = msOf(at);
  if (Number.isNaN(t)) return '';
  const p = nyParts(new Date(t));
  if (!p) return '';
  const hm = time12(p.hm);
  const day = clean(pickupDate).slice(0, 10);
  return day && p.ymd !== day ? `${dayText(p.ymd, day)} · ${hm}` : hm;
}

const TAKE = new Set(['accepted', 'assigned', 'claimed']);
/** Left out of the short view (still in "Show all details"). */
const HIDDEN = new Set(['escalation', 'deadline']);

/**
 * The short, plain timeline. Usually 3–6 lines for a normal pickup.
 * `pickupDate` (YYYY-MM-DD) = the pickup's day; other days get the day in front of the time.
 */
export function shortTimeline(rows: HistoryRow[], pickupDate?: string | null): TimelineLine[] {
  const ev = rows
    .map((r, i) => ({ r, i, t: msOf(r.at), text: clean(r.text), vid: r.vid == null ? '' : String(r.vid) }))
    .filter((e) => !Number.isNaN(e.t))
    .sort((a, b) => a.t - b.t || a.i - b.i);
  const used = new Set<number>();
  const out: TimelineLine[] = [];
  const near = (a: { t: number }, b: { t: number }) => Math.abs(a.t - b.t) <= WINDOW_MS;
  /** Unused events within 2 min of `e` that match. */
  const grab = (e: (typeof ev)[number], ok: (x: (typeof ev)[number]) => boolean) => {
    const got = ev.filter((x) => x !== e && !used.has(x.i) && near(x, e) && ok(x));
    for (const x of got) used.add(x.i);
    return got;
  };
  const push = (e: (typeof ev)[number], text: string, tone: TimelineTone = 'plain', note?: string | null) => {
    const n = clean(note);
    out.push({ at: e.r.at, when: timelineWhen(e.r.at, pickupDate), text, tone, ...(n ? { note: n } : {}) });
  };
  let textedBefore = false;
  const tookIt = new Set<string>(); // drivers who took it (so a later "declined" = gave it back)

  for (const e of ev) {
    if (used.has(e.i)) continue;
    used.add(e.i);
    const r = e.r;
    const k = r.kind;
    if (HIDDEN.has(k)) continue;

    if (k === 'created') {
      const texted = grab(e, (x) => x.r.kind === 'texted').length > 0;
      if (texted) textedBefore = true;
      const steady = e.text.startsWith('Created automatically');
      push(e, `${steady ? 'Made from the steady schedule' : 'Posted'}${texted ? ' and texted to drivers' : ''}`);
      continue;
    }
    if (k === 'texted' || (k === 'resend' && !/^office/.test(clean(r.who)))) {
      grab(e, (x) => x.r.kind === 'texted' || (x.r.kind === 'resend' && !/^office/.test(clean(x.r.who))));
      push(e, textedBefore ? 'Texted to drivers again' : 'Texted to drivers');
      textedBefore = true;
      continue;
    }
    if (k === 'resend') { // the office took a driver off and it went out again
      const src = clean(r.who);
      grab(e, (x) => x.r.kind === 'texted' || x.r.kind === 'resend');
      textedBefore = true;
      push(e, src === 'office-reschedule'
        ? `Rescheduled${by(r.by_name)}: driver taken off, texted to drivers again`
        : `Office${clean(r.by_name) ? ` (${shortName(r.by_name)})` : ''} took the driver off, texted to drivers again`, 'bad');
      continue;
    }
    if (TAKE.has(k)) {
      const group = [e, ...grab(e, (x) => TAKE.has(x.r.kind) && x.vid === e.vid)];
      const name = driverOf(r);
      const backup = group.some((x) => / as backup\b/.test(x.text)) ? ' as backup' : '';
      const accepted = group.some((x) => x.r.kind !== 'assigned');
      const assignedBy = group.find((x) => x.r.kind === 'assigned' && clean(x.r.by_name))?.r.by_name;
      // Oct 26 client: how he took it ("took it by text" / "in the app" / "by phone call").
      const how = group.map((x) => /claimed it (in the app|by text|by phone call)$/.exec(x.text)?.[1]).find(Boolean);
      if (accepted) push(e, tookIt.has(e.vid) ? `${name} said yes` : `${name} took it${backup}${how ? ` ${how}` : ''}`);
      else push(e, `${clean(assignedBy) ? shortName(assignedBy) : 'Office'} assigned ${name}${backup}`);
      tookIt.add(e.vid);
      continue;
    }
    if (k === 'driver_cancel' || k === 'released') {
      const name = driverOf(r);
      const same = grab(e, (x) => (x.r.kind === 'driver_cancel' || x.r.kind === 'released') && x.vid === e.vid);
      const again = grab(e, (x) => (x.r.kind === 'resend' && !/^office/.test(clean(x.r.who))) || x.r.kind === 'texted').length > 0;
      if (again) textedBefore = true;
      const gaveBack = k === 'released' || / cancelled$/.test(e.text) || tookIt.has(e.vid) || same.some((x) => x.r.kind === 'released');
      const reason = [r, ...same.map((x) => x.r)].map((x) => clean(x.detail)).find(Boolean);
      push(e, `${name} ${gaveBack ? 'gave it back' : 'said no'}${again ? ' · texted to drivers again' : ''}`, gaveBack ? 'bad' : 'plain', reason);
      tookIt.delete(e.vid);
      continue;
    }
    if (k === 'kiosk') {
      const done = grab(e, (x) => x.r.kind === 'completed' || (x.r.kind === 'closeout' && /done/.test(x.text)));
      // a "Marked completed" later on is the same finish
      for (const x of ev) if (!used.has(x.i) && x.r.kind === 'completed' && x.text === 'Marked completed') { used.add(x.i); done.push(x); }
      const was = /\(was assigned to (.*)\)$/.exec(e.text);
      const forWho = was ? `, for ${was[1]!.split(',').map(shortName).filter(Boolean).join(', ')}` : '';
      push(e, `✓ Dropped off at the kiosk (${driverOf(r)}${forWho})`, 'done');
      continue;
    }
    if (k === 'completed' || (k === 'closeout' && / done\b/.test(e.text))) {
      const more = grab(e, (x) => x.r.kind === 'completed' || (x.r.kind === 'closeout' && / done\b/.test(x.text)) || (x.r.kind === 'dropoff_answer' && /answered YES/.test(x.text)));
      const all = [e, ...more];
      const texts = all.map((x) => x.text);
      const close = all.find((x) => x.r.kind === 'closeout');
      const answer = all.find((x) => x.r.kind === 'dropoff_answer');
      const marked = texts.map((t) => /^Marked done by (.+)$/.exec(t)?.[1]).find(Boolean);
      let text: string;
      if (texts.some((t) => /^Drop-off confirmed by the driver/.test(t)) || answer) text = answer && clean(answer.r.who) ? `✓ ${shortName(answer.r.who)} confirmed drop-off by text` : '✓ Driver confirmed drop-off by text';
      else if (marked) text = `✓ Marked done by ${shortName(marked)}`;
      else if (close && clean(close.r.by_name)) text = `✓ Marked done by ${shortName(close.r.by_name)}`;
      else if (texts.some((t) => /^Taken — /.test(t))) text = '✓ Taken — driver did not check in at the kiosk';
      else text = '✓ Marked done';
      push(e, text, 'done', close?.r.detail);
      continue;
    }
    if (k === 'closeout' || k === 'closed') {
      const more = grab(e, (x) => x.r.kind === 'closed' || (x.r.kind === 'closeout' && !/ done\b/.test(x.text)));
      const all = [e, ...more];
      const cancel = all.find((x) => x.r.kind === 'closed' && x.text === 'Pickup cancelled');
      const close = all.find((x) => x.r.kind === 'closeout');
      if (cancel) {
        const whoBy = clean(cancel.r.who) ? ` by ${clean(cancel.r.who)}` : by(cancel.r.by_name);
        push(e, `✕ Cancelled${whoBy}`, 'bad', cancel.r.detail);
      } else if (all.some((x) => /^Expired/.test(x.text))) {
        push(e, '✕ No driver took it', 'bad');
      } else {
        const noShow = /No-show: (.*?)(?: · |$)/.exec(clean(close?.r.detail))?.[1];
        const reason = clean(close?.r.detail).split(' · ').filter((s) => s && !s.startsWith('No-show:')).join(' · ')
          || clean(all.find((x) => x.r.kind === 'closed')?.r.detail);
        const ns = noShow ? ` · no-show: ${noShow.split(',').map(shortName).filter(Boolean).join(', ')}` : '';
        push(e, `✕ Missed${close ? by(close.r.by_name) : ''}${ns}`, 'bad', reason);
      }
      continue;
    }
    if (k === 'requeued') {
      const name = by(r.by_name);
      // Oct 30 client: a steady day the schedule has again (put back by the app, not a person).
      if (/^Un-cancelled automatically/.test(e.text)) { push(e, 'Back on the steady schedule (un-cancelled automatically)'); continue; }
      if (/^Un-cancelled/.test(e.text)) { push(e, `Un-cancelled${name}`); continue; }
      const texted = grab(e, (x) => x.r.kind === 'texted').length > 0;
      if (texted) textedBefore = true;
      push(e, `Put back in the queue${name}${texted ? ' and texted to drivers again' : ''}`);
      continue;
    }
    if (k === 'drivers_needed') {
      const m = /^Drivers needed (.+?)(?: by .*)?$/.exec(e.text);
      push(e, `Drivers needed ${m ? m[1] : ''}${by(r.by_name)}`.trim());
      continue;
    }
    if (k === 'confirm') {
      push(e, `${/^Confirmed/.test(e.text) ? 'Confirmed' : 'Declined'}${by(r.by_name)}`, /^Confirmed/.test(e.text) ? 'plain' : 'bad', r.detail);
      continue;
    }
    if (k === 'dropoff_ask') {
      const name = clean(r.who) ? shortName(r.who) : 'the driver';
      const notSent = / — not sent$/.test(e.text) ? ' (not sent)' : '';
      const ans = grab(e, (x) => x.r.kind === 'dropoff_answer')[0];
      if (ans) {
        const yes = /answered YES/.test(ans.text);
        // the YES that finished it is said on the done line
        const doneNear = grab(ans, (x) => x.r.kind === 'completed' && /^Drop-off confirmed/.test(x.text)).length > 0;
        push(e, doneNear ? `✓ ${name} confirmed drop-off by text` : `Asked ${name}: dropped off? ${yes ? 'Yes' : 'No'}`, yes ? 'done' : 'bad', ans.r.detail);
      } else push(e, `Asked ${name}: dropped off?${notSent}`);
      continue;
    }
    if (k === 'dropoff_answer') {
      const yes = /answered YES/.test(e.text);
      const name = clean(r.who) ? shortName(r.who) : 'The driver';
      const doneNear = yes && grab(e, (x) => x.r.kind === 'completed' && /^Drop-off confirmed/.test(x.text)).length > 0;
      if (doneNear) push(e, `✓ ${name} confirmed drop-off by text`, 'done', r.detail);
      else push(e, `${name}: ${yes ? 'yes, dropped off' : 'no, did not drop off'}`, yes ? 'done' : 'bad', r.detail);
      continue;
    }
    if (k === 'food_check') {
      const place = clean(r.who) || 'The store';
      const a = clean(r.by_name);
      push(e, a === 'yes' ? `${place}: yes, food today` : a === 'no' ? `${place}: no food today` : `${place} answered the food check`, a === 'no' ? 'bad' : 'plain', r.detail);
      continue;
    }
    if (k === 'store_cancel') { push(e, e.text, 'bad', r.detail); continue; }
    // Anything new: plain words, no unit numbers.
    push(e, stripUnit(e.text), 'plain', r.detail);
  }
  return out;
}
