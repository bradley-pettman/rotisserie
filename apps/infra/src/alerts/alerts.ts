import { Duration, Size } from 'aws-cdk-lib'
import type * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions'
import type * as lambda from 'aws-cdk-lib/aws-lambda'
import type * as rds from 'aws-cdk-lib/aws-rds'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions'
import { Construct } from 'constructs'

const FIVE_MINUTES = Duration.minutes(5)

export class Alerts extends Construct {
  readonly topic: sns.Topic
  readonly alarms: cloudwatch.Alarm[]

  constructor(scope: Construct, id: string, props: Alerts.Props) {
    super(scope, id)

    const { email, api, httpApi, database } = props

    this.topic = new sns.Topic(this, 'Topic')
    this.topic.addSubscription(new subscriptions.EmailSubscription(email))

    const alarm = (id: string, options: cloudwatch.AlarmProps & { recovers?: boolean }): cloudwatch.Alarm => {
      const { recovers = true, ...alarmProps } = options
      const created = new cloudwatch.Alarm(this, id, alarmProps)
      created.addAlarmAction(new actions.SnsAction(this.topic))
      if (recovers) created.addOkAction(new actions.SnsAction(this.topic))
      return created
    }

    this.alarms = [
      alarm('ApiErrors', {
        alarmDescription: 'The API Lambda failed an invocation in the last five minutes',
        metric: api.metricErrors({ period: FIVE_MINUTES }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
      }),
      alarm('ApiThrottles', {
        alarmDescription: 'The API Lambda was throttled in the last five minutes',
        metric: api.metricThrottles({ period: FIVE_MINUTES }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
      }),
      alarm('HttpServerErrors', {
        alarmDescription: 'The HTTP API answered 5xx in the last five minutes',
        metric: httpApi.metricServerError({ period: FIVE_MINUTES }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
      }),
      alarm('DatabaseStorage', {
        alarmDescription: 'The database has less than 2 GiB of free storage',
        metric: database.metricFreeStorageSpace({ period: FIVE_MINUTES }),
        threshold: Size.gibibytes(2).toBytes(),
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD
      }),
      alarm('DatabaseCpu', {
        alarmDescription: 'The database CPU has been over 80% for fifteen minutes',
        metric: database.metricCPUUtilization({ period: FIVE_MINUTES }),
        threshold: 80,
        evaluationPeriods: 3,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
      })
    ]
  }
}

export declare namespace Alerts {
  interface Props {
    email: string
    api: lambda.IFunction
    httpApi: apigwv2.IHttpApi
    database: rds.IDatabaseInstance
  }
}
