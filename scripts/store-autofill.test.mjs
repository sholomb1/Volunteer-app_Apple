// Oct 16 client: New pickup store autofill helpers.
// Run: node --experimental-strip-types --test scripts/store-autofill.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { addressFromStoreName, storeFillAddress, moveHighlight, enterPickIndex } from '../src/store-autofill.ts';

test('address inside the store name', () => {
  assert.equal(addressFromStoreName('Stamford Yeshiva - 51 Carlton Rd'), '51 Carlton Rd');
  assert.equal(addressFromStoreName('Satmar Yeshiva - 35 Brockton'), '35 Brockton');
  assert.equal(addressFromStoreName('Viznitz - 20 Ashel Ln.'), '20 Ashel Ln.');
  assert.equal(addressFromStoreName('Shul – 12A Main St, Monsey'), '12A Main St, Monsey');
  assert.equal(addressFromStoreName('Borov - Guttesman'), '');
  assert.equal(addressFromStoreName('381 Viola - Yoily Tabak'), '');
  assert.equal(addressFromStoreName('Hall - 2nd floor'), '');
  assert.equal(addressFromStoreName('Kroger Airmont'), '');
  assert.equal(addressFromStoreName(null), '');
});

test('saved address wins over the name', () => {
  assert.equal(storeFillAddress('51 Carlton Road, Monsey', 'Stamford Yeshiva - 51 Carlton Rd'), '51 Carlton Road, Monsey');
  assert.equal(storeFillAddress('', 'Stamford Yeshiva - 51 Carlton Rd'), '51 Carlton Rd');
  assert.equal(storeFillAddress('  ', 'Kroger'), '');
});

test('arrow keys and Enter in the supplier list', () => {
  assert.equal(moveHighlight(-1, 1, 3), 0);
  assert.equal(moveHighlight(0, 1, 3), 1);
  assert.equal(moveHighlight(2, 1, 3), 2);
  assert.equal(moveHighlight(0, -1, 3), 0);
  assert.equal(moveHighlight(-1, -1, 3), 2);
  assert.equal(moveHighlight(1, 1, 0), -1);
  assert.equal(enterPickIndex(1, 3, 'st'), 1);
  assert.equal(enterPickIndex(-1, 3, 'stam'), 0);
  assert.equal(enterPickIndex(-1, 3, ''), -1);
  assert.equal(enterPickIndex(-1, 0, 'zzz'), -1);
});
