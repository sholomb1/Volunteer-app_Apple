// Oct 24 client ("too many steps … make it shorter"): the short History timeline (src/pickup-timeline.ts).
// Run: node --test scripts/pickup-timeline.test.mjs   (Node 22.18+: loads the .ts directly)
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { shortTimeline, shortName, timelineWhen } = await import('../src/pickup-timeline.ts');

const row = (at, kind, text, extra = {}) => ({ at, kind, text, detail: null, vid: null, who: null, by_name: null, who_first: null, who_last: null, ...extra });
const yh = { vid: '295', who_first: 'Yisroel', who_last: 'Herskovitz' };
const lines = (rows, day) => shortTimeline(rows, day).map((l) => `${l.when}  ${l.text}${l.note ? ` [${l.note}]` : ''}`);

test("the client's Oct 24 example → 3 lines", () => {
  const rows = [
    row('2026-10-25 01:32:54.632885+00', 'created', 'Pickup created'),
    row('2026-10-25 01:32:54.67759+00', 'texted', 'Texted to drivers', { detail: 'reply code 495' }),
    row('2026-10-25 01:33:45.493791+00', 'escalation', 'Needs a driver — started', { detail: 'Alert to the dispatcher on duty' }),
    row('2026-10-25 02:34:10.728423+00', 'accepted', 'Yisroel Herskovitz #73 accepted', yh),
    row('2026-10-25 02:34:10.728423+00', 'assigned', 'Yisroel Herskovitz #73 assigned', yh),
    row('2026-10-25 03:20:00.777512+00', 'kiosk', 'Checked in at the kiosk by Yisroel Herskovitz #73', { ...yh, who: 'Yisroel Herskovitz' }),
    row('2026-10-25 03:20:00.795805+00', 'completed', 'Marked completed'),
  ];
  assert.deepEqual(lines(rows, '2026-10-24'), [
    '9:32 PM  Posted and texted to drivers',
    '10:34 PM  Yisroel H. took it',
    '11:20 PM  ✓ Dropped off at the kiosk (Yisroel H.)',
  ]);
  const t = shortTimeline(rows, '2026-10-24');
  assert.deepEqual(t.map((l) => l.tone), ['plain', 'plain', 'done']);
  assert.ok(!JSON.stringify(t).includes('495'), 'no reply code');
  assert.ok(!JSON.stringify(t).includes('#73'), 'no unit number');
});

test('driver gives it back, it goes out again, another driver takes it', () => {
  const yk = { vid: '237', who_first: 'Yitzy', who_last: 'Klein' };
  const ad = { vid: '343', who_first: 'Aron', who_last: 'Devries' };
  const rows = [
    row('2026-10-20T18:55:57.966Z', 'created', 'Pickup created'),
    row('2026-10-20T18:55:57.991Z', 'texted', 'Texted to drivers', { detail: 'reply code 466' }),
    row('2026-10-20T18:56:06.386Z', 'escalation', 'Needs a driver — started'),
    row('2026-10-20T23:12:13.871Z', 'accepted', 'Yitzy Klein #22 accepted', yk),
    row('2026-10-20T23:12:13.871Z', 'assigned', 'Yitzy Klein #22 assigned', yk),
    row('2026-10-20T23:12:23.926Z', 'released', 'Yitzy Klein #22 released from the pickup', yk),
    row('2026-10-20T23:12:23.927Z', 'driver_cancel', 'Yitzy Klein #22 declined', yk),
    row('2026-10-20T23:12:23.939Z', 'resend', 'Texted to drivers again', { who: 'driver-app' }),
    row('2026-10-20T23:22:35.996Z', 'accepted', 'Aron Devries #118 accepted', ad),
    row('2026-10-20T23:22:35.996Z', 'assigned', 'Aron Devries #118 assigned', ad),
    row('2026-10-21T04:11:35.860Z', 'kiosk', 'Checked in at the kiosk by Aron Devries #118', { ...ad, who: 'Aron Devries' }),
    row('2026-10-21T04:11:35.867Z', 'completed', 'Marked completed'),
  ];
  assert.deepEqual(lines(rows, '2026-10-20'), [
    '2:55 PM  Posted and texted to drivers',
    '7:12 PM  Yitzy K. took it',
    '7:12 PM  Yitzy K. gave it back · texted to drivers again',
    '7:22 PM  Aron D. took it',
    'Wed Oct 21 · 12:11 AM  ✓ Dropped off at the kiosk (Aron D.)',
  ]);
});

