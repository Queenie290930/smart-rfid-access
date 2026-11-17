import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRfidEvent, discordWebhookUrl } from '../amplify/functions/doorlockTelemetry/event.ts';

const event = { deviceId: 'doorlock-01', eventId: 'boot-2', uid: '43fe3c16', granted: false, timestamp: 1794753973046 };
test('IoT timestamp is normalized; false stays false and MQTT owner is ignored', () => {
  const result = parseRfidEvent({ ...event, owner: 'attacker', tags: ['spoofed'] });
  assert.equal(result.granted, false);
  assert.equal(result.uid, '43FE3C16');
  assert.equal(result.receivedAt, event.timestamp);
  assert.equal(result.timestamp, new Date(event.timestamp).toISOString());
  assert.equal('owner' in result, false);
  assert.equal('tags' in result, false);
});
test('rejects malformed events instead of guessing a timestamp or truthy status', () => {
  for (const change of [{ granted: 'false' }, { timestamp: undefined }, { timestamp: 1e100 }, { uid: 'not-a-uid' }, { deviceId: '../other' }]) {
    assert.throws(() => parseRfidEvent({ ...event, ...change }));
  }
});
test('webhooks only allow Discord HTTPS endpoints and no redirects to arbitrary hosts', () => {
  assert.equal(discordWebhookUrl('https://discord.com/api/webhooks/123/example_token'), 'https://discord.com/api/webhooks/123/example_token');
  for (const url of ['http://discord.com/api/webhooks/123/token', 'https://localhost/api/webhooks/123/token', 'https://discord.com.evil.test/api/webhooks/123/token', 'https://discord.com/api/webhooks/123/token?x=y']) {
    assert.throws(() => discordWebhookUrl(url));
  }
});
