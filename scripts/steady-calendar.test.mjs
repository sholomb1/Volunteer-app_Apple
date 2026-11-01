// Oct 23 client: neater Steady weekly calendar (src/steady-calendar.ts).
// Run: node --test scripts/steady-calendar.test.mjs   (Node 22.18+: loads the .ts directly)
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { cardNames, flyerNames, coverageColor, driversShort, shortTime, groupByDay, visibleDays, dayHeader, startDay, stepDay, coverageLabel } = await import('../src/steady-calendar.ts');
const { tidyPlaceName } = await import('../src/pickup-label.ts');

test('one clean name: drop the store when it repeats the steady name', () => {
  assert.deepEqual(cardNames('Bravo', 'Bravo Pizza (K)', tidyPlaceName), { title: 'Bravo Pizza (K)', sub: '' });
  assert.deepEqual(cardNames('Hive Deli', 'Hive Deli', tidyPlaceName), { title: 'Hive Deli', sub: '' });
  assert.deepEqual(cardNames('hive  DELI', 'Hive Deli', tidyPlaceName), { title: 'Hive Deli', sub: '' });
  assert.deepEqual(cardNames('Beis Mikrah', 'Beis Mikra', tidyPlaceName), { title: 'Beis Mikrah', sub: '' });
  assert.deepEqual(cardNames('Stamford Yeshiva - 51 Carlton Rd', 'Stamford Yeshiva', tidyPlaceName), { title: 'Stamford Yeshiva', sub: '' });
  assert.deepEqual(cardNames('The Hive', 'Hive Discount Store', tidyPlaceName), { title: 'The Hive', sub: 'Hive Discount Store' });
  assert.deepEqual(cardNames('Ohr Yosef', null, tidyPlaceName), { title: 'Ohr Yosef', sub: '' });
  assert.deepEqual(cardNames('', 'Rivermill', tidyPlaceName), { title: 'Rivermill', sub: '' });
});

test('one color per card', () => {
  assert.equal(coverageColor({ coverage_status: 'committed' }), 'green');
  assert.equal(coverageColor({ coverage_status: 'ending_soon' }), 'green');
  assert.equal(coverageColor({ coverage_status: 'needs_steady_driver' }), 'red');
  assert.equal(coverageColor({ coverage_status: 'temporarily_covered' }), 'orange');
  assert.equal(coverageColor({ coverage_status: 'paused' }), 'grey');
  assert.equal(coverageColor({ coverage_status: 'committed', pickup_type: 'dropoff' }), 'grey');
  assert.equal(coverageColor({ coverage_status: 'future_scheduled' }), 'neutral');
  assert.equal(coverageLabel('temporarily_covered'), 'Covered this week only');
});

test('drivers, time', () => {
  assert.equal(driversShort([]), '');
  assert.equal(driversShort(null), '');
  assert.equal(driversShort(['Moshe K.']), 'Moshe K.');
  assert.equal(driversShort(['Moshe K.', 'Avi R.']), 'Moshe K. +1');
  assert.equal(shortTime('09:00:00'), '9:00 AM');
  assert.equal(shortTime('13:30'), '1:30 PM');
  assert.equal(shortTime(null), '');
});

test('days: sorted by time, empty days hidden, headers', () => {
  const r = (d, t, n, s = 'committed') => ({ steady_pickup_id: 1, name: n, suppliers: null, pickup_time: t, day_of_week: d, coverage_status: s });
  const by = groupByDay([r(2, '13:00:00', 'B'), r(2, '09:00:00', 'A', 'needs_steady_driver'), r(0, null, 'Z'), r(0, '08:00:00', 'Y')]);
  assert.deepEqual(by[2].map((x) => x.name), ['A', 'B']);
  assert.deepEqual(by[0].map((x) => x.name), ['Y', 'Z']);
  assert.deepEqual(visibleDays(by), [0, 2]);
  assert.equal(dayHeader('Tue', by[2]), 'TUE · 2 · ⚠️ 1 need driver');
  assert.equal(dayHeader('Sun', by[0]), 'SUN · 2');
  assert.equal(startDay([0, 2, 4], 2), 2);
  assert.equal(startDay([0, 2, 4], 6), 0);
  assert.equal(startDay([0, 2, 4], 3), 4);
  assert.equal(stepDay([0, 2, 4], 4, 1), 0);
  assert.equal(stepDay([0, 2, 4], 0, -1), 4);
});

// Oct 23 client: a steady timed from candle lighting sorts by this Friday's time.
test('candle Friday card sorts by its computed time', () => {
  const rows = [
    { steady_pickup_id: 1, name: 'A', suppliers: null, pickup_time: '15:00:00', day_of_week: 5, coverage_status: 'committed' },
    { steady_pickup_id: 2, name: 'Bakery', suppliers: null, pickup_time: '16:00:00', day_of_week: 5, coverage_status: 'committed',
      candle: { time: '14:25', label: '2 h before candles', text: '2 h before candles (Fri 2:25 PM)' } },
  ];
  assert.deepEqual(groupByDay(rows)[5].map((r) => r.name), ['Bakery', 'A']);
});

// Oct 28 client: the flyer shows ONE clear name per pickup.
test('flyer: one clear name per pickup', () => {
  assert.deepEqual(flyerNames('Bravo', 'Bravo Pizza (K)', tidyPlaceName), { title: 'Bravo Pizza (K)', sub: '' });
  assert.deepEqual(flyerNames('The Hive', 'Hive Discount Store', tidyPlaceName), { title: 'Hive Discount Store', sub: '' });
  assert.deepEqual(flyerNames('Hive Deli', 'Hive Deli', tidyPlaceName), { title: 'Hive Deli', sub: '' });
  assert.deepEqual(flyerNames('Ohr Yosef', null, tidyPlaceName), { title: 'Ohr Yosef', sub: '' });
  assert.deepEqual(flyerNames('Shul Kiddush', 'Evergreen', tidyPlaceName), { title: 'Shul Kiddush', sub: 'Evergreen' });
});