test('expired, put back in the queue, texted again; the day shows when it is not the pickup day', () => {
  const ss = { vid: '259', who_first: 'Shaul', who_last: 'Susholz' };
  const rows = [
    row('2026-10-13T02:36:26.719Z', 'created', 'Pickup created'),
    row('2026-10-13T02:36:26.730Z', 'texted', 'Texted to drivers', { detail: 'reply code 418' }),
    row('2026-10-13T02:36:26.731Z', 'deadline', 'Offered to drivers until Tue 4:00 AM (set when posted)'),
    row('2026-10-13T02:36:56.048Z', 'escalation', 'Needs a driver — started'),
    row('2026-10-13T08:41:05.075Z', 'closed', 'Expired — no driver'),
    row('2026-10-13T19:25:44.122Z', 'requeued', 'Put back in queue for 6 more hours by Site', { by_name: 'Site' }),
    row('2026-10-13T19:25:44.143Z', 'texted', 'Texted to drivers', { detail: 'reply code 427' }),
    row('2026-10-13T22:18:38.392Z', 'accepted', 'Shaul Susholz #39 accepted', ss),
    row('2026-10-13T22:18:38.392Z', 'assigned', 'Shaul Susholz #39 assigned', ss),
    row('2026-10-13T22:53:20.974Z', 'kiosk', 'Checked in at the kiosk by Shaul Susholz #39', { ...ss, who: 'Shaul Susholz' }),
    row('2026-10-13T22:53:20.987Z', 'completed', 'Marked completed'),
  ];
  assert.deepEqual(lines(rows, '2026-10-13'), [
    'Mon Oct 12 · 10:36 PM  Posted and texted to drivers',
    '4:41 AM  ✕ No driver took it',
    '3:25 PM  Put back in the queue by Site and texted to drivers again',
    '6:18 PM  Shaul S. took it',
    '6:53 PM  ✓ Dropped off at the kiosk (Shaul S.)',
  ]);
});

test('steady pickup: office assigned, cancelled, un-cancelled, drivers needed changed', () => {
  const ar = { vid: '310', who_first: 'Avrumi', who_last: 'Rand' };
  const rows = [
    row('2026-10-02T04:05:45.459Z', 'created', 'Created automatically from the steady schedule "R-Kafe Friday"'),
    row('2026-10-02T04:05:45.462Z', 'assigned', 'Avrumi Rand #89 assigned', ar),
    row('2026-10-23T12:40:26.159Z', 'closed', 'Pickup cancelled', { detail: 'Only one driver', by_name: 'Chaya Cohen' }),
    row('2026-10-23T15:23:00.096Z', 'requeued', 'Un-cancelled by Chaya', { by_name: 'Chaya' }),
    row('2026-10-23T15:23:05.646Z', 'drivers_needed', 'Drivers needed 2 → 1 (every week) by Chaya Cohen', { by_name: 'Chaya Cohen' }),
    row('2026-10-23T19:23:31.590Z', 'kiosk', 'Checked in at the kiosk by Avrumi Rand #89', { ...ar, who: 'Avrumi Rand' }),
    row('2026-10-23T19:23:31.599Z', 'completed', 'Marked completed'),
  ];
  assert.deepEqual(lines(rows, '2026-10-23'), [
    'Fri Oct 2 · 12:05 AM  Made from the steady schedule',
    'Fri Oct 2 · 12:05 AM  Office assigned Avrumi R.',
    '8:40 AM  ✕ Cancelled by Chaya C. [Only one driver]',
    '11:23 AM  Un-cancelled by Chaya',
    '11:23 AM  Drivers needed 2 → 1 (every week) by Chaya C.',
    '3:23 PM  ✓ Dropped off at the kiosk (Avrumi R.)',
  ]);
});

