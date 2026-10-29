import { Match, Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { testApp } from '../test/app'
import { BootstrapStack } from './bootstrap-stack'

describe('BootstrapStack', () => {
  const stack = new BootstrapStack(testApp(), 'Rotisserie-bootstrap', {
    env: { region: 'us-east-2' },
    repository: { owner: 'acme', name: 'widgets', branch: 'main' },
    monthlyBudgetUsd: 25
  })
  const template = Template.fromStack(stack)

  it('trusts the repository branch', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Condition: {
              StringEquals: Match.objectLike({
                'token.actions.githubusercontent.com:sub': 'repo:acme/widgets:ref:refs/heads/main'
              })
            }
          })
        ]
      }
    })
  })

  it('lets the deploy role assume only the roles cdk bootstrap created', () => {
    template.resourceCountIs('AWS::IAM::Policy', 1)
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Resource: { 'Fn::Join': ['', ['arn:aws:iam::', { Ref: 'AWS::AccountId' }, ':role/cdk-*']] }
          }
        ]
      }
    })
  })

  it('sends budget alerts to the address given at deploy time', () => {
    template.hasParameter('AlertEmail', { Type: 'String', NoEcho: true })
    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: Match.objectLike({ BudgetLimit: { Amount: 25, Unit: 'USD' } }),
      NotificationsWithSubscribers: Match.arrayWith([
        Match.objectLike({ Subscribers: [{ SubscriptionType: 'EMAIL', Address: { Ref: 'AlertEmail' } }] })
      ])
    })
  })

  it('outputs the role ARN for the repository secret', () => {
    template.hasOutput('DeployRoleArn', {
      Value: { 'Fn::GetAtt': [Match.stringLikeRegexp('^GitHubDeployRole'), 'Arn'] }
    })
  })

  it('cannot be deleted by accident', () => {
    expect(stack.terminationProtection).toBe(true)
  })
})
