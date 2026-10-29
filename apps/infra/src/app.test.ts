import { describe, expect, it } from 'vitest'
import { createApp } from './app'

describe('createApp', () => {
  const assembly = createApp({ context: { 'aws:cdk:bundling-stacks': [] } }).synth()

  it('defines the bootstrap and prod stacks', () => {
    expect(assembly.stacks.map((stack) => stack.stackName).sort()).toEqual(['Rotisserie-bootstrap', 'Rotisserie-prod'])
  })

  it('pins every stack to us-east-2', () => {
    for (const stack of assembly.stacks) expect(stack.environment.region).toBe('us-east-2')
  })
})
