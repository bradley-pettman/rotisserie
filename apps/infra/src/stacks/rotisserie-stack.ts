import { fileURLToPath } from 'node:url'
import { CfnOutput, Duration, Stack, Tags, type StackProps } from 'aws-cdk-lib'
import { HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2'
import * as route53 from 'aws-cdk-lib/aws-route53'
import type { Construct } from 'constructs'
import { DbBootstrap } from '../db-bootstrap/db-bootstrap'
import { DbmateMigrations } from '../recipes/dbmate-migrations'
import { HttpApi } from '../recipes/http-api'
import { LambdaFunction } from '../recipes/lambda-function'
import { PostgresDatabase } from '../recipes/postgres-database'
import { Vpc } from '../recipes/vpc'

const DBMATE = { version: '2.36.0', sha256: 'c7d49db4b54e487eddf8ce7d6e88f4035e1eb04c7edb16008f668cdfad2f29e8' }
const SIGN_IN_THROTTLE = { rate: 2, burst: 5 }

const repoPath = (relative: string): string => fileURLToPath(new URL(`../../../../${relative}`, import.meta.url))

export interface RotisserieStackProps extends StackProps {
  stage: string
  domain?: { name: string; zoneName: string; hostedZoneId: string }
}

export class RotisserieStack extends Stack {
  readonly stage: string
  readonly database: PostgresDatabase
  readonly migrations: DbmateMigrations
  readonly api: LambdaFunction
  readonly httpApi: HttpApi

  constructor(scope: Construct, id: string, props: RotisserieStackProps) {
    super(scope, id, { terminationProtection: true, ...props })

    this.stage = props.stage
    Tags.of(this).add('stage', props.stage)

    const caBundle = repoPath('apps/api/certs/rds-global-bundle.pem')
    const network = new Vpc(this, 'Vpc')
    this.database = new PostgresDatabase(this, 'Database', { vpc: network.vpc, databaseName: 'rotisserie' })
    const bootstrap = new DbBootstrap(this, 'DbBootstrap', { database: this.database, appRole: 'app', caBundle })
    const { instance } = this.database

    this.api = new LambdaFunction(this, 'Api', {
      entry: repoPath('apps/api/src/lambda.ts'),
      vpc: network.vpc,
      timeout: Duration.seconds(15),
      environment: {
        PGHOST: instance.dbInstanceEndpointAddress,
        PGPORT: instance.dbInstanceEndpointPort,
        PGDATABASE: this.database.databaseName,
        PGUSER: 'app',
        PGSSLROOTCERT: 'ca.pem',
        PGPOOL_MAX: '1'
      },
      files: { 'ca.pem': caBundle },
      external: ['pg-native']
    })
    this.database.grantConnect(this.api.function, 'app')

    this.migrations = new DbmateMigrations(this, 'Migrations', {
      vpc: network.vpc,
      database: instance,
      databaseName: this.database.databaseName,
      user: 'app',
      dbmate: DBMATE,
      migrations: repoPath('db/migrations'),
      seeds: repoPath('db/seeds'),
      caBundle,
      executeAfter: [bootstrap],
      executeBefore: [this.api]
    })
    this.database.grantConnect(this.migrations.function.function, 'app')

    const { domain } = props
    this.httpApi = new HttpApi(this, 'HttpApi', {
      handler: this.api.function,
      domain: domain && {
        name: domain.name,
        zone: route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
          hostedZoneId: domain.hostedZoneId,
          zoneName: domain.zoneName
        })
      },
      routes: [
        { method: HttpMethod.POST, path: '/auth/sign-in', throttle: SIGN_IN_THROTTLE },
        { method: HttpMethod.POST, path: '/auth/sign-up', throttle: SIGN_IN_THROTTLE },
        { method: HttpMethod.POST, path: '/household/join', throttle: SIGN_IN_THROTTLE }
      ]
    })

    new CfnOutput(this, 'ApiUrl', { value: this.httpApi.url })
  }
}
