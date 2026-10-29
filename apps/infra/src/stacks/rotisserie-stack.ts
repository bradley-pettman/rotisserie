import { fileURLToPath } from 'node:url'
import { Stack, Tags, type StackProps } from 'aws-cdk-lib'
import type { Construct } from 'constructs'
import { DbBootstrap } from '../db-bootstrap/db-bootstrap'
import { DbmateMigrations } from '../recipes/dbmate-migrations'
import { PostgresDatabase } from '../recipes/postgres-database'
import { Vpc } from '../recipes/vpc'

const DBMATE = { version: '2.36.0', sha256: 'c7d49db4b54e487eddf8ce7d6e88f4035e1eb04c7edb16008f668cdfad2f29e8' }

const repoPath = (relative: string): string => fileURLToPath(new URL(`../../../../${relative}`, import.meta.url))

export interface RotisserieStackProps extends StackProps {
  stage: string
}

export class RotisserieStack extends Stack {
  readonly stage: string
  readonly database: PostgresDatabase
  readonly migrations: DbmateMigrations

  constructor(scope: Construct, id: string, props: RotisserieStackProps) {
    super(scope, id, { terminationProtection: true, ...props })

    this.stage = props.stage
    Tags.of(this).add('stage', props.stage)

    const network = new Vpc(this, 'Vpc')
    this.database = new PostgresDatabase(this, 'Database', { vpc: network.vpc, databaseName: 'rotisserie' })
    const bootstrap = new DbBootstrap(this, 'DbBootstrap', { database: this.database, appRole: 'app' })

    this.migrations = new DbmateMigrations(this, 'Migrations', {
      vpc: network.vpc,
      database: this.database.instance,
      databaseName: this.database.databaseName,
      user: 'app',
      dbmate: DBMATE,
      migrations: repoPath('db/migrations'),
      seeds: repoPath('db/seeds'),
      caBundle: repoPath('apps/api/certs/rds-global-bundle.pem'),
      executeAfter: [bootstrap]
    })
    this.database.grantConnect(this.migrations.function.function, 'app')
  }
}
