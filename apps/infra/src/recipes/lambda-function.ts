import { Duration, RemovalPolicy, Size } from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as logs from 'aws-cdk-lib/aws-logs'
import { Construct } from 'constructs'
import { transformed, type Transform } from './helpers/transform'

const ESM_REQUIRE_SHIM = "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"

export class LambdaFunction extends Construct {
  readonly logGroup: logs.LogGroup
  readonly function: nodejs.NodejsFunction

  constructor(scope: Construct, id: string, props: LambdaFunction.Props) {
    super(scope, id)

    const {
      entry,
      handler = 'handler',
      memory = Size.mebibytes(512),
      timeout = Duration.seconds(10),
      environment,
      vpc,
      logRetention = logs.RetentionDays.TWO_WEEKS,
      transform
    } = props

    this.logGroup = new logs.LogGroup(
      this,
      'Logs',
      transformed({ retention: logRetention, removalPolicy: RemovalPolicy.DESTROY }, transform?.logGroup)
    )

    this.function = new nodejs.NodejsFunction(
      this,
      'Resource',
      transformed(
        {
          entry,
          handler,
          runtime: lambda.Runtime.NODEJS_22_X,
          architecture: lambda.Architecture.ARM_64,
          memorySize: memory.toMebibytes(),
          timeout,
          environment: { NODE_OPTIONS: '--enable-source-maps', ...environment },
          logGroup: this.logGroup,
          vpc,
          vpcSubnets: vpc ? { subnetType: ec2.SubnetType.PRIVATE_ISOLATED } : undefined,
          bundling: {
            format: nodejs.OutputFormat.ESM,
            target: 'node22',
            banner: ESM_REQUIRE_SHIM,
            sourceMap: true
          }
        },
        transform?.function
      )
    )
  }
}

export declare namespace LambdaFunction {
  interface Props {
    entry: string
    handler?: string
    memory?: Size
    timeout?: Duration
    environment?: Record<string, string>
    vpc?: ec2.IVpc
    logRetention?: logs.RetentionDays
    transform?: {
      function?: Transform<nodejs.NodejsFunctionProps>
      logGroup?: Transform<logs.LogGroupProps>
    }
  }
}
