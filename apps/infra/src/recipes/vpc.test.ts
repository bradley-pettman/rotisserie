import { Stack } from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import { describe, it } from 'vitest'
import { testApp } from '../test/app'
import { Vpc } from './vpc'

function synth(props?: Vpc.Props): Template {
  const stack = new Stack(testApp(), 'Test')
  new Vpc(stack, 'Vpc', props)
  return Template.fromStack(stack)
}

describe('Vpc', () => {
  it('spans two availability zones with isolated subnets only', () => {
    const template = synth()

    template.resourceCountIs('AWS::EC2::Subnet', 2)
    template.allResourcesProperties('AWS::EC2::Subnet', { MapPublicIpOnLaunch: false })
    template.resourceCountIs('AWS::EC2::NatGateway', 0)
    template.resourceCountIs('AWS::EC2::InternetGateway', 0)
  })

  it('removes the rules from the default security group', () => {
    synth().resourceCountIs('Custom::VpcRestrictDefaultSG', 1)
  })

  it('adds public subnets and an internet gateway only when asked', () => {
    const template = synth({ publicSubnets: true })

    template.resourceCountIs('AWS::EC2::Subnet', 4)
    template.resourceCountIs('AWS::EC2::InternetGateway', 1)
    template.resourceCountIs('AWS::EC2::NatGateway', 0)
  })

  it('lets a transform change the VPC before it is built', () => {
    const template = synth({ transform: { vpc: (vpc) => ({ ...vpc, ipAddresses: ec2.IpAddresses.cidr('10.1.0.0/16') }) } })

    template.hasResourceProperties('AWS::EC2::VPC', { CidrBlock: '10.1.0.0/16' })
  })
})
