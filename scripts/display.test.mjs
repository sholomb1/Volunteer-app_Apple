// Oct 23 client ("Same style everywhere"): unit tests for the shared display helpers (src/display.ts).
// Run: node --test scripts/display.test.mjs   (Node 22.18+: loads the .ts directly)
import { test } from 'node:test';
import assert from 'node:assert/strict';

const D = await import('../src/display.ts');
const TODAY = '2026-10-23'; // a Friday
const dow = new Date('2026-10-23T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });

test('displayPhone: every format → 845-356-1637', () => {
  for (const p of ['8453561637', '+18453561637', '(845) 356-1637', '845.356.1637', '1-845-356-1637', ' 845 356 1637 ']) {
    assert.equal(D.displayPhone(p), '845-356-1637', p);
  }
  assert.equal(D.displayPhone('12345'), '12345');
  assert.equal(D.displayPhone(null), '');
  assert.equal(D.telHref('(845) 356-1637'), 'tel:+18453561637');
});

test('shortAddress: street + town, no state / zip / country', () => {
  assert.equal(D.shortAddress('8 Hershel Terrace, Monsey, NY 10952, USA'), '8 Hershel Terrace, Monsey');
  assert.equal(D.shortAddress('21 Elener Lane, Spring Valley, NY, USA'), '21 Elener Lane, Spring Valley');
  assert.equal(D.shortAddress('17 Ravenna Dr, Monsey NY 10952'), '17 Ravenna Dr, Monsey');
  assert.equal(D.shortAddress('3 Regina Rd, Airmont, New York 10952, United States'), '3 Regina Rd, Airmont');
  assert.equal(D.shortAddress('9 Demo Ct, Monsey, Rockland County, NY 10952'), '9 Demo Ct, Monsey');
  assert.equal(D.shortAddress('12 Demo Street'), '12 Demo Street');
  assert.equal(D.shortAddress('  '), '');
  assert.equal(D.shortAddressOf('51 Carlton Rd', 'Monsey'), '51 Carlton Rd, Monsey');
  assert.equal(D.streetOnly('17 Ravenna Dr, Monsey, NY 10952, USA'), '17 Ravenna Dr');
});

test('people: "Yermia H.", full name, unit numbers dropped', () => {
  assert.equal(D.personShort('Yermia', 'Halberstam'), 'Yermia H.');
  assert.equal(D.personShort('jonah', 'neuman'), 'jonah N.');
  assert.equal(D.personShort('משה', 'כהן'), 'משה כ.');
  assert.equal(D.personShort('Avi', ''), 'Avi');
  assert.equal(D.personFull(' Avi ', 'Rosen'), 'Avi Rosen');
  assert.equal(D.stripUnit('Eli G #15'), 'Eli G');
  assert.equal(D.stripUnit('Moshe K. (#20)'), 'Moshe K.');
});

test('statusKeyOf + STATUS words', () => {
  const w = (p) => D.STATUS[D.statusKeyOf(p)].word;
  assert.equal(w({ status: 'completed', kiosk_verified: true }), 'Done');
  assert.equal(w({ status: 'completed', completion_notes: 'auto: accepted — no kiosk sign-in' }), 'Done (no kiosk)');
  assert.equal(w({ status: 'completed', outcome: 'taken' }), 'Done (no kiosk)');
  assert.equal(w({ status: 'cancelled' }), 'Cancelled');
  assert.equal(w({ status: 'cancelled', cancellation_reason: 'No drop-off today' }), 'No drop-off today');
  assert.equal(w({ status: 'missed', cancellation_reason: 'marked missed' }), 'Missed');
  assert.equal(w({ status: 'missed', cancellation_reason: 'expired — no driver claimed it' }), 'Expired');
  assert.equal(w({ status: 'scheduled', signups: [] }), 'Needs a driver');
  assert.equal(w({ status: 'scheduled', signups: [{}] }), 'Covered');
  assert.equal(w({ status: 'scheduled', signups: [{}], slots_remaining: 1 }), 'Needs a driver');
  assert.equal(w({ status: 'scheduled', confirmation_state: 'pending' }), 'Needs confirmation');
  assert.equal(w({ outcome_label: 'Completed – verified' }), 'Done');
  assert.equal(w({ outcome_label: 'Expired – no driver' }), 'Expired');
  assert.equal(w({ outcome: 'cancelled', outcome_label: 'No drop-off today' }), 'No drop-off today');
  assert.equal(w({ outcome: 'taken', outcome_label: 'Taken — not checked in' }), 'Done (no kiosk)');
  assert.equal(w({ outcome_label: 'Needs review' }), 'Needs review');
  for (const k of Object.keys(D.STATUS)) assert.match(D.STATUS[k].pill, /border-.* bg-.* text-/);
});

test('dates + times: one format', () => {
  assert.equal(D.time12('16:00:00'), '4:00 PM');
  assert.equal(D.time12('00:05'), '12:05 AM');
  assert.equal(D.whenText(TODAY, '16:00', TODAY), '4:00 PM');
  assert.equal(D.whenText('2026-10-24', '09:00', TODAY), 'tomorrow 9:00 AM');
  assert.equal(D.whenText('2026-10-22', '09:00', TODAY), 'yesterday 9:00 AM');
  assert.equal(D.whenText('2026-10-29', '16:00', TODAY), 'Thu Oct 29 · 4:00 PM');
  assert.equal(D.whenText('2026-10-29', null, TODAY), 'Thu Oct 29');
  assert.equal(D.whenText('2025-12-25', '10:00', TODAY), 'Thu Dec 25, 2025 · 10:00 AM');
  assert.equal(D.dayText(TODAY, TODAY), `${dow} Oct 23`);
  // timestamps are shown on the New York clock
  assert.equal(D.whenAt('2026-10-23T20:00:00Z', TODAY), '4:00 PM');
  assert.equal(D.whenAt('2026-10-29T20:00:00Z', TODAY), 'Thu Oct 29 · 4:00 PM');
  assert.equal(D.whenAt('2026-10-24T04:30:00Z', TODAY), 'tomorrow 12:30 AM');
  assert.equal(D.timeAt('2026-10-23T13:05:00Z'), '9:05 AM');
  assert.equal(D.whenAt(null), '');
  assert.equal(D.whenAt('not a date'), '');
});
