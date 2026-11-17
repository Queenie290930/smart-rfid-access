import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { doorlockTelemetry } from './functions/doorlockTelemetry/resource';

// Existing REST API and DoorLockLogs remain separate during migration.
defineBackend({ auth, data, doorlockTelemetry });
