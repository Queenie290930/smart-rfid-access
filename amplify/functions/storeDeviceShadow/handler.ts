import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { GetThingShadowCommand } from '@aws-sdk/client-iot-data-plane';
import type { Schema } from '../../data/resource';
import { getIotDataClient } from '../shadow/iotClient';
import { parseShadowSnapshot, SHADOW_DEVICE_ID } from '../shadow/shared';

type DataEnv = Parameters<typeof getAmplifyDataClientConfig>[0];
const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(process.env as DataEnv);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>({ authMode: 'iam' });

export async function handler(event: { deviceId?: string }) {
  if (event?.deviceId !== SHADOW_DEVICE_ID) throw new Error('Unknown shadow device');
  const deviceId = event.deviceId;
  const device = await client.models.Devices.get({ deviceId });
  if (device.errors?.length || !device.data?.owner) throw new Error('Register the device first');
  // Read the current document: queued MQTT events can arrive out of order.
  const iot = await getIotDataClient();
  const response = await iot.send(new GetThingShadowCommand({ thingName: deviceId }));
  const shadow = parseShadowSnapshot(JSON.parse(Buffer.from(response.payload ?? []).toString('utf8')));
  if ((device.data.shadowVersion ?? -1) >= shadow.version) return { skipped: true };
  const result = await client.models.Devices.update({
    deviceId, shadowDesiredBuzzer: shadow.desired, shadowReportedBuzzer: shadow.reported,
    shadowVersion: shadow.version, shadowUpdatedAt: shadow.updatedAt,
  });
  if (result.errors?.length || !result.data) throw new Error('Shadow mirror update failed');
  console.info('Shadow mirrored', { deviceId, version: shadow.version, reported: shadow.reported });
  return { stored: true, version: shadow.version };
}
