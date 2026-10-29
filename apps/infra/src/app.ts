import { App } from 'aws-cdk-lib'
import { BootstrapStack } from './stacks/bootstrap-stack'
import { RotisserieStack } from './stacks/rotisserie-stack'

export function createApp(): App {
  const app = new App()
  const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-2' }

  new BootstrapStack(app, 'Rotisserie-bootstrap', {
    env,
    repository: { owner: 'bradley-pettman', name: 'rotisserie', branch: 'main' },
    monthlyBudgetUsd: 25
  })

  new RotisserieStack(app, 'Rotisserie-prod', { env, stage: 'prod' })

  return app
}
