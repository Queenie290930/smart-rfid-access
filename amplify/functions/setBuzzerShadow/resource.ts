import { defineFunction } from '@aws-amplify/backend';
export const setBuzzerShadow = defineFunction({
  name: 'setBuzzerShadow', entry: './handler.ts', resourceGroupName: 'data', timeoutSeconds: 30,
});
