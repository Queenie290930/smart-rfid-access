import { Stack, aws_iam as iam, aws_iot as iot, aws_lambda as lambda } from 'aws-cdk-lib';

export function grantShadowAccess(target: lambda.IFunction, action: 'iot:UpdateThingShadow' | 'iot:GetThingShadow') {
  const stack = Stack.of(target);
  target.addToRolePolicy(new iam.PolicyStatement({ actions: ['iot:DescribeEndpoint'], resources: ['*'] }));
  target.addToRolePolicy(new iam.PolicyStatement({
    actions: [action],
    resources: [stack.formatArn({ service: 'iot', resource: 'thing', resourceName: 'doorlock-01' })],
  }));
}

export function createShadowMirrorRule(stack: Stack, target: lambda.IFunction) {
  const rule = new iot.CfnTopicRule(stack, 'DoorLockShadowMirror', {
    topicRulePayload: {
      awsIotSqlVersion: '2016-03-23', ruleDisabled: false,
      sql: "SELECT topic(3) AS deviceId FROM '$aws/things/doorlock-01/shadow/update/documents'",
      actions: [{ lambda: { functionArn: target.functionArn } }],
    },
  });
  // Keep the permission in this stack to avoid a circular reference with Data.
  new lambda.CfnPermission(stack, 'ShadowRuleInvokePermission', {
    action: 'lambda:InvokeFunction', principal: 'iot.amazonaws.com',
    functionName: target.functionName, sourceArn: rule.attrArn, sourceAccount: stack.account,
  });
  return rule;
}
