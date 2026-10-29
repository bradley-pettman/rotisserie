import { Stack, Tags, type StackProps } from 'aws-cdk-lib'
import type { Construct } from 'constructs'

export interface RotisserieStackProps extends StackProps {
  stage: string
}

export class RotisserieStack extends Stack {
  readonly stage: string

  constructor(scope: Construct, id: string, props: RotisserieStackProps) {
    super(scope, id, { terminationProtection: true, ...props })

    this.stage = props.stage
    Tags.of(this).add('stage', props.stage)
  }
}
