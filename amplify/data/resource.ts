import { a, defineData, type ClientSchema } from '@aws-amplify/backend';
import { doorlockTelemetry } from '../functions/doorlockTelemetry/resource';
import { dailySummary } from '../functions/dailySummary/resource';
import { setBuzzerShadow } from '../functions/setBuzzerShadow/resource';
import { storeDeviceShadow } from '../functions/storeDeviceShadow/resource';

const schema = a.schema({
  Devices: a.model({
    deviceId: a.string().required(),
    name: a.string().required(),
    tags: a.string().array(),
    owner: a.string(),
    webhookUrl: a.string(),
    notifyDenied: a.boolean(),
    notifyDailySummary: a.boolean(),
    lastDailySummaryDate: a.date(),
    shadowDesiredBuzzer: a.boolean(),
    shadowReportedBuzzer: a.boolean(),
    shadowVersion: a.integer(),
    shadowUpdatedAt: a.datetime(),
  }).identifier(['deviceId']).authorization((allow) => [
    allow.ownerDefinedIn('owner').identityClaim('sub'),
  ]),
  Telemetry: a.model({
    deviceId: a.string().required(),
    eventId: a.string().required(),
    timestamp: a.datetime().required(),
    receivedAt: a.float().required(),
    uid: a.string().required(),
    granted: a.boolean().required(),
    tags: a.string().array(),
    owner: a.string().required(),
  }).identifier(['deviceId', 'eventId']).secondaryIndexes((index) => [
    index('deviceId').sortKeys(['receivedAt']).queryField('eventsByDeviceAndTime'),
  ]).authorization((allow) => [
    // Browser users can read their events; only the ingestion function writes them.
    allow.ownerDefinedIn('owner').identityClaim('sub').to(['read']),
  ]),
  SetBuzzer: a.mutation()
    .arguments({ deviceId: a.string().required(), buzzerEnabled: a.boolean().required() })
    .returns(a.boolean())
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(setBuzzerShadow)),
}).authorization((allow) => [
  allow.resource(doorlockTelemetry).to(['query', 'mutate']),
  allow.resource(dailySummary).to(['query', 'mutate']),
  allow.resource(setBuzzerShadow).to(['query']),
  allow.resource(storeDeviceShadow).to(['query', 'mutate']),
]);

export type Schema = ClientSchema<typeof schema>;
export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'userPool' },
});
