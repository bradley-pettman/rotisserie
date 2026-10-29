import { fileURLToPath } from 'node:url'
import { Duration, Size, Stack } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import { describe, it } from 'vitest'
import { testApp } from '../test/app'
import { LambdaFunction } from './lambda-function'

const ENTRY = fileURLToPath(new URL('../test/handler.ts', import.meta.url))

function build(props?: Partial<LambdaFunction.Props>) {
  const stack = new Stack(testApp(), 'Test')
  const fn = new LambdaFunction(stack, 'Fn', { entry: ENTRY, ...props })
  return { stack, fn }
}

function synth(props?: Partial<LambdaFunction.Props>): Template {
  return Template.fromStack(build(props).stack)
}

describe('LambdaFunction', () => {
  it('runs Node 22 on arm64 with modest defaults', () => {
    synth().hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Architectures: ['arm64'],
      Handler: 'index.handler',
      MemorySize: 512,
      Timeout: 10,
      Environment: { Variables: { NODE_OPTIONS: '--enable-source-maps' } }
    })
  })

  it('writes to its own log group, kept for two weeks', () => {
    const template = synth()

    template.resourceCountIs('AWS::Logs::LogGroup', 1)
    template.hasResource('AWS::Logs::LogGroup', { Properties: { RetentionInDays: 14 }, DeletionPolicy: 'Delete' })
    template.hasResourceProperties('AWS::Lambda::Function', {
      LoggingConfig: { LogGroup: { Ref: Match.stringLikeRegexp('^FnLogs') } }
    })
  })

  it('stays outside any VPC unless given one', () => {
    synth().hasResourceProperties('AWS::Lambda::Function', { VpcConfig: Match.absent() })
  })

  it('joins the isolated subnets of the VPC it is given', () => {
    const stack = new Stack(testApp(), 'Test')
    const vpc = new ec2.Vpc(stack, 'Vpc', {
      natGateways: 0,
      subnetConfiguration: [
        { name: 'Public', subnetType: ec2.SubnetType.PUBLIC },
        { name: 'Isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED }
      ]
    })
    new LambdaFunction(stack, 'Fn', { entry: ENTRY, vpc })
    const template = Template.fromStack(stack)

    template.hasResourceProperties('AWS::Lambda::Function', {
      VpcConfig: {
        SubnetIds: [{ Ref: Match.stringLikeRegexp('Isolated') }, { Ref: Match.stringLikeRegexp('Isolated') }],
        SecurityGroupIds: [{ 'Fn::GetAtt': [Match.stringLikeRegexp('^FnSecurityGroup'), 'GroupId'] }]
      }
    })
    template.hasResourceProperties('AWS::IAM::Role', {
      ManagedPolicyArns: Match.arrayWith([
        { 'Fn::Join': ['', Match.arrayWith([Match.stringLikeRegexp('AWSLambdaVPCAccessExecutionRole')])] }
      ])
    })
  })

  it('takes other sizes, a handler name and extra environment', () => {
    const template = synth({
      handler: 'main',
      memory: Size.mebibytes(1024),
      timeout: Duration.seconds(30),
      environment: { STAGE: 'test' }
    })

    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'index.main',
      MemorySize: 1024,
      Timeout: 30,
      Environment: { Variables: { NODE_OPTIONS: '--enable-source-maps', STAGE: 'test' } }
    })
  })

  it('lets a transform change the function before it is built', () => {
    const template = synth({ transform: { function: (fn) => ({ ...fn, reservedConcurrentExecutions: 1 }) } })

    template.hasResourceProperties('AWS::Lambda::Function', { ReservedConcurrentExecutions: 1 })
  })
})
