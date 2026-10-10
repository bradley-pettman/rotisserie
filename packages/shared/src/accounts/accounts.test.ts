import { describe, expect, it } from 'vitest'
import { AccountSchemas } from './accounts'
import { HouseholdSchemas } from './households'
import { canonicalizeInviteCode, formatInviteCode, isInviteCode } from './invite-codes'

describe('invite codes', () => {
  it('canonicalizes case, dashes and spaces away', () => {
    expect(canonicalizeInviteCode(' k7qm-2xpa ')).toBe('K7QM2XPA')
  })

  it('formats a full code in two groups of four', () => {
    expect(formatInviteCode('k7qm2xpa')).toBe('K7QM-2XPA')
  })

  it('groups a code as it is typed', () => {
    expect(formatInviteCode('k7q')).toBe('K7Q')
    expect(formatInviteCode('k7qm')).toBe('K7QM')
    expect(formatInviteCode('k7qm2')).toBe('K7QM-2')
  })

  it.each(['K7QM2XP', 'K7QM2XPAB', 'K7QM2XP0', 'K7QM2XPO', 'K7QM2XPI', 'k7qm2xpa'])('rejects %s', (code) => {
    expect(isInviteCode(code)).toBe(false)
  })

  it('accepts eight characters from the alphabet', () => {
    expect(isInviteCode('K7QM2XPA')).toBe(true)
  })

  it('parses a typed code into its canonical form', () => {
    expect(HouseholdSchemas.JoinHouseholdInput.parse({ code: 'k7qm 2xpa' })).toEqual({ code: 'K7QM2XPA' })
  })
})

describe('account inputs', () => {
  it('lowercases and trims the email', () => {
    const input = AccountSchemas.SignInInput.parse({ email: '  Sam@Example.COM ', password: 'x' })
    expect(input.email).toBe('sam@example.com')
  })

  it('rejects a short password at sign-up', () => {
    const result = AccountSchemas.SignUpInput.safeParse({ email: 'sam@example.com', password: 'short', displayName: 'Sam' })
    expect(result.success).toBe(false)
  })
})
