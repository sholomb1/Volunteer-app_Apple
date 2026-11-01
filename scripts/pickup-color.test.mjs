// Oct 21 client: unit tests for the Live Board card colors (src/pickup-color.ts).
// Run: node --test scripts/pickup-color.test.mjs   (Node 22.18+: loads the .ts directly)
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { pickupColor, agoText, finishedPill } = await import('../src/pickup-color.ts');
const NOW = Date.UTC(2026, 9, 21, 18, 0);
const MIN = 60_000;
const base = { status: 'scheduled', cancelled: false, confirmationPending: false, startMs: NOW + 120 * MIN, nowMs: NOW, need: 1 };
const c = (patch) => pickupColor({ ...base, ...patch });

test('grey: done / delivered / missed / cancelled', () => {
  for (const status of ['completed', 'delivered', 'missed', 'cancelled', 'expired']) assert.equal(c({ status }), 'grey');
  assert.equal(c({ cancelled: true }), 'grey');
  assert.equal(c({ cancelled: true, storeCancelOpen: true, need: 1, startMs: NOW - 90 * MIN }), 'grey');
});
test('neutral: open, more than 30 min away', () => assert.equal(c({}), 'neutral'));
test('red: still needs a driver, 30 min or less before', () => {
  assert.equal(c({ startMs: NOW + 30 * MIN }), 'red');
  assert.equal(c({ startMs: NOW + 31 * MIN }), 'neutral');
});
test('red: past its time, no driver (incl. 1 h late)', () => {
  assert.equal(c({ startMs: NOW - 5 * MIN }), 'red');
  assert.equal(c({ startMs: NOW - 70 * MIN }), 'red');
});
test('red: 1 of 2 drivers near its time', () => assert.equal(c({ need: 1, startMs: NOW + 10 * MIN }), 'red'));
test('green: covered (any time)', () => {
  assert.equal(c({ need: 0 }), 'green');
  assert.equal(c({ need: 0, startMs: NOW - 20 * MIN, status: 'confirmed' }), 'green');
});
test('green: picked up / on the way', () => assert.equal(c({ status: 'picked_up', need: 0, startMs: NOW - 40 * MIN }), 'green'));
test('red: store replied CANCEL and it was not cancelled', () => assert.equal(c({ need: 0, storeCancelOpen: true }), 'red'));
test('orange: needs confirmation within 3 h', () => {
  assert.equal(c({ confirmationPending: true, startMs: NOW + 180 * MIN }), 'orange');
  assert.equal(c({ confirmationPending: true, startMs: NOW + 20 * MIN }), 'orange');
});
test('hidden: needs confirmation more than 3 h away', () => assert.equal(c({ confirmationPending: true, startMs: NOW + 6 * 60 * MIN }), 'hidden'));
test('red: needs confirmation and its time passed', () => assert.equal(c({ confirmationPending: true, startMs: NOW - 1 * MIN }), 'red'));
test('red: held food check with no answer', () => {
  assert.equal(c({ confirmationPending: true, foodCheckAlert: true, startMs: NOW + 5 * 60 * MIN }), 'red');
});
test('agoText', () => {
  assert.equal(agoText(NOW - 20e3, NOW), 'just now');
  assert.equal(agoText(NOW - 12 * MIN, NOW), '12 min ago');
  assert.equal(agoText(NOW - 65 * MIN, NOW), '1 h 5 min ago');
  assert.equal(agoText(NOW - 120 * MIN, NOW), '2 h ago');
  assert.equal(agoText(NOW - 200 * MIN, NOW), '3 h ago');
});

test('drop-off steady day is quiet grey, never red (Oct 22)', () => {
  const now = Date.parse('2026-10-22T14:00:00');
  assert.equal(pickupColor({ status: 'scheduled', cancelled: false, confirmationPending: false, startMs: now - 3600_000, nowMs: now, need: 1, dropOffOnly: true }), 'grey');
});

// Oct 22 client: finished rows stay, but calm (no grey): a small muted pill.
test('finished pill: done with time, no kiosk, cancelled, missed, expired, drop-off day', () => {
  assert.equal(finishedPill({ status: 'completed', cancelled: false, doneAt: '2026-10-21T18:40:00Z' }).text, '✓ Done 2:40 PM');
  assert.equal(finishedPill({ status: 'completed', cancelled: false }).text, '✓ Done');
  assert.equal(finishedPill({ status: 'completed', cancelled: false, noKiosk: true }).kind, 'nokiosk');
  assert.equal(finishedPill({ status: 'completed', cancelled: false, noKiosk: true }).text, '✓ Done (no kiosk)'); // Oct 23: one word map
  assert.equal(finishedPill({ status: 'cancelled', cancelled: true }).text, 'Cancelled');
  assert.equal(finishedPill({ status: 'cancelled', cancelled: true, cancelReason: 'No drop-off today' }).text, 'No drop-off today');
  assert.equal(finishedPill({ status: 'missed', cancelled: true, cancelReason: 'marked missed by Chaya' }).text, 'Missed');
  assert.equal(finishedPill({ status: 'missed', cancelled: true, cancelReason: 'expired — no driver' }).text, 'Expired');
  assert.equal(finishedPill({ status: 'scheduled', cancelled: false, openLabel: 'Driver on it' }).kind, 'quiet');
});
