import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { doorlockTelemetry } from './functions/doorlockTelemetry/resource';
import { dailySummary } from './functions/dailySummary/resource';
import { createDailySummarySchedule } from './schedules/dailySummary';
import { setBuzzerShadow } from './functions/setBuzzerShadow/resource';
import { storeDeviceShadow } from './functions/storeDeviceShadow/resource';
import { createShadowMirrorRule, grantShadowAccess } from './shadowInfrastructure';

// Existing REST API and DoorLockLogs remain separate during migration.
const backend = defineBackend({ auth, data, doorlockTelemetry, dailySummary, setBuzzerShadow, storeDeviceShadow });
const schedule = createDailySummarySchedule(
  backend.createStack('daily-summary-schedule'), backend.dailySummary.resources.lambda,
);
grantShadowAccess(backend.setBuzzerShadow.resources.lambda, 'iot:UpdateThingShadow');
grantShadowAccess(backend.storeDeviceShadow.resources.lambda, 'iot:GetThingShadow');
const shadowRule = createShadowMirrorRule(backend.createStack('shadow-mirror'), backend.storeDeviceShadow.resources.lambda);
backend.addOutput({ custom: {
  dailySummaryScheduleName: schedule.ref,
  shadowMirrorRuleName: shadowRule.ref,
} });