test('office assigned (named), backup, marked done by the office', () => {
  const mk = { vid: '20', who_first: 'Moshe', who_last: 'Katz' };
  const rows = [
    row('2026-10-22T14:00:00Z', 'created', 'Pickup created'),
    row('2026-10-22T14:05:00Z', 'assigned', 'Moshe Katz #20 assigned as backup by Rivky', { ...mk, by_name: 'Rivky' }),
    row('2026-10-22T19:00:00Z', 'completed', 'Marked done by Rivky Stein'),
  ];
  assert.deepEqual(lines(rows, '2026-10-22'), [
    '10:00 AM  Posted',
    '10:05 AM  Rivky assigned Moshe K. as backup',
    '3:00 PM  ✓ Marked done by Rivky S.',
  ]);
});

test('Ask driver: dropped off? + YES by text that finished it', () => {
  const rows = [
    row('2026-10-22T14:00:00Z', 'created', 'Pickup created'),
    row('2026-10-22T14:00:01Z', 'texted', 'Texted to drivers', { detail: 'reply code 401' }),
    row('2026-10-22T15:00:00Z', 'claimed', 'Eli Gold #15 claimed it in the app', { vid: '15', who_first: 'Eli', who_last: 'Gold' }),
    row('2026-10-22T20:00:00Z', 'dropoff_ask', 'Texted Eli Gold: did you drop off the food? (by Rivky)', { who: 'Eli Gold', by_name: 'Rivky' }),
    row('2026-10-22T20:30:00Z', 'dropoff_answer', 'Eli Gold answered YES: dropped off', { who: 'Eli Gold', detail: '"yes"' }),
    row('2026-10-22T20:30:00.5Z', 'completed', "Drop-off confirmed by the driver's text (YES)"),
  ];
  assert.deepEqual(lines(rows, '2026-10-22'), [
    '10:00 AM  Posted and texted to drivers',
    '11:00 AM  Eli G. took it',
    '4:00 PM  Asked Eli G.: dropped off?',
    '4:30 PM  ✓ Eli G. confirmed drop-off by text ["yes"]',
  ]);
  // asked + answered NO within 2 minutes → one line
  const no = [
    row('2026-10-22T20:00:00Z', 'dropoff_ask', 'Texted Eli Gold: did you drop off the food?', { who: 'Eli Gold' }),
    row('2026-10-22T20:01:00Z', 'dropoff_answer', 'Eli Gold answered NO: did not drop off', { who: 'Eli Gold' }),
  ];
  assert.deepEqual(lines(no, '2026-10-22'), ['4:00 PM  Asked Eli G.: dropped off? No']);
  // done by text YES with no ask row
  assert.deepEqual(lines([row('2026-10-22T20:30:00Z', 'completed', "Drop-off confirmed by the driver's text (YES)")], '2026-10-22'),
    ['4:30 PM  ✓ Driver confirmed drop-off by text']);
});

