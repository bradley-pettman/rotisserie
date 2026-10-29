import * as ec2 from 'aws-cdk-lib/aws-ec2'
import { Construct } from 'constructs'
import { transformed, type Transform } from './helpers/transform'

export class Vpc extends Construct {
  readonly vpc: ec2.Vpc

  constructor(scope: Construct, id: string, props: Vpc.Props = {}) {
    super(scope, id)

    const { maxAzs = 2, publicSubnets = false, transform } = props

    this.vpc = new ec2.Vpc(
      this,
      'Resource',
      transformed(
        {
          maxAzs,
          natGateways: 0,
          subnetConfiguration: [
            { name: 'Isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
            ...(publicSubnets ? [{ name: 'Public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 }] : [])
          ]
        },
        transform?.vpc
      )
    )
  }
}

export declare namespace Vpc {
  interface Props {
    maxAzs?: number
    publicSubnets?: boolean
    transform?: {
      vpc?: Transform<ec2.VpcProps>
    }
  }
}
