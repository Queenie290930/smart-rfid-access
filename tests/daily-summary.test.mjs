import test from 'node:test';
import assert from 'node:assert/strict';
import { previousStockholmDay, runDailySummaries } from '../amplify/functions/dailySummary/summary.ts';

test('yesterday is the Stockholm calendar date, including month/year boundaries', () => {
  const period = previousStockholmDay(new Date('2027-01-01T07:00:00Z'));
  assert.equal(period.date, '2026-12-31');
  assert.equal(new Date(period.start).toISOString(), '2026-12-30T23:00:00.000Z');
  assert.equal(new Date(period.end).toISOString(), '2026-12-31T23:00:00.000Z');
  assert.equal(previousStockholmDay(new Date('2026-11-17T23:30:00Z')).date, '2026-11-17');
  assert.throws(() => previousStockholmDay(new Date('invalid')));
});

test('daylight saving days contain 23 or 25 hours, not a fixed 24', () => {
  const spring = previousStockholmDay(new Date('2026-03-30T06:00:00Z'));
  assert.equal(spring.date, '2026-03-29');
  assert.equal(spring.end - spring.start, 23 * 3600000);
  const autumn = previousStockholmDay(new Date('2026-10-26T07:00:00Z'));
  assert.equal(autumn.date, '2026-10-25');
  assert.equal(autumn.end - autumn.start, 25 * 3600000);
});

const period = previousStockholmDay(new Date('2026-11-17T07:00:00Z'));
const device = { deviceId: 'doorlock-01', owner: 'owner-a', webhookUrl: 'https://discord.com/api/webhooks/123/test', notifyDailySummary: true };
function fixture(devices = [device], events = []) {
  const messages = [];
  const delivered = [];
  return { messages, delivered, dependencies: {
    async *devices() { yield* devices; },
    async *events() { yield* events; },
    async send(value, content) { messages.push({ deviceId: value.deviceId, content }); },
    async markDelivered(value, date) { delivered.push({ deviceId: value.deviceId, date }); },
  } };
}

test('counts more than 100 events; excludes another owner and the next midnight', async () => {
  const events = Array.from({ length: 151 }, (_, i) => ({
    owner: 'owner-a', receivedAt: period.start + i, granted: i < 100,
  }));
  events.push({ owner: 'owner-b', receivedAt: period.start, granted: false });
  events.push({ owner: 'owner-a', receivedAt: period.end, granted: false });
  events.push({ owner: 'owner-a', receivedAt: period.start - 1, granted: false });
  const f = fixture([device], events);
  const result = await runDailySummaries(period, f.dependencies);
  assert.equal(result.sent, 1);
  assert.match(f.messages[0].content, /Kortförsök: 151\nGodkända: 100\nNekade: 51/);
  assert.deepEqual(f.delivered, [{ deviceId: 'doorlock-01', date: '2026-11-16' }]);
});

test('sends a zero report when opted in; skips disabled or already delivered devices', async () => {
  const f = fixture([
    device,
    { ...device, deviceId: 'off', notifyDailySummary: false },
    { ...device, deviceId: 'done', lastDailySummaryDate: period.date },
    { ...device, deviceId: 'newer', lastDailySummaryDate: '2026-11-17' },
    { ...device, deviceId: 'no-owner', owner: null },
    { ...device, deviceId: 'no-url', webhookUrl: null },
  ]);
  assert.deepEqual(await runDailySummaries(period, f.dependencies), { date: period.date, sent: 1, skipped: 5 });
  assert.match(f.messages[0].content, /Kortförsök: 0/);
});

test('failed webhook is not marked delivered, and other devices still get processed', async () => {
  const f = fixture([device, { ...device, deviceId: 'doorlock-02' }]);
  const normalSend = f.dependencies.send;
  f.dependencies.send = async (value, content) => {
    if (value.deviceId === 'doorlock-01') throw new Error('Discord unavailable');
    return normalSend(value, content);
  };
  await assert.rejects(runDailySummaries(period, f.dependencies), /failed for 1 device/);
  assert.deepEqual(f.delivered, [{ deviceId: 'doorlock-02', date: period.date }]);
});

test('database read failure cannot send a misleading partial report', async () => {
  const f = fixture();
  f.dependencies.events = async function* () {
    yield { owner: device.owner, receivedAt: period.start, granted: true };
    throw new Error('Next page query failed');
  };
  await assert.rejects(runDailySummaries(period, f.dependencies));
  assert.equal(f.messages.length, 0);
  assert.equal(f.delivered.length, 0);
});
