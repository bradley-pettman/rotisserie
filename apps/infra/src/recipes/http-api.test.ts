import { Stack } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as route53 from 'aws-cdk-lib/aws-route53'
import { describe, expect, it } from 'vitest'
import { testApp } from '../test/app'
import { HttpApi } from './http-api'

type Props = Partial<HttpApi.Props> | ((stack: Stack) => Partial<HttpApi.Props>)

function build(props: Props = {}) {
  const stack = new Stack(testApp(), 'Test')
  const handler = new lambda.Function(stack, 'Fn', {
    runtime: lambda.Runtime.NODEJS_22_X,
    handler: 'index.handler',
    code: lambda.Code.fromInline('exports.handler = () => {}')
  })
  const api = new HttpApi(stack, 'Api', { handler, ...(typeof props === 'function' ? props(stack) : props) })
  return { stack, api, template: Template.fromStack(stack) }
}

function withDomain(stack: Stack): Partial<HttpApi.Props> {
  const zone = route53.HostedZone.fromHostedZoneAttributes(stack, 'Zone', { hostedZoneId: 'Z123', zoneName: 'example.com' })
  return { domain: { name: 'api.example.com', zone } }
}

describe('HttpApi', () => {
  it('sends every request to the handler through one default route', () => {
    const { template } = build()

    template.hasResourceProperties('AWS::ApiGatewayV2::Api', { ProtocolType: 'HTTP' })
    template.hasResourceProperties('AWS::ApiGatewayV2::Integration', {
      IntegrationType: 'AWS_PROXY',
      PayloadFormatVersion: '2.0',
      IntegrationUri: { 'Fn::GetAtt': [Match.stringLikeRegexp('^Fn'), 'Arn'] }
    })
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: '$default' })
    template.hasResourceProperties('AWS::Lambda::Permission', {
      Action: 'lambda:InvokeFunction',
      Principal: 'apigateway.amazonaws.com'
    })
  })

  it('deploys one stage with a global throttle and JSON access logs kept for two weeks', () => {
    const { template } = build()

    template.resourceCountIs('AWS::ApiGatewayV2::Stage', 1)
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: '$default',
      AutoDeploy: true,
      DefaultRouteSettings: { ThrottlingRateLimit: 50, ThrottlingBurstLimit: 100 },
      AccessLogSettings: {
        DestinationArn: { 'Fn::GetAtt': [Match.stringLikeRegexp('^ApiAccessLogs'), 'Arn'] },
        Format: Match.stringLikeRegexp('"requestId":"\\$context.requestId"')
      }
    })
    template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 14 })
  })

  it('throttles named routes on their own', () => {
    const { template } = build({
      throttle: { rate: 10, burst: 20 },
      routes: [{ method: HttpMethod.POST, path: '/auth/sign-in', throttle: { rate: 2, burst: 5 } }]
    })

    template.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: 'POST /auth/sign-in' })
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      DefaultRouteSettings: { ThrottlingRateLimit: 10, ThrottlingBurstLimit: 20 },
      RouteSettings: { 'POST /auth/sign-in': { ThrottlingRateLimit: 2, ThrottlingBurstLimit: 5 } }
    })
  })

  it('answers on the AWS endpoint until it is given a domain', () => {
    const { api, template } = build()

    template.resourceCountIs('AWS::ApiGatewayV2::DomainName', 0)
    template.resourceCountIs('AWS::CertificateManager::Certificate', 0)
    template.resourceCountIs('AWS::Route53::RecordSet', 0)
    expect(api.url).toContain('execute-api')
  })

  it('attaches a domain with a DNS-validated certificate and an alias record', () => {
    const { api, template } = build(withDomain)

    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'api.example.com',
      ValidationMethod: 'DNS',
      DomainValidationOptions: [{ DomainName: 'api.example.com', HostedZoneId: 'Z123' }]
    })
    template.hasResourceProperties('AWS::ApiGatewayV2::DomainName', {
      DomainName: 'api.example.com',
      DomainNameConfigurations: [Match.objectLike({ CertificateArn: { Ref: Match.stringLikeRegexp('^ApiCertificate') } })]
    })
    template.hasResourceProperties('AWS::ApiGatewayV2::ApiMapping', { Stage: '$default' })
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: 'api.example.com.',
      Type: 'A',
      HostedZoneId: 'Z123',
      AliasTarget: Match.objectLike({
        DNSName: { 'Fn::GetAtt': [Match.stringLikeRegexp('^ApiDomain'), 'RegionalDomainName'] }
      })
    })
    expect(api.url).toBe('https://api.example.com')
  })

  it('lets a transform change the API before it is built', () => {
    const { template } = build({ transform: { api: (api) => ({ ...api, description: 'Front door' }) } })

    template.hasResourceProperties('AWS::ApiGatewayV2::Api', { Description: 'Front door' })
  })
})
