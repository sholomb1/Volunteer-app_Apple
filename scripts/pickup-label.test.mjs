// Oct 22 client: pickups are named, never shown by an internal id (src/pickup-label.ts).
// Run: node --test scripts/pickup-label.test.mjs   (Node 22.18+: loads the .ts directly)
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { pickupLabel, pickupPlace, driverTextPrefill, dayWordFor, shortAddress, pickupWhen, tidyPlaceName, tidyAddress, driverShort } = await import('../src/pickup-label.ts');

test('Oct 22 neater Live Board: tidy names, short drivers', () => {
  assert.equal(tidyPlaceName('Stamford Yeshiva - 51 Carlton Rd'), 'Stamford Yeshiva');
  assert.equal(tidyPlaceName('21 Elener Lane, Spring Valley, NY, USA'), '21 Elener Lane');
  assert.equal(tidyPlaceName('Bravo Pizza (K)'), 'Bravo Pizza (K)');
  assert.equal(tidyPlaceName('7-Eleven'), '7-Eleven');
  assert.equal(pickupPlace({ suppliers: 'Stamford Yeshiva - 51 Carlton Rd' }), 'Stamford Yeshiva');
  assert.equal(pickupPlace({ contact_name: '21 Elener Lane, Spring Valley, NY, USA' }), '21 Elener Lane');
  assert.equal(tidyAddress('21 Elener Lane, Spring Valley, NY 10977, USA'), '21 Elener Lane, Spring Valley');
  assert.equal(driverShort('Yermia', 'Halberstam'), 'Yermia H.');
  assert.equal(driverShort('jonah', 'neuman'), 'jonah N.');
  assert.equal(driverShort('Moshe', ''), 'Moshe');
});
const TODAY = '2026-10-22'; // a Thursday

test('store name + 12 h time, today', () => {
  assert.equal(pickupLabel({ suppliers: 'Hive Discount Store', scheduled_date: TODAY, scheduled_time: '09:00:00' }, TODAY), 'Hive Discount Store · 9:00 AM');
});
test('no store: donor, then contact, then the short street address', () => {
  assert.equal(pickupPlace({ donor_name: 'Cohen family', contact_name: 'Rivky', pickup_address: '1 A St' }), 'Cohen family');
  assert.equal(pickupPlace({ contact_name: 'Rivky', pickup_address: '1 A St' }), 'Rivky');
  assert.equal(pickupPlace({ pickup_address: '17 Ravenna Dr, Monsey, NY 10952, USA' }), '17 Ravenna Dr');
  assert.equal(shortAddress('17 Ravenna Dr, Monsey, NY 10952, USA'), '17 Ravenna Dr');
  assert.equal(pickupPlace({ label: 'One-time pickup', pickup_address: '5 Main St, Monsey' }), '5 Main St');
});
test('nothing known: "Pickup", never an id', () => {
  assert.equal(pickupLabel({ scheduled_date: TODAY, scheduled_time: '00:52' }, TODAY), 'Pickup · 12:52 AM');
});
test('tomorrow / day of the week / far date', () => {
  assert.equal(dayWordFor('2026-10-23', TODAY), 'tomorrow');
  assert.equal(dayWordFor('2026-10-21', TODAY), 'yesterday');
  assert.equal(dayWordFor('2026-10-27', TODAY), 'Tue');
  assert.equal(dayWordFor('2026-11-30', TODAY), 'Nov 30');
  assert.equal(pickupLabel({ suppliers: 'Hive Deli', scheduled_date: '2026-10-23', scheduled_time: '16:00' }, TODAY), 'Hive Deli · tomorrow 4:00 PM');
  assert.equal(pickupWhen({ date: '2026-10-20', time: '16:30' }, TODAY), 'Tue Oct 20 · 4:30 PM'); // Oct 23: the one date + time format
});
test('Text box prefill names the pickup', () => {
  assert.equal(driverTextPrefill('Shmueli', { suppliers: 'Hive Deli', scheduled_date: TODAY, scheduled_time: '16:00:00' }, TODAY),
    'Hi Shmueli, about the Hive Deli pickup (4:00 PM): ');
  assert.equal(driverTextPrefill('Shmueli', { suppliers: 'Hive Deli', scheduled_date: '2026-10-20', scheduled_time: '16:00:00' }, TODAY),
    'Hi Shmueli, about the Hive Deli pickup (Tue 4:00 PM): ');
  assert.equal(driverTextPrefill('Shmueli', null, TODAY), 'Hi Shmueli, about your pickup: ');
  assert.doesNotMatch(driverTextPrefill('Avi', { pickup_address: '17 Ravenna Dr, Monsey', scheduled_date: TODAY, scheduled_time: '10:00' }, TODAY), /#/);
});
