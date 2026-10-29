import { Duration, SecretValue, Size, Stack } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as rds from 'aws-cdk-lib/aws-rds'
import { describe, expect, it } from 'vitest'
import { testApp } from '../test/app'
import { PostgresDatabase } from './postgres-database'

function build(props?: Partial<PostgresDatabase.Props>) {
  const stack = new Stack(testApp(), 'Test')
  const vpc = new ec2.Vpc(stack, 'Vpc', {
    natGateways: 0,
    subnetConfiguration: [{ name: 'Isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED }]
  })
  const database = new PostgresDatabase(stack, 'Database', { vpc, databaseName: 'app', ...props })
  return { stack, vpc, database }
}

function synth(props?: Partial<PostgresDatabase.Props>): Template {
  return Template.fromStack(build(props).stack)
}

describe('PostgresDatabase', () => {
  it('runs Postgres 16 on a small arm instance with gp3 storage that can grow', () => {
    synth().hasResourceProperties('AWS::RDS::DBInstance', {
      Engine: 'postgres',
      EngineVersion: '16',
      DBInstanceClass: 'db.t4g.micro',
      DBName: 'app',
      MultiAZ: false,
      StorageType: 'gp3',
      AllocatedStorage: '20',
      MaxAllocatedStorage: 50
    })
  })

  it('is encrypted, private, and signs users in with IAM tokens', () => {
    const template = synth()

    template.hasResourceProperties('AWS::RDS::DBInstance', {
      StorageEncrypted: true,
      PubliclyAccessible: false,
      EnableIAMDatabaseAuthentication: true,
      CACertificateIdentifier: 'rds-ca-rsa2048-g1'
    })
    template.resourceCountIs('AWS::EC2::SecurityGroupIngress', 0)
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      SecurityGroupIngress: Match.absent(),
      SecurityGroupEgress: [Match.objectLike({ Description: 'Disallow all traffic' })]
    })
  })

  it('lives in the isolated subnets', () => {
    synth().hasResourceProperties('AWS::RDS::DBSubnetGroup', {
      SubnetIds: [{ Ref: Match.stringLikeRegexp('Isolated') }, { Ref: Match.stringLikeRegexp('Isolated') }]
    })
  })

  it('keeps a week of backups and does its maintenance in the small hours', () => {
    synth().hasResourceProperties('AWS::RDS::DBInstance', {
      BackupRetentionPeriod: 7,
      PreferredBackupWindow: '08:00-09:00',
      PreferredMaintenanceWindow: 'sun:09:00-sun:10:00',
      CopyTagsToSnapshot: true
    })
  })

  it('cannot be deleted by accident and leaves a snapshot when it is', () => {
    const template = synth()

    template.hasResourceProperties('AWS::RDS::DBInstance', { DeletionProtection: true })
    template.hasResource('AWS::RDS::DBInstance', { DeletionPolicy: 'Snapshot', UpdateReplacePolicy: 'Snapshot' })
  })

  it('generates the master password into Secrets Manager', () => {
    const { stack, database } = build()
    const template = Template.fromStack(stack)

    expect(database.secret).toBeDefined()
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      GenerateSecretString: Match.objectLike({ SecretStringTemplate: '{"username":"postgres"}' })
    })
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      MasterUsername: 'postgres',
      MasterUserPassword: { 'Fn::Join': ['', Match.arrayWith(['{{resolve:secretsmanager:', ':SecretString:password::}}'])] }
    })
  })

  it('takes other sizes, versions and retention', () => {
    const template = synth({
      version: rds.PostgresEngineVersion.VER_17,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
      storage: Size.gibibytes(100),
      maxStorage: Size.gibibytes(200),
      backupRetention: Duration.days(14)
    })

    template.hasResourceProperties('AWS::RDS::DBInstance', {
      EngineVersion: '17',
      DBInstanceClass: 'db.t4g.small',
      AllocatedStorage: '100',
      MaxAllocatedStorage: 200,
      BackupRetentionPeriod: 14
    })
  })

  it('grants a connection by opening the port and allowing IAM login as one user', () => {
    const { stack, vpc, database } = build()
    const fn = new lambda.Function(stack, 'Fn', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = () => {}'),
      vpc
    })
    database.grantConnect(fn, 'app')
    const template = Template.fromStack(stack)

    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      GroupId: { 'Fn::GetAtt': [Match.stringLikeRegexp('^DatabaseSecurityGroup'), 'GroupId'] },
      SourceSecurityGroupId: { 'Fn::GetAtt': [Match.stringLikeRegexp('^FnSecurityGroup'), 'GroupId'] },
      FromPort: { 'Fn::GetAtt': [Match.stringLikeRegexp('^Database'), 'Endpoint.Port'] }
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
      Roles: [{ Ref: Match.stringLikeRegexp('^FnServiceRole') }]
    })
  })

  it('lets a transform change the instance before it is built', () => {
    const template = synth({
      transform: { instance: (instance) => ({ ...instance, enablePerformanceInsights: true }) }
    })

    template.hasResourceProperties('AWS::RDS::DBInstance', { EnablePerformanceInsights: true })
  })

  it('refuses credentials that leave it without a master secret', () => {
    expect(() =>
      build({
        transform: {
          instance: (instance) => ({
            ...instance,
            credentials: rds.Credentials.fromPassword('postgres', SecretValue.unsafePlainText('hunter2'))
          })
        }
      })
    ).toThrow(/master secret/)
  })
})
