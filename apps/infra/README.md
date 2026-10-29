# Infrastructure

AWS CDK for the deployed API, built from the copy-and-own recipes in
`src/recipes/`. The design, the costs and the build order are in
[docs/ROADMAP.md](../../docs/ROADMAP.md) under Phase 6.

## Stacks

| Stack                  | Holds                                                                        | Deployed by                 |
| ---------------------- | ---------------------------------------------------------------------------- | --------------------------- |
| `Rotisserie-bootstrap` | The GitHub OIDC provider, the deploy role CI assumes, and the monthly budget | You, once, from the laptop  |
| `Rotisserie-prod`      | Everything the app uses                                                      | CI, on every push to `main` |

Both stacks are pinned to `us-east-2`. The account comes from whatever
credentials the CDK CLI finds, so sign in to the app's account first.

## One-time setup

From `apps/infra`, signed in to the account (an IAM Identity Center profile):

```bash
npx cdk bootstrap
npx cdk deploy Rotisserie-bootstrap --parameters AlertEmail=you@example.com
```

The deploy prints a `DeployRoleArn` output. Save it as a repository secret
named `AWS_DEPLOY_ROLE_ARN` (GitHub: Settings, Secrets and variables,
Actions). From then on every push to `main` runs the `deploy` job, which
assumes that role and deploys `Rotisserie-prod`.

The role is trusted by `main` of this repository alone, and may only assume
the `cdk-*` roles that `cdk bootstrap` created. The email is a stack
parameter rather than source so that it stays out of the repository; CloudFormation
keeps it for later deploys.

## Commands

```bash
npm test -w @rotisserie/infra         # CDK assertions against the synthesized templates; no AWS needed
npm run synth -w @rotisserie/infra    # Synthesize both stacks into apps/infra/cdk.out
npx cdk diff Rotisserie-prod          # From apps/infra, with credentials: what a deploy would change
```
