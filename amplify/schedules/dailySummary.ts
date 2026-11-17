import { Stack, aws_iam as iam, aws_scheduler as scheduler } from 'aws-cdk-lib';
import type { IFunction } from 'aws-cdk-lib/aws-lambda';

export function createDailySummarySchedule(stack: Stack, target: IFunction) {
  const group = new scheduler.CfnScheduleGroup(stack, 'DoorLockReports');
  const role = new iam.Role(stack, 'SummarySchedulerRole', {
    assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com', {
      conditions: { StringEquals: {
        'aws:SourceAccount': stack.account,
        'aws:SourceArn': group.attrArn,
      } },
    }),
    inlinePolicies: { InvokeDailySummary: new iam.PolicyDocument({ statements: [
      new iam.PolicyStatement({ actions: ['lambda:InvokeFunction'], resources: [target.functionArn] }),
    ] }) },
  });
  return new scheduler.CfnSchedule(stack, 'DailySummaryAtEight', {
    groupName: group.ref,
    description: 'DoorLock: yesterday summary at 08:00 Europe/Stockholm',
    scheduleExpression: 'cron(0 8 * * ? *)',
    scheduleExpressionTimezone: 'Europe/Stockholm',
    flexibleTimeWindow: { mode: 'OFF' },
    state: 'ENABLED',
    target: {
      arn: target.functionArn,
      roleArn: role.roleArn,
      input: JSON.stringify({ scheduledTime: '<aws.scheduler.scheduled-time>' }),
      retryPolicy: { maximumRetryAttempts: 1, maximumEventAgeInSeconds: 3600 },
    },
  });
}
