import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAYMENT_GRACE_DAYS, effectivePriceCents } from '../../public/functions/api/_utils/payments.js';

test('PAYMENT_GRACE_DAYS is 7 (D5 -- until the 7th of the month)', () => {
  assert.equal(PAYMENT_GRACE_DAYS, 7);
});

test('effectivePriceCents returns the override when set', () => {
  assert.equal(effectivePriceCents({ priceOverrideCents: 40000, planPriceCents: 55000 }), 40000);
});

test('effectivePriceCents returns the plan price when the override is null', () => {
  assert.equal(effectivePriceCents({ priceOverrideCents: null, planPriceCents: 55000 }), 55000);
});

test('effectivePriceCents returns the plan price when the override is undefined', () => {
  assert.equal(effectivePriceCents({ planPriceCents: 80000 }), 80000);
});

test('effectivePriceCents treats an override of 0 as a real override, not "unset"', () => {
  // A free family-discount slot is a legitimate override -- 0 !== null/undefined.
  assert.equal(effectivePriceCents({ priceOverrideCents: 0, planPriceCents: 55000 }), 0);
});
