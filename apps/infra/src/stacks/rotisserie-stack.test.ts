import { Match, Template } from 'aws-cdk-lib/assertions'
import * as sns from 'aws-cdk-lib/aws-sns'
import { describe, expect, it } from 'vitest'
import { testApp } from '../test/app'
import { RotisserieStack } from './rotisserie-stack'

describe('RotisserieStack', () => {
  it('synthesizes', () => {
    const stack = new RotisserieStack(testApp(), 'Rotisserie-prod', { env: { region: 'us-east-2' }, stage: 'prod' })

    expect(() => Template.fromStack(stack)).not.toThrow()
    expect(stack.stage).toBe('prod')
  })

  it('runs one database in isolated subnets with no way out to the internet', () => {
    const template = Template.fromStack(new RotisserieStack(testApp(), 'Rotisserie-prod', { stage: 'prod' }))

    template.resourceCountIs('AWS::RDS::DBInstance', 1)
    template.hasResourceProperties('AWS::RDS::DBInstance', { DBName: 'rotisserie' })
    template.resourceCountIs('AWS::EC2::NatGateway', 0)
    template.resourceCountIs('AWS::EC2::InternetGateway', 0)
  })

  it('bootstraps the app role, then migrates and seeds as that role', () => {
    const template = Template.fromStack(new RotisserieStack(testApp(), 'Rotisserie-prod', { stage: 'prod' }))

    template.resourceCountIs('Custom::Trigger', 2)
    template.hasResource('Custom::Trigger', {
      Properties: Match.objectLike({ HandlerArn: { Ref: Match.stringLikeRegexp('^MigrationsFunction') } }),
      DependsOn: Match.arrayWith([Match.stringLikeRegexp('^DbBootstrapTrigger')])
    })
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: { Variables: Match.objectLike({ PGUSER: 'app', PGDATABASE: 'rotisserie', SEEDS_DIR: 'seeds' }) }
    })
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          Match.objectLike({
            Action: 'rds-db:connect',
            Resource: { 'Fn::Join': ['', Match.arrayWith([':dbuser:', '/app'])] }
          })
        ]
      },
      Roles: [{ Ref: Match.stringLikeRegexp('^MigrationsFunctionServiceRole') }]
    })
    template.resourceCountIs('AWS::EC2::SecurityGroupIngress', 2)
  })

  it('cannot be deleted by accident', () => {
    const stack = new RotisserieStack(testApp(), 'Rotisserie-prod', { stage: 'prod' })

    expect(stack.terminationProtection).toBe(true)
  })

  it('tags every resource with its stage', () => {
    const stack = new RotisserieStack(testApp(), 'Rotisserie-staging', { stage: 'staging' })
    new sns.Topic(stack, 'Probe')

    Template.fromStack(stack).hasResourceProperties('AWS::SNS::Topic', { Tags: [{ Key: 'stage', Value: 'staging' }] })
  })
})
