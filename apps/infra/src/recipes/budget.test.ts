import { Stack } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { describe, it } from 'vitest'
import { testApp } from '../test/app'
import { Budget } from './budget'

function synth(props: Budget.Props): Template {
  const stack = new Stack(testApp(), 'Test')
  new Budget(stack, 'Budget', props)
  return Template.fromStack(stack)
}

function alert(type: string, threshold: number, emails: string[]) {
  return {
    Notification: {
      NotificationType: type,
      ComparisonOperator: 'GREATER_THAN',
      Threshold: threshold,
      ThresholdType: 'PERCENTAGE'
    },
    Subscribers: emails.map((address) => ({ SubscriptionType: 'EMAIL', Address: address }))
  }
}

describe('Budget', () => {
  it('caps monthly cost in dollars', () => {
    const template = synth({ limitUsd: 25, emails: ['ops@example.com'] })

    template.resourceCountIs('AWS::Budgets::Budget', 1)
    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: { BudgetType: 'COST', TimeUnit: 'MONTHLY', BudgetLimit: { Amount: 25, Unit: 'USD' } }
    })
  })

  it('emails at 80% and 100% of the limit, and when the forecast crosses it', () => {
    const template = synth({ limitUsd: 25, emails: ['ops@example.com'] })

    template.hasResourceProperties('AWS::Budgets::Budget', {
      NotificationsWithSubscribers: [
        alert('ACTUAL', 80, ['ops@example.com']),
        alert('ACTUAL', 100, ['ops@example.com']),
        alert('FORECASTED', 100, ['ops@example.com'])
      ]
    })
  })

  it('takes other thresholds and more than one address', () => {
    const template = synth({ limitUsd: 25, emails: ['a@example.com', 'b@example.com'], thresholds: [50] })

    template.hasResourceProperties('AWS::Budgets::Budget', {
      NotificationsWithSubscribers: [
        alert('ACTUAL', 50, ['a@example.com', 'b@example.com']),
        alert('FORECASTED', 100, ['a@example.com', 'b@example.com'])
      ]
    })
  })

  it('gives the budget no fixed name', () => {
    const template = synth({ limitUsd: 25, emails: ['ops@example.com'] })

    template.hasResourceProperties('AWS::Budgets::Budget', { Budget: Match.objectLike({ BudgetName: Match.absent() }) })
  })

  it('lets a transform change the budget before it is built', () => {
    const template = synth({
      limitUsd: 25,
      emails: ['ops@example.com'],
      transform: { budget: (budget) => ({ ...budget, resourceTags: [{ key: 'team', value: 'kitchen' }] }) }
    })

    template.hasResourceProperties('AWS::Budgets::Budget', { ResourceTags: [{ Key: 'team', Value: 'kitchen' }] })
  })
})
