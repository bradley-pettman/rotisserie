import { fileURLToPath } from 'node:url'
import { Duration, Size } from 'aws-cdk-lib'
import * as triggers from 'aws-cdk-lib/triggers'
import { Construct } from 'constructs'
import { LambdaFunction } from '../recipes/lambda-function'
import type { PostgresDatabase } from '../recipes/postgres-database'

export class DbBootstrap extends Construct {
  readonly function: LambdaFunction
  readonly trigger: triggers.Trigger

  constructor(scope: Construct, id: string, props: DbBootstrap.Props) {
    super(scope, id)

    const { database, appRole } = props
    const { instance, secret } = database

    this.function = new LambdaFunction(this, 'Function', {
      entry: fileURLToPath(new URL('./handler.ts', import.meta.url)),
      vpc: database.vpc,
      memory: Size.mebibytes(256),
      timeout: Duration.minutes(1),
      environment: {
        PGHOST: instance.dbInstanceEndpointAddress,
        PGPORT: instance.dbInstanceEndpointPort,
        PGDATABASE: database.databaseName,
        PGUSER: secret.secretValueFromJson('username').unsafeUnwrap(),
        PGPASSWORD: secret.secretValueFromJson('password').unsafeUnwrap(),
        DB_APP_ROLE: appRole
      },
      transform: {
        function: (fn) => ({
          ...fn,
          bundling: { ...fn.bundling, externalModules: ['@aws-sdk/*', 'pg-native'], loader: { '.pem': 'text' } }
        })
      }
    })

    instance.connections.allowDefaultPortFrom(this.function.function)

    this.trigger = new triggers.Trigger(this, 'Trigger', {
      handler: this.function.function,
      executeAfter: [instance],
      timeout: Duration.minutes(2)
    })
  }
}

export declare namespace DbBootstrap {
  interface Props {
    database: PostgresDatabase
    appRole: string
  }
}
