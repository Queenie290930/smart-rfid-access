import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import type { Schema } from '../../data/resource';
import { discordWebhookUrl } from '../doorlockTelemetry/event';
import { previousStockholmDay, runDailySummaries, type SummaryDependencies } from './summary';

type DataEnv = Parameters<typeof getAmplifyDataClientConfig>[0];
const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(process.env as DataEnv);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>({ authMode: 'iam' });

const dependencies: SummaryDependencies = {
  async *devices() {
    let nextToken: string | null | undefined;
    do {
      const page = await client.models.Devices.list({
        filter: { notifyDailySummary: { eq: true } }, limit: 100, nextToken,
      });
      if (page.errors?.length) throw new Error('Summary device query failed');
      yield* page.data;
      nextToken = page.nextToken;
    } while (nextToken);
  },
  async *events(device, period) {
    let nextToken: string | null | undefined;
    do {
      const page = await client.models.Telemetry.eventsByDeviceAndTime({
        deviceId: device.deviceId,
        receivedAt: { between: [period.start, period.end - 1] },
      }, { limit: 500, nextToken, filter: { owner: { eq: device.owner! } } });
      if (page.errors?.length) throw new Error('Summary event query failed');
      yield* page.data;
      nextToken = page.nextToken;
    } while (nextToken);
  },
  async send(device, content) {
    const response = await fetch(discordWebhookUrl(device.webhookUrl!), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    });
    if (!response.ok) throw new Error(`Discord HTTP ${response.status}`);
  },
  async markDelivered(device, date) {
    const result = await client.models.Devices.update({
      deviceId: device.deviceId, lastDailySummaryDate: date,
    });
    if (result.errors?.length || !result.data) throw new Error('Summary delivery marker failed');
  },
};

export async function handler(input: { scheduledTime?: string } = {}) {
  // Scheduler provides the original scheduled time so a delayed retry keeps its day.
  // A console test with {} uses the current time and also sends a real report.
  const now = input.scheduledTime === undefined ? new Date() : new Date(input.scheduledTime);
  return runDailySummaries(previousStockholmDay(now), dependencies);
}
