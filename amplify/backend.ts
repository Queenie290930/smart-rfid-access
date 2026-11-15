import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';

// Loggarna läses från befintligt API Gateway/Lambda och DoorLockLogs.
// Amplify skapar endast resurserna för inloggning här.
defineBackend({ auth });
