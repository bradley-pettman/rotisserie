import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'
import { transformed, type Transform } from './helpers/transform'

const GITHUB_ISSUER = 'token.actions.githubusercontent.com'
const AWS_AUDIENCE = 'sts.amazonaws.com'

export class GitHubOidcRole extends Construct {
  readonly provider: iam.IOidcProvider
  readonly role: iam.Role

  constructor(scope: Construct, id: string, props: GitHubOidcRole.Props) {
    super(scope, id)

    const { owner, repository, branch = 'main', transform } = props

    this.provider =
      props.provider ??
      new iam.OidcProviderNative(
        this,
        'Provider',
        transformed({ url: `https://${GITHUB_ISSUER}`, clientIds: [AWS_AUDIENCE] }, transform?.provider)
      )

    this.role = new iam.Role(
      this,
      'Role',
      transformed(
        {
          assumedBy: new iam.WebIdentityPrincipal(this.provider.oidcProviderArn, {
            StringEquals: {
              [`${GITHUB_ISSUER}:aud`]: AWS_AUDIENCE,
              [`${GITHUB_ISSUER}:sub`]: `repo:${owner}/${repository}:ref:refs/heads/${branch}`
            }
          }),
          description: `GitHub Actions on ${owner}/${repository}, branch ${branch}`
        },
        transform?.role
      )
    )
  }
}

export declare namespace GitHubOidcRole {
  interface Props {
    owner: string
    repository: string
    branch?: string
    provider?: iam.IOidcProvider
    transform?: {
      provider?: Transform<iam.OidcProviderNativeProps>
      role?: Transform<iam.RoleProps>
    }
  }
}
