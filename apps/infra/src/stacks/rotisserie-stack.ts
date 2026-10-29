import { Stack, Tags, type StackProps } from 'aws-cdk-lib'
import type { Construct } from 'constructs'
import { DbBootstrap } from '../db-bootstrap/db-bootstrap'
import { PostgresDatabase } from '../recipes/postgres-database'
import { Vpc } from '../recipes/vpc'

export interface RotisserieStackProps extends StackProps {
  stage: string
}

export class RotisserieStack extends Stack {
  readonly stage: string
  readonly database: PostgresDatabase

  constructor(scope: Construct, id: string, props: RotisserieStackProps) {
    super(scope, id, { terminationProtection: true, ...props })

    this.stage = props.stage
    Tags.of(this).add('stage', props.stage)

    const network = new Vpc(this, 'Vpc')
    this.database = new PostgresDatabase(this, 'Database', { vpc: network.vpc, databaseName: 'rotisserie' })
    new DbBootstrap(this, 'DbBootstrap', { database: this.database, appRole: 'app' })
  }
}
