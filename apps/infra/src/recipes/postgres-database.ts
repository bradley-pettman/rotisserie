import { Duration, RemovalPolicy, Size } from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import type * as iam from 'aws-cdk-lib/aws-iam'
import * as rds from 'aws-cdk-lib/aws-rds'
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import { Construct } from 'constructs'
import { transformed, type Transform } from './helpers/transform'

export class PostgresDatabase extends Construct {
  readonly vpc: ec2.IVpc
  readonly databaseName: string
  readonly securityGroup: ec2.SecurityGroup
  readonly instance: rds.DatabaseInstance
  readonly secret: secretsmanager.ISecret

  constructor(scope: Construct, id: string, props: PostgresDatabase.Props) {
    super(scope, id)

    const {
      vpc,
      databaseName,
      version = rds.PostgresEngineVersion.VER_16,
      instanceType = ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      storage = Size.gibibytes(20),
      maxStorage = Size.gibibytes(50),
      backupRetention = Duration.days(7),
      transform
    } = props

    this.vpc = vpc
    this.databaseName = databaseName

    this.securityGroup = new ec2.SecurityGroup(
      this,
      'SecurityGroup',
      transformed({ vpc, allowAllOutbound: false }, transform?.securityGroup)
    )

    this.instance = new rds.DatabaseInstance(
      this,
      'Resource',
      transformed(
        {
          engine: rds.DatabaseInstanceEngine.postgres({ version }),
          instanceType,
          vpc,
          vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
          securityGroups: [this.securityGroup],
          databaseName,
          credentials: rds.Credentials.fromGeneratedSecret('postgres'),
          iamAuthentication: true,
          multiAz: false,
          allocatedStorage: storage.toGibibytes(),
          maxAllocatedStorage: maxStorage.toGibibytes(),
          storageType: rds.StorageType.GP3,
          storageEncrypted: true,
          backupRetention,
          preferredBackupWindow: '08:00-09:00',
          preferredMaintenanceWindow: 'sun:09:00-sun:10:00',
          caCertificate: rds.CaCertificate.RDS_CA_RSA2048_G1,
          publiclyAccessible: false,
          deletionProtection: true,
          removalPolicy: RemovalPolicy.SNAPSHOT
        },
        transform?.instance
      )
    )

    const secret = this.instance.secret
    if (!secret) throw new Error('PostgresDatabase needs generated credentials so the master secret exists')
    this.secret = secret
  }

  grantConnect(grantee: iam.IGrantable & ec2.IConnectable, dbUser: string): iam.Grant {
    this.instance.connections.allowDefaultPortFrom(grantee)
    return this.instance.grantConnect(grantee, dbUser)
  }
}

export declare namespace PostgresDatabase {
  interface Props {
    vpc: ec2.IVpc
    databaseName: string
    version?: rds.PostgresEngineVersion
    instanceType?: ec2.InstanceType
    storage?: Size
    maxStorage?: Size
    backupRetention?: Duration
    transform?: {
      instance?: Transform<rds.DatabaseInstanceProps>
      securityGroup?: Transform<ec2.SecurityGroupProps>
    }
  }
}
