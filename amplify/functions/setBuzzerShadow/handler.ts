import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { UpdateThingShadowCommand } from '@aws-sdk/client-iot-data-plane';
import type { Schema } from '../../data/resource';
import { getIotDataClient } from '../shadow/iotClient';
import { requestBuzzerChange } from '../shadow/shared';

type DataEnv = Parameters<typeof getAmplifyDataClientConfig>[0];
const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(process.env as DataEnv);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>({ authMode: 'iam' });

export const handler: Schema['SetBuzzer']['functionHandler'] = async event => {
  const userId = event.identity && 'sub' in event.identity ? event.identity.sub : undefined;
  await requestBuzzerChange({ ...event.arguments, userId }, {
    async getOwner(deviceId) {
      const result = await client.models.Devices.get({ deviceId });
      if (result.errors?.length) throw new Error('Device lookup failed');
      return result.data?.owner;
    },
    async updateDesired(deviceId, enabled) {
      const iot = await getIotDataClient();
      await iot.send(new UpdateThingShadowCommand({
        thingName: deviceId,
        payload: Buffer.from(JSON.stringify({ state: { desired: { buzzerEnabled: enabled } } })),
      }));
    },
  });
  console.info('Buzzer setting requested', { deviceId: event.arguments.deviceId, enabled: event.arguments.buzzerEnabled });
  // Confirmation of application comes from reported state, not this return value.
  return true;
};
