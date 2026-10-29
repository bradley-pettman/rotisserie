import { CfnOutput, CfnParameter, Stack, type StackProps } from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import type { Construct } from 'constructs'
import { Budget } from '../recipes/budget'
import { GitHubOidcRole } from '../recipes/github-oidc-role'

export interface BootstrapStackProps extends StackProps {
  repository: { owner: string; name: string; branch: string }
  monthlyBudgetUsd: number
}

export class BootstrapStack extends Stack {
  constructor(scope: Construct, id: string, props: BootstrapStackProps) {
    super(scope, id, { terminationProtection: true, ...props })

    const alertEmail = new CfnParameter(this, 'AlertEmail', {
      type: 'String',
      noEcho: true,
      description: 'Where budget alerts are sent'
    })

    const { owner, name, branch } = props.repository
    const deploy = new GitHubOidcRole(this, 'GitHubDeploy', { owner, repository: name, branch })
    deploy.role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [this.formatArn({ service: 'iam', region: '', resource: 'role', resourceName: 'cdk-*' })]
      })
    )

    new Budget(this, 'Budget', { limitUsd: props.monthlyBudgetUsd, emails: [alertEmail.valueAsString] })

    new CfnOutput(this, 'DeployRoleArn', { value: deploy.role.roleArn })
  }
}
