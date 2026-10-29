import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Stack } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as rds from 'aws-cdk-lib/aws-rds'
import * as sns from 'aws-cdk-lib/aws-sns'
import { describe, expect, it } from 'vitest'
import { testApp } from '../test/app'
import { DbmateMigrations } from './dbmate-migrations'

const DBMATE = { version: '2.36.0', sha256: 'c7d49db4b54e487eddf8ce7d6e88f4035e1eb04c7edb16008f668cdfad2f29e8' }

function build(props?: Partial<DbmateMigrations.Props>) {
  const stack = new Stack(testApp(), 'Test')
  const vpc = new ec2.Vpc(stack, 'Vpc', {
    natGateways: 0,
    subnetConfiguration: [{ name: 'Isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED }]
  })
  const database = new rds.DatabaseInstance(stack, 'Database', {
    engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
    vpc,
    vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    iamAuthentication: true
  })
  const after = new sns.Topic(stack, 'After')
  const migrations = new DbmateMigrations(stack, 'Migrations', {
    vpc,
    database,
    databaseName: 'app',
    user: 'app',
    dbmate: DBMATE,
    migrations: '/repo/db/migrations',
    seeds: '/repo/db/seeds',
    caBundle: '/repo/ca.pem',
    executeAfter: [after],
    ...props
  })
  return { stack, migrations, template: Template.fromStack(stack) }
}

describe('DbmateMigrations', () => {
  it('runs dbmate inside the VPC as the given database user over verified TLS', () => {
    build().template.hasResourceProperties('AWS::Lambda::Function', {
      VpcConfig: Match.objectLike({
        SubnetIds: [{ Ref: Match.stringLikeRegexp('Isolated') }, { Ref: Match.stringLikeRegexp('Isolated') }]
      }),
      MemorySize: 512,
      Timeout: 300,
      Environment: {
        Variables: Match.objectLike({
          PGHOST: { 'Fn::GetAtt': [Match.stringLikeRegexp('^Database'), 'Endpoint.Address'] },
          PGPORT: { 'Fn::GetAtt': [Match.stringLikeRegexp('^Database'), 'Endpoint.Port'] },
          PGDATABASE: 'app',
          PGUSER: 'app',
          PGSSLROOTCERT: 'ca.pem',
          DBMATE_MIGRATIONS_DIR: 'migrations',
          SEEDS_DIR: 'seeds'
        })
      }
    })
  })

  it('skips the seeds when there are none', () => {
    build({ seeds: undefined }).template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: { Variables: Match.objectLike({ SEEDS_DIR: Match.absent() }) }
    })
  })

  it('is triggered during the deploy, after what it is told to wait for', () => {
    const { template } = build()

    template.resourceCountIs('Custom::Trigger', 1)
    template.hasResource('Custom::Trigger', {
      Properties: Match.objectLike({
        HandlerArn: { Ref: Match.stringLikeRegexp('^MigrationsFunction') },
        InvocationType: 'RequestResponse',
        Timeout: '300000'
      }),
      DependsOn: Match.arrayWith([Match.stringLikeRegexp('^After')])
    })
  })

  it('grants itself nothing; the database owner does that', () => {
    build().template.resourcePropertiesCountIs(
      'AWS::IAM::Policy',
      { PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Action: 'rds-db:connect' })]) } },
      0
    )
  })

  it('does not fetch dbmate when bundling is skipped', () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'dbmate-test-'))

    expect(() => build({ dbmate: { version: '0.0.0', sha256: 'not a real digest' }, cacheDir })).not.toThrow()
    expect(readdirSync(cacheDir)).toEqual([])
  })

  it('lets a transform change the trigger before it is built', () => {
    const { template } = build({ transform: { trigger: (trigger) => ({ ...trigger, executeOnHandlerChange: false }) } })

    template.hasResourceProperties('Custom::Trigger', { ExecuteOnHandlerChange: false })
  })
})
