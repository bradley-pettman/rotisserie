import { join } from 'node:path'
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
      files,
      external,
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
            sourceMap: true,
            externalModules: external,
            commandHooks: files && {
              beforeBundling: () => [],
              beforeInstall: () => [],
              afterBundling: (_inputDir, outputDir) => copyCommands(files, outputDir)
            }
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
    files?: Record<string, string | { from: string; executable?: boolean }>
    external?: string[]
    logRetention?: logs.RetentionDays
    transform?: {
      function?: Transform<nodejs.NodejsFunctionProps>
      logGroup?: Transform<logs.LogGroupProps>
    }
  }
}

function copyCommands(files: NonNullable<LambdaFunction.Props['files']>, outputDir: string): string[] {
  return Object.entries(files).flatMap(([target, source]) => {
    const { from, executable = false } = typeof source === 'string' ? { from: source } : source
    const destination = join(outputDir, target)
    return [`cp -R ${quote(from)} ${quote(destination)}`, ...(executable ? [`chmod +x ${quote(destination)}`] : [])]
  })
}

function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}
