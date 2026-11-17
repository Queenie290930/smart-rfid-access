import { defineFunction } from '@aws-amplify/backend';
export const storeDeviceShadow = defineFunction({
  name: 'storeDeviceShadow', entry: './handler.ts', resourceGroupName: 'data', timeoutSeconds: 30,
});
