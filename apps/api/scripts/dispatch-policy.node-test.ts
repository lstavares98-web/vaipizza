import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseCourierCandidate, isFreshCourierLocation, shouldEscalateDispatch } from '../src/modules/dispatch/dispatch.policy.ts';

const now = new Date('2026-08-31T20:00:00.000Z');

function candidate(overrides: Partial<any> = {}) {
  return {
    id: 'c1',
    lat: 41.5518,
    lng: -8.4229,
    locationUpdatedAt: new Date('2026-08-31T19:59:30.000Z'),
    recentOfferCount: 0,
    lastOfferedAt: null,
    ...overrides,
  };
}

test('stale GPS is not considered fresh', () => {
  assert.equal(isFreshCourierLocation(new Date('2026-08-31T19:57:00.000Z'), now, 120), false);
  assert.equal(isFreshCourierLocation(new Date('2026-08-31T19:59:00.000Z'), now, 120), true);
  assert.equal(isFreshCourierLocation(null, now, 120), false);
});

test('clearly nearest courier wins even if they received more recent offers', () => {
  const result = chooseCourierCandidate({ lat: 41.5518, lng: -8.4229 }, [
    candidate({ id: 'near', lat: 41.5520, recentOfferCount: 3 }),
    candidate({ id: 'far', lat: 41.5700, recentOfferCount: 0 }),
  ], now, 120);
  assert.equal(result?.id, 'near');
});

test('among similarly close couriers, fewer recent offers wins', () => {
  const result = chooseCourierCandidate({ lat: 41.5518, lng: -8.4229 }, [
    candidate({ id: 'busy', lat: 41.5520, recentOfferCount: 4 }),
    candidate({ id: 'fair', lat: 41.5530, recentOfferCount: 0 }),
  ], now, 120);
  assert.equal(result?.id, 'fair');
});

test('stale nearest courier is ignored', () => {
  const result = chooseCourierCandidate({ lat: 41.5518, lng: -8.4229 }, [
    candidate({ id: 'stale', lat: 41.5519, locationUpdatedAt: new Date('2026-08-31T19:55:00.000Z') }),
    candidate({ id: 'fresh', lat: 41.5540 }),
  ], now, 120);
  assert.equal(result?.id, 'fresh');
});


test('dispatch escalates at the configured failed-offer limit', () => {
  assert.equal(shouldEscalateDispatch(4, 5), false);
  assert.equal(shouldEscalateDispatch(5, 5), true);
  assert.equal(shouldEscalateDispatch(6, 5), true);
});
