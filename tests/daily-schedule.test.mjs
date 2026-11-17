import test from 'node:test';
import { App, Stack, aws_lambda as lambda } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { createDailySummarySchedule } from '../amplify/schedules/dailySummary.ts';

test('synthesizes an 08:00 Stockholm schedule with only its target Lambda invocation permission', () => {
  const app = new App({ outdir: '/private/tmp/doorlock-summary-cdk-test' });
  const stack = new Stack(app, 'ScheduleTest', { env: { account: '123456789012', region: 'eu-north-1' } });
  const arn = 'arn:aws:lambda:eu-north-1:123456789012:function:testDailySummary';
  createDailySummarySchedule(stack, lambda.Function.fromFunctionArn(stack, 'Target', arn));
  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::Scheduler::Schedule', 1);
  template.hasResourceProperties('AWS::Scheduler::Schedule', {
    ScheduleExpression: 'cron(0 8 * * ? *)', ScheduleExpressionTimezone: 'Europe/Stockholm',
    FlexibleTimeWindow: { Mode: 'OFF' }, State: 'ENABLED',
    Target: Match.objectLike({ Arn: arn, Input: '{"scheduledTime":"<aws.scheduler.scheduled-time>"}' }),
  });
  template.hasResourceProperties('AWS::IAM::Role', {
    AssumeRolePolicyDocument: { Version: '2012-10-17', Statement: [Match.objectLike({
      Principal: { Service: 'scheduler.amazonaws.com' },
      Condition: { StringEquals: {
        'aws:SourceAccount': '123456789012',
        'aws:SourceArn': { 'Fn::GetAtt': [Match.anyValue(), 'Arn'] },
      } },
    })] },
    Policies: [{ PolicyName: 'InvokeDailySummary', PolicyDocument: {
      Version: '2012-10-17', Statement: [{ Action: 'lambda:InvokeFunction', Effect: 'Allow', Resource: arn }],
    } }],
  });
});
