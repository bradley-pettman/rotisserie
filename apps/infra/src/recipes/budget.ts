import * as budgets from 'aws-cdk-lib/aws-budgets'
import { Construct } from 'constructs'
import { transformed, type Transform } from './helpers/transform'

export class Budget extends Construct {
  readonly budget: budgets.CfnBudget

  constructor(scope: Construct, id: string, props: Budget.Props) {
    super(scope, id)

    const { limitUsd, emails, thresholds = [80, 100], transform } = props

    const subscribers = emails.map((address) => ({ subscriptionType: 'EMAIL', address }))
    const notify = (notificationType: string, threshold: number): budgets.CfnBudget.NotificationWithSubscribersProperty => ({
      notification: { notificationType, comparisonOperator: 'GREATER_THAN', threshold, thresholdType: 'PERCENTAGE' },
      subscribers
    })

    this.budget = new budgets.CfnBudget(
      this,
      'Resource',
      transformed(
        {
          budget: {
            budgetType: 'COST',
            timeUnit: 'MONTHLY',
            budgetLimit: { amount: limitUsd, unit: 'USD' }
          },
          notificationsWithSubscribers: [
            ...thresholds.map((threshold) => notify('ACTUAL', threshold)),
            notify('FORECASTED', 100)
          ]
        },
        transform?.budget
      )
    )
  }
}

export declare namespace Budget {
  interface Props {
    limitUsd: number
    emails: string[]
    thresholds?: number[]
    transform?: {
      budget?: Transform<budgets.CfnBudgetProps>
    }
  }
}