test('missed with a no-show (closed + close-out together)', () => {
  const rows = [
    row('2026-10-22T14:00:00Z', 'created', 'Pickup created'),
    row('2026-10-22T14:00:01Z', 'texted', 'Texted to drivers'),
    row('2026-10-22T15:00:00Z', 'accepted', 'Eli Gold #15 accepted', { vid: '15', who_first: 'Eli', who_last: 'Gold' }),
    row('2026-10-22T15:00:00Z', 'assigned', 'Eli Gold #15 assigned', { vid: '15', who_first: 'Eli', who_last: 'Gold' }),
    row('2026-10-23T01:00:00Z', 'closeout', 'Closed out: missed by Site Admin', { by_name: 'Site Admin', detail: 'Driver did not come · No-show: Eli Gold' }),
    row('2026-10-23T01:00:00.2Z', 'closed', 'Closed as missed', { detail: 'closeout: driver did not come' }),
  ];
  assert.deepEqual(lines(rows, '2026-10-22'), [
    '10:00 AM  Posted and texted to drivers',
    '11:00 AM  Eli G. took it',
    '9:00 PM  ✕ Missed by Site A. · no-show: Eli G. [Driver did not come]',
  ]);
});

test('store CANCEL text, store food check no, store cancelled, office took the driver off', () => {
  const rows = [
    row('2026-10-22T13:00:00Z', 'created', 'Pickup created'),
    row('2026-10-22T13:00:01Z', 'texted', 'Texted to drivers'),
    row('2026-10-22T13:30:00Z', 'food_check', 'Store said no food today', { who: 'Hive Deli', by_name: 'no', detail: '"no food sorry"' }),
    row('2026-10-22T14:00:00Z', 'assigned', 'Moshe Katz #20 assigned', { vid: '20', who_first: 'Moshe', who_last: 'Katz' }),
    row('2026-10-22T14:10:00Z', 'resend', 'Office took the driver off, texted to drivers again', { who: 'office-edit', by_name: 'Rivky Stein' }),
    row('2026-10-22T14:20:00Z', 'resend', 'Rescheduled: driver taken off, texted to drivers again', { who: 'office-reschedule' }),
    row('2026-10-22T15:00:00Z', 'store_cancel', 'Hive Deli texted CANCEL', { who: 'Hive Deli', detail: '"CANCEL"' }),
    row('2026-10-22T15:02:00Z', 'closed', 'Pickup cancelled', { who: 'Hive Deli', detail: 'cancelled by store' }),
  ];
  assert.deepEqual(lines(rows, '2026-10-22'), [
    '9:00 AM  Posted and texted to drivers',
    '9:30 AM  Hive Deli: no food today ["no food sorry"]',
    '10:00 AM  Office assigned Moshe K.',
    '10:10 AM  Office (Rivky S.) took the driver off, texted to drivers again',
    '10:20 AM  Rescheduled: driver taken off, texted to drivers again',
    '11:00 AM  Hive Deli texted CANCEL ["CANCEL"]',
    '11:02 AM  ✕ Cancelled by Hive Deli [cancelled by store]',
  ]);
});

test('a driver who said no to an offer (never took it), confirm / decline', () => {
  const rows = [
    row('2026-10-22T13:00:00Z', 'driver_cancel', 'Eli Gold #15 declined', { vid: '15', who_first: 'Eli', who_last: 'Gold', detail: 'busy' }),
    row('2026-10-22T13:05:00Z', 'confirm', 'Declined by Rivky Stein', { by_name: 'Rivky Stein', detail: 'no food' }),
  ];
  assert.deepEqual(lines(rows, '2026-10-22'), ['9:00 AM  Eli G. said no [busy]', '9:05 AM  Declined by Rivky S. [no food]']);
});

test('helpers: names + times', () => {
  assert.equal(shortName('Yisroel Herskovitz #73'), 'Yisroel H.');
  assert.equal(shortName('Moshe K. (#20)'), 'Moshe K.');
  assert.equal(shortName('Chaya'), 'Chaya');
  assert.equal(shortName(''), '');
  assert.equal(timelineWhen('2026-10-25 01:32:54.632885+00', '2026-10-24'), '9:32 PM');
  assert.equal(timelineWhen('2026-10-25T14:00:00Z', '2026-10-24'), 'Sun Oct 25 · 10:00 AM');
  assert.equal(timelineWhen('bad', '2026-10-24'), '');
  assert.deepEqual(shortTimeline([], '2026-10-24'), []);
});
