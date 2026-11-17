import test from 'node:test';
import { App, Stack, aws_lambda as lambda } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { createShadowMirrorRule, grantShadowAccess } from '../amplify/shadowInfrastructure.ts';

test('shadow writer can update only doorlock-01 and IoT rule invokes only the mirror', () => {
  const app = new App({ outdir: '/private/tmp/doorlock-shadow-cdk-test' });
  const stack = new Stack(app, 'ShadowTest', { env: { account: '123456789012', region: 'eu-north-1' } });
  const target = new lambda.Function(stack, 'Writer', { runtime: lambda.Runtime.NODEJS_22_X, handler: 'index.handler', code: lambda.Code.fromInline('exports.handler = async () => true;') });
  grantShadowAccess(target, 'iot:UpdateThingShadow');
  createShadowMirrorRule(stack, target);
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::IAM::Policy', { PolicyDocument: Match.objectLike({ Statement: Match.arrayWith([
    Match.objectLike({ Action: 'iot:UpdateThingShadow', Resource: { 'Fn::Join': ['', [
      'arn:', { Ref: 'AWS::Partition' }, ':iot:eu-north-1:123456789012:thing/doorlock-01',
    ]] } }),
  ]) }) });
  template.hasResourceProperties('AWS::IoT::TopicRule', { TopicRulePayload: Match.objectLike({
    Sql: "SELECT topic(3) AS deviceId FROM '$aws/things/doorlock-01/shadow/update/documents'", RuleDisabled: false,
  }) });
  template.hasResourceProperties('AWS::Lambda::Permission', {
    Principal: 'iot.amazonaws.com', SourceAccount: '123456789012', SourceArn: { 'Fn::GetAtt': [Match.anyValue(), 'Arn'] },
  });
});
