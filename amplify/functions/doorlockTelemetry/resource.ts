import { defineFunction } from '@aws-amplify/backend';

export const doorlockTelemetry = defineFunction({
  name: 'doorlockTelemetry',
  entry: './handler.ts',
  resourceGroupName: 'data',
  timeoutSeconds: 30,
});
