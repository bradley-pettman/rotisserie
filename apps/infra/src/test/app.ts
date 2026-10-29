import { App, type AppProps } from 'aws-cdk-lib'
import cdk from '../../cdk.json'

export function testApp(props: AppProps = {}): App {
  return new App({
    analyticsReporting: true,
    ...props,
    context: { ...cdk.context, 'aws:cdk:bundling-stacks': [], ...props.context }
  })
}
