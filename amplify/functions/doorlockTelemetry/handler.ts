import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import type { Schema } from '../../data/resource';
import { discordWebhookUrl, parseRfidEvent } from './event';

// Amplify injects these variables and IAM permissions via allow.resource().
type DataEnv = Parameters<typeof getAmplifyDataClientConfig>[0];
const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(process.env as DataEnv);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>({ authMode: 'iam' });

export async function handler(input: unknown) {
  const event = parseRfidEvent(input);
  const { data: device, errors: deviceErrors } = await client.models.Devices.get({ deviceId: event.deviceId });
  if (deviceErrors?.length) throw new Error('Device lookup failed');
  if (!device?.owner) throw new Error(`Register device ${event.deviceId} with an owner first`);

  const key = { deviceId: event.deviceId, eventId: event.eventId };
  const { data: existing, errors: lookupErrors } = await client.models.Telemetry.get(key);
  if (lookupErrors?.length) throw new Error('Event lookup failed');
  if (existing) return { duplicate: true, ...key };

  // Never accept owner or tags from MQTT: use the registered device instead.
  const { data: saved, errors } = await client.models.Telemetry.create({
    ...event, owner: device.owner, tags: device.tags ?? [],
  });
  if (errors?.length || !saved) {
    // Concurrent IoT retries may both pass the initial lookup.
    const check = await client.models.Telemetry.get(key);
    if (!check.errors?.length && check.data) return { duplicate: true, ...key };
    throw new Error('GraphQL event creation failed');
  }
  console.info('RFID event stored', key);

  if (!event.granted && device.notifyDenied && device.webhookUrl) {
    try {
      const response = await fetch(discordWebhookUrl(device.webhookUrl), {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `Nekat kortförsök på ${event.deviceId}: ${event.uid} (${event.timestamp})`,
          allowed_mentions: { parse: [] },
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      console.info('Webhook delivered', key);
    } catch {
      // The event is already saved. A notification failure must not duplicate it.
      // Do not log the webhook token/URL.
      console.warn('Webhook failed; event remains saved', key);
    }
  }
  return { stored: true, ...key };
}
