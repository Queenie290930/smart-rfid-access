import test from 'node:test';
import assert from 'node:assert/strict';
import { parseShadowSnapshot, requestBuzzerChange } from '../amplify/functions/shadow/shared.ts';

test('owner can disable the buzzer; false is sent as a real boolean', async () => {
  const calls = [];
  await requestBuzzerChange({ deviceId: 'doorlock-01', userId: 'owner', buzzerEnabled: false }, {
    getOwner: async () => 'owner', updateDesired: async (...args) => { calls.push(args); },
  });
  assert.deepEqual(calls, [['doorlock-01', false]]);
});

test('another owner or malformed arguments cannot change hardware state', async () => {
  for (const change of [{ userId: 'other' }, { userId: undefined }, { buzzerEnabled: 'false' }, { deviceId: 'another-thing' }]) {
    let called = false;
    await assert.rejects(requestBuzzerChange({ deviceId: 'doorlock-01', userId: 'owner', buzzerEnabled: true, ...change }, {
      getOwner: async () => 'owner', updateDesired: async () => { called = true; },
    }));
    assert.equal(called, false);
  }
});

test('unknown devices are not assigned to the calling user', async () => {
  await assert.rejects(requestBuzzerChange({ deviceId: 'doorlock-01', userId: 'owner', buzzerEnabled: true }, {
    getOwner: async () => null, updateDesired: async () => assert.fail('must not update'),
  }), /Not the device owner/);
});

test('desired and reported remain distinct; missing reported is not treated as false', () => {
  const snapshot = { version: 3, timestamp: 1794913200, state: { desired: { buzzerEnabled: false } } };
  assert.deepEqual(parseShadowSnapshot(snapshot), {
    desired: false, reported: null, version: 3, updatedAt: new Date(snapshot.timestamp * 1000).toISOString(),
  });
  assert.equal(parseShadowSnapshot({ ...snapshot, state: { ...snapshot.state, reported: { buzzerEnabled: true } } }).reported, true);
  assert.throws(() => parseShadowSnapshot({ ...snapshot, state: { reported: { buzzerEnabled: 'false' } } }));
  assert.throws(() => parseShadowSnapshot({ ...snapshot, version: -1 }));
});
