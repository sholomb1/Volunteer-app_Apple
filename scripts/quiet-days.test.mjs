// Oct 14 client: the app's copy of quiet-days.ts (live "Texting hours" line) gives the same
// answers as the server's (apps/api/test/quiet-days.test.mjs checks the files are identical).
// Run: node --experimental-strip-types --test scripts/quiet-days.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { textingHours, inWindow, daysLabel, MON_THU } from '../src/quiet-days.ts';

const base = { sms_quiet_start: null, sms_quiet_end: null, extra_quiet: [], quiet_days: 0, vacation_from: null, vacation_until: null };

test('live texting line: every day (as before) and per day', () => {
  assert.equal(textingHours({ ...base, sms_quiet_start: '22:00', sms_quiet_end: '07:00' }, '2026-10-14').texting, '📱 Texting hours: 7 AM – 10 PM');
  const t = textingHours({ ...base, sms_quiet_start: '23:00', sms_quiet_end: '07:00', sms_quiet_days: MON_THU }, '2026-10-14');
  assert.equal(t.texting, '📱 Texting hours: Mon until 11 PM; Tue–Thu 7 AM – 11 PM; Fri from 7 AM; Sat, Sun all day');
  assert.equal(t.quiet, '🌙 Quiet: 11 PM – 7 AM · Mon–Thu');
});

test('Mon–Thu 9–5: Friday 10 AM is not quiet; overnight Thu: Fri 2 AM quiet, Fri 11 PM not', () => {
  const day = { start: '09:00', end: '17:00', days: MON_THU, first: false };
  assert.equal(inWindow(day, 5, 10 * 3600), false);
  assert.equal(inWindow(day, 4, 10 * 3600), true);
  const night = { start: '23:00', end: '07:00', days: 1 << 4, first: false };
  assert.equal(inWindow(night, 5, 2 * 3600), true);
  assert.equal(inWindow(night, 5, 23 * 3600), false);
  assert.equal(daysLabel(MON_THU), 'Mon–Thu');
});
