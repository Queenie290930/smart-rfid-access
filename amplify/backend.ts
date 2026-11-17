import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { doorlockTelemetry } from './functions/doorlockTelemetry/resource';
import { dailySummary } from './functions/dailySummary/resource';
import { createDailySummarySchedule } from './schedules/dailySummary';

// Existing REST API and DoorLockLogs remain separate during migration.
const backend = defineBackend({ auth, data, doorlockTelemetry, dailySummary });
const schedule = createDailySummarySchedule(
  backend.createStack('daily-summary-schedule'), backend.dailySummary.resources.lambda,
);
backend.addOutput({ custom: { dailySummaryScheduleName: schedule.ref } });
