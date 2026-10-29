import { Stack } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { describe, it } from 'vitest'
import { PostgresDatabase } from '../recipes/postgres-database'
import { Vpc } from '../recipes/vpc'
import { testApp } from '../test/app'
import { DbBootstrap } from './db-bootstrap'

describe('DbBootstrap', () => {
  const stack = new Stack(testApp(), 'Test')
  const network = new Vpc(stack, 'Vpc')
  const database = new PostgresDatabase(stack, 'Database', { vpc: network.vpc, databaseName: 'app' })
  new DbBootstrap(stack, 'DbBootstrap', { database, appRole: 'app', caBundle: '/repo/ca.pem' })
  const template = Template.fromStack(stack)

  it('runs its function once the database exists', () => {
    template.resourceCountIs('Custom::Trigger', 1)
    template.hasResource('Custom::Trigger', {
      Properties: Match.objectLike({
        InvocationType: 'RequestResponse',
        HandlerArn: { Ref: Match.stringLikeRegexp('^DbBootstrapFunction') }
      }),
      DependsOn: Match.arrayWith([Match.stringLikeRegexp('^Database')])
    })
  })

  it('connects from inside the VPC with the master credentials', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      VpcConfig: Match.objectLike({
        SubnetIds: [{ Ref: Match.stringLikeRegexp('Isolated') }, { Ref: Match.stringLikeRegexp('Isolated') }]
      }),
      Environment: {
        Variables: Match.objectLike({
          PGHOST: { 'Fn::GetAtt': [Match.stringLikeRegexp('^Database'), 'Endpoint.Address'] },
          PGPORT: { 'Fn::GetAtt': [Match.stringLikeRegexp('^Database'), 'Endpoint.Port'] },
          PGDATABASE: 'app',
          PGUSER: { 'Fn::Join': ['', Match.arrayWith(['{{resolve:secretsmanager:', ':SecretString:username::}}'])] },
          PGPASSWORD: { 'Fn::Join': ['', Match.arrayWith(['{{resolve:secretsmanager:', ':SecretString:password::}}'])] },
          PGSSLROOTCERT: 'ca.pem',
          DB_APP_ROLE: 'app'
        })
      }
    })
  })

  it('is let in through the database security group', () => {
    template.resourceCountIs('AWS::EC2::SecurityGroupIngress', 1)
    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      GroupId: { 'Fn::GetAtt': [Match.stringLikeRegexp('^DatabaseSecurityGroup'), 'GroupId'] },
      SourceSecurityGroupId: { 'Fn::GetAtt': [Match.stringLikeRegexp('^DbBootstrapFunctionSecurityGroup'), 'GroupId'] }
    })
  })

  it('never signs in with IAM itself', () => {
    template.resourcePropertiesCountIs(
      'AWS::IAM::Policy',
      { PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Action: 'rds-db:connect' })]) } },
      0
    )
  })
})
