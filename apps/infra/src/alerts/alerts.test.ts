import { Stack } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as rds from 'aws-cdk-lib/aws-rds'
import { describe, it } from 'vitest'
import { testApp } from '../test/app'
import { Alerts } from './alerts'

describe('Alerts', () => {
  const stack = new Stack(testApp(), 'Test')
  const vpc = new ec2.Vpc(stack, 'Vpc', {
    natGateways: 0,
    subnetConfiguration: [{ name: 'Isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED }]
  })
  const api = new lambda.Function(stack, 'Fn', {
    runtime: lambda.Runtime.NODEJS_22_X,
    handler: 'index.handler',
    code: lambda.Code.fromInline('exports.handler = () => {}')
  })
  const httpApi = new apigwv2.HttpApi(stack, 'HttpApi')
  const database = new rds.DatabaseInstance(stack, 'Database', {
    engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
    vpc,
    vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED }
  })
  new Alerts(stack, 'Alerts', { email: 'ops@example.com', api, httpApi, database })
  const template = Template.fromStack(stack)

  it('emails one address from one topic', () => {
    template.resourceCountIs('AWS::SNS::Topic', 1)
    template.hasResourceProperties('AWS::SNS::Subscription', { Protocol: 'email', Endpoint: 'ops@example.com' })
  })

  it('watches the API for failed invocations, throttles and 5xx answers', () => {
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      Namespace: 'AWS/Lambda',
      MetricName: 'Errors',
      Threshold: 1,
      EvaluationPeriods: 1,
      Period: 300,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      TreatMissingData: 'notBreaching'
    })
    template.hasResourceProperties('AWS::CloudWatch::Alarm', { Namespace: 'AWS/Lambda', MetricName: 'Throttles' })
    template.hasResourceProperties('AWS::CloudWatch::Alarm', { Namespace: 'AWS/ApiGateway', MetricName: '5xx' })
  })

  it('watches the database for low storage and sustained high CPU', () => {
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      Namespace: 'AWS/RDS',
      MetricName: 'FreeStorageSpace',
      Threshold: 2 * 1024 * 1024 * 1024,
      ComparisonOperator: 'LessThanThreshold'
    })
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      Namespace: 'AWS/RDS',
      MetricName: 'CPUUtilization',
      Threshold: 80,
      EvaluationPeriods: 3,
      Period: 300,
      ComparisonOperator: 'GreaterThanThreshold'
    })
  })

  it('sends every alarm, and its recovery, to the topic', () => {
    template.resourceCountIs('AWS::CloudWatch::Alarm', 5)
    template.allResourcesProperties('AWS::CloudWatch::Alarm', {
      AlarmActions: [{ Ref: Match.stringLikeRegexp('^AlertsTopic') }],
      OKActions: [{ Ref: Match.stringLikeRegexp('^AlertsTopic') }]
    })
  })
})
