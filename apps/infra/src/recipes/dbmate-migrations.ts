import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Duration, Size, Stack } from 'aws-cdk-lib'
import type * as ec2 from 'aws-cdk-lib/aws-ec2'
import type * as rds from 'aws-cdk-lib/aws-rds'
import * as triggers from 'aws-cdk-lib/triggers'
import { Construct } from 'constructs'
import { transformed, type Transform } from './helpers/transform'
import { LambdaFunction } from './lambda-function'

const HANDLER = fileURLToPath(new URL('./dbmate-migrations.handler.ts', import.meta.url))

export class DbmateMigrations extends Construct {
  readonly function: LambdaFunction
  readonly trigger: triggers.Trigger

  constructor(scope: Construct, id: string, props: DbmateMigrations.Props) {
    super(scope, id)

    const {
      vpc,
      database,
      databaseName,
      user,
      dbmate,
      migrations,
      seeds,
      caBundle,
      executeAfter,
      executeBefore,
      cacheDir = join(tmpdir(), 'cdk-dbmate'),
      transform
    } = props

    const bundle = Stack.of(this).bundlingRequired ? dbmateBinary(dbmate, cacheDir) : undefined

    this.function = new LambdaFunction(this, 'Function', {
      entry: HANDLER,
      vpc,
      memory: Size.mebibytes(512),
      timeout: Duration.minutes(5),
      environment: {
        PGHOST: database.dbInstanceEndpointAddress,
        PGPORT: database.dbInstanceEndpointPort,
        PGDATABASE: databaseName,
        PGUSER: user,
        PGSSLROOTCERT: 'ca.pem',
        DBMATE_MIGRATIONS_DIR: 'migrations',
        ...(seeds ? { SEEDS_DIR: 'seeds' } : {})
      },
      files: {
        dbmate: { from: bundle ?? '', executable: true },
        'ca.pem': caBundle,
        migrations,
        ...(seeds ? { seeds } : {})
      },
      external: ['pg-native']
    })

    this.trigger = new triggers.Trigger(
      this,
      'Trigger',
      transformed(
        {
          handler: this.function.function,
          executeAfter,
          executeBefore,
          timeout: Duration.minutes(5)
        },
        transform?.trigger
      )
    )
  }
}

export declare namespace DbmateMigrations {
  interface Props {
    vpc: ec2.IVpc
    database: rds.IDatabaseInstance
    databaseName: string
    user: string
    dbmate: { version: string; sha256: string }
    migrations: string
    seeds?: string
    caBundle: string
    executeAfter?: Construct[]
    executeBefore?: Construct[]
    cacheDir?: string
    transform?: {
      trigger?: Transform<triggers.TriggerProps>
    }
  }
}

function dbmateBinary({ version, sha256 }: DbmateMigrations.Props['dbmate'], cacheDir: string): string {
  const file = join(cacheDir, `dbmate-${version}-linux-arm64`)
  if (existsSync(file) && digest(file) === sha256) return file

  mkdirSync(cacheDir, { recursive: true })
  const url = `https://github.com/amacneil/dbmate/releases/download/v${version}/dbmate-linux-arm64`
  execFileSync('curl', ['-fsSL', '--retry', '3', '-o', file, url], { stdio: 'inherit' })

  const actual = digest(file)
  if (actual !== sha256) {
    rmSync(file, { force: true })
    throw new Error(`dbmate ${version} for linux-arm64 has sha256 ${actual}, not the expected ${sha256}`)
  }
  return file
}

function digest(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}
