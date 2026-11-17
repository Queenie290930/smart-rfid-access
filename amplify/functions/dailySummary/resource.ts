import { defineFunction } from '@aws-amplify/backend';

export const dailySummary = defineFunction({
  name: 'doorlockDailySummary',
  entry: './handler.ts',
  resourceGroupName: 'data',
  timeoutSeconds: 120,
});
