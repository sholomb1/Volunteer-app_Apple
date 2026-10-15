// Oct 14 client: unit tests for the phone app update pop-up decision.
// Run: node --test scripts/app-version-check.test.mjs   (Node 22.18+: loads the .ts directly)
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};

const m = await import('../src/app-version-check.ts');
const { decideUpdatePopup, snoozeUpdatePopup, getLaterUntil, noteNewerVersion, LATER_MS } = m;
const DAY = 86400e3;
const NOW = Date.UTC(2026, 9, 14, 12);
const base = { installed: 34, isAndroid: true, remoteCode: 34, firstSeenAt: null, latestAndroid: null, appMin: null, laterUntil: null, now: NOW };

test('not due: same version', () => assert.equal(decideUpdatePopup(base), 'none'));
test('not due: newer but under 3 days', () =>
  assert.equal(decideUpdatePopup({ ...base, remoteCode: 35, firstSeenAt: NOW - 2 * DAY }), 'none'));
test('not due: no install code (web / unknown)', () =>
  assert.equal(decideUpdatePopup({ ...base, installed: 0, remoteCode: 35, firstSeenAt: NOW - 10 * DAY }), 'none'));
test('due: newer for 3+ days', () =>
  assert.equal(decideUpdatePopup({ ...base, remoteCode: 35, firstSeenAt: NOW - 3 * DAY }), 'ask'));
test('due: Android portal setting android_latest_version_code higher', () =>
  assert.equal(decideUpdatePopup({ ...base, latestAndroid: 35 }), 'ask'));
test('not due: android_latest_version_code ignored on iPhone', () =>
  assert.equal(decideUpdatePopup({ ...base, isAndroid: false, latestAndroid: 35 }), 'none'));
test('Later snooze: hidden for 24h, back after', () => {
  const until = snoozeUpdatePopup(NOW);
  assert.equal(until, NOW + LATER_MS);
  assert.equal(getLaterUntil(), until);
  const due = { ...base, remoteCode: 35, firstSeenAt: NOW - 4 * DAY, laterUntil: until };
  assert.equal(decideUpdatePopup({ ...due, now: NOW + 23 * 3600e3 }), 'none');
  assert.equal(decideUpdatePopup({ ...due, now: NOW + 24 * 3600e3 }), 'ask');
});
test('forced: 30+ days behind (ignores Later)', () =>
  assert.equal(decideUpdatePopup({ ...base, remoteCode: 35, firstSeenAt: NOW - 30 * DAY, laterUntil: NOW + DAY }), 'force'));
test('forced: app_min_version_code higher (both phones, ignores Later)', () => {
  assert.equal(decideUpdatePopup({ ...base, appMin: 35, laterUntil: NOW + DAY }), 'force');
  assert.equal(decideUpdatePopup({ ...base, isAndroid: false, appMin: 35 }), 'force');
});
test('not forced: app_min_version_code equal or lower', () =>
  assert.equal(decideUpdatePopup({ ...base, appMin: 34 }), 'none'));
test('noteNewerVersion keeps the first-seen time and resets when up to date', () => {
  assert.equal(noteNewerVersion(34, 35, NOW), NOW);
  assert.equal(noteNewerVersion(34, 35, NOW + DAY), NOW);
  assert.equal(noteNewerVersion(34, 34, NOW + DAY), null);
  assert.equal(noteNewerVersion(34, 35, NOW + 2 * DAY), NOW + 2 * DAY);
});
