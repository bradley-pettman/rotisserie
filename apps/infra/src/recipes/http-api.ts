import { RemovalPolicy } from 'aws-cdk-lib'
import * as apigateway from 'aws-cdk-lib/aws-apigateway'
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import type * as lambda from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as targets from 'aws-cdk-lib/aws-route53-targets'
import { Construct } from 'constructs'
import { transformed, type Transform } from './helpers/transform'

const ACCESS_LOG_FORMAT = JSON.stringify({
  requestId: '$context.requestId',
  requestTime: '$context.requestTime',
  method: '$context.httpMethod',
  routeKey: '$context.routeKey',
  path: '$context.path',
  status: '$context.status',
  responseLatency: '$context.responseLatency',
  integrationLatency: '$context.integrationLatency',
  ip: '$context.identity.sourceIp',
  userAgent: '$context.identity.userAgent',
  error: '$context.error.message',
  integrationError: '$context.integrationErrorMessage'
})

export class HttpApi extends Construct {
  readonly logGroup: logs.LogGroup
  readonly api: apigwv2.HttpApi
  readonly stage: apigwv2.HttpStage
  readonly certificate?: acm.Certificate
  readonly domainName?: apigwv2.DomainName
  readonly record?: route53.ARecord
  readonly url: string

  constructor(scope: Construct, id: string, props: HttpApi.Props) {
    super(scope, id)

    const {
      handler,
      domain,
      throttle = { rate: 50, burst: 100 },
      routes = [],
      logRetention = logs.RetentionDays.TWO_WEEKS,
      transform
    } = props

    const integration = new HttpLambdaIntegration('Handler', handler)

    this.logGroup = new logs.LogGroup(
      this,
      'AccessLogs',
      transformed({ retention: logRetention, removalPolicy: RemovalPolicy.DESTROY }, transform?.logGroup)
    )

    this.api = new apigwv2.HttpApi(
      this,
      'Resource',
      transformed({ defaultIntegration: integration, createDefaultStage: false }, transform?.api)
    )
    for (const route of routes) this.api.addRoutes({ path: route.path, methods: [route.method], integration })

    if (domain) {
      this.certificate = new acm.Certificate(
        this,
        'Certificate',
        transformed(
          { domainName: domain.name, validation: acm.CertificateValidation.fromDns(domain.zone) },
          transform?.certificate
        )
      )
      this.domainName = new apigwv2.DomainName(
        this,
        'Domain',
        transformed({ domainName: domain.name, certificate: this.certificate }, transform?.domainName)
      )
    }

    this.stage = new apigwv2.HttpStage(
      this,
      'Stage',
      transformed(
        {
          httpApi: this.api,
          stageName: '$default',
          autoDeploy: true,
          throttle: { rateLimit: throttle.rate, burstLimit: throttle.burst },
          accessLogSettings: {
            destination: new apigwv2.LogGroupLogDestination(this.logGroup),
            format: apigateway.AccessLogFormat.custom(ACCESS_LOG_FORMAT)
          },
          domainMapping: this.domainName ? { domainName: this.domainName } : undefined
        },
        transform?.stage
      )
    )

    if (routes.length > 0) {
      const stage = this.stage.node.defaultChild as apigwv2.CfnStage
      stage.routeSettings = Object.fromEntries(
        routes.map((route) => [
          `${route.method} ${route.path}`,
          { ThrottlingRateLimit: route.throttle.rate, ThrottlingBurstLimit: route.throttle.burst }
        ])
      )
    }

    if (domain && this.domainName) {
      this.record = new route53.ARecord(this, 'Record', {
        zone: domain.zone,
        recordName: domain.name,
        target: route53.RecordTarget.fromAlias(
          new targets.ApiGatewayv2DomainProperties(this.domainName.regionalDomainName, this.domainName.regionalHostedZoneId)
        )
      })
    }

    this.url = domain ? `https://${domain.name}` : this.stage.url
  }
}

export declare namespace HttpApi {
  interface Throttle {
    rate: number
    burst: number
  }

  interface Route {
    method: apigwv2.HttpMethod
    path: string
    throttle: Throttle
  }

  interface Props {
    handler: lambda.IFunction
    domain?: { name: string; zone: route53.IHostedZone }
    throttle?: Throttle
    routes?: Route[]
    logRetention?: logs.RetentionDays
    transform?: {
      api?: Transform<apigwv2.HttpApiProps>
      stage?: Transform<apigwv2.HttpStageProps>
      certificate?: Transform<acm.CertificateProps>
      domainName?: Transform<apigwv2.DomainNameProps>
      logGroup?: Transform<logs.LogGroupProps>
    }
  }
}
