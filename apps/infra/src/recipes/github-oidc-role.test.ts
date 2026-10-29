import { Duration, Stack } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import * as iam from 'aws-cdk-lib/aws-iam'
import { describe, it } from 'vitest'
import { testApp } from '../test/app'
import { GitHubOidcRole } from './github-oidc-role'

const ISSUER = 'token.actions.githubusercontent.com'

function synth(props: GitHubOidcRole.Props): Template {
  const stack = new Stack(testApp(), 'Test')
  new GitHubOidcRole(stack, 'GitHub', props)
  return Template.fromStack(stack)
}

function trustedSubject(subject: string) {
  return {
    AssumeRolePolicyDocument: {
      Statement: [
        Match.objectLike({
          Action: 'sts:AssumeRoleWithWebIdentity',
          Effect: 'Allow',
          Condition: {
            StringEquals: { [`${ISSUER}:aud`]: 'sts.amazonaws.com', [`${ISSUER}:sub`]: subject }
          }
        })
      ]
    }
  }
}

describe('GitHubOidcRole', () => {
  it('registers GitHub Actions as an identity provider for STS', () => {
    const template = synth({ owner: 'acme', repository: 'widgets' })

    template.resourceCountIs('AWS::IAM::OIDCProvider', 1)
    template.hasResourceProperties('AWS::IAM::OIDCProvider', {
      Url: `https://${ISSUER}`,
      ClientIdList: ['sts.amazonaws.com']
    })
  })

  it('trusts one repository on main by default', () => {
    const template = synth({ owner: 'acme', repository: 'widgets' })

    template.resourceCountIs('AWS::IAM::Role', 1)
    template.hasResourceProperties('AWS::IAM::Role', trustedSubject('repo:acme/widgets:ref:refs/heads/main'))
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [Match.objectLike({ Principal: { Federated: { Ref: Match.stringLikeRegexp('^GitHubProvider') } } })]
      }
    })
  })

  it('trusts another branch when asked', () => {
    const template = synth({ owner: 'acme', repository: 'widgets', branch: 'release' })

    template.hasResourceProperties('AWS::IAM::Role', trustedSubject('repo:acme/widgets:ref:refs/heads/release'))
  })

  it('grants the role nothing by itself', () => {
    const template = synth({ owner: 'acme', repository: 'widgets' })

    template.resourceCountIs('AWS::IAM::Policy', 0)
    template.hasResourceProperties('AWS::IAM::Role', {
      ManagedPolicyArns: Match.absent(),
      Policies: Match.absent()
    })
  })

  it('reuses a provider the account already has', () => {
    const stack = new Stack(testApp(), 'Test')
    const arn = `arn:aws:iam::123456789012:oidc-provider/${ISSUER}`
    const provider = iam.OidcProviderNative.fromOidcProviderArn(stack, 'Existing', arn)
    new GitHubOidcRole(stack, 'GitHub', { owner: 'acme', repository: 'widgets', provider })
    const template = Template.fromStack(stack)

    template.resourceCountIs('AWS::IAM::OIDCProvider', 0)
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: { Statement: [Match.objectLike({ Principal: { Federated: arn } })] }
    })
  })

  it('lets a transform change the role before it is built', () => {
    const template = synth({
      owner: 'acme',
      repository: 'widgets',
      transform: { role: (role) => ({ ...role, maxSessionDuration: Duration.hours(2) }) }
    })

    template.hasResourceProperties('AWS::IAM::Role', { MaxSessionDuration: 7200 })
  })
})
