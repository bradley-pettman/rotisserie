import { isInviteCode } from '@rotisserie/shared/accounts'
import { describe, expect, it } from 'vitest'
import { hashPassword, verifyNoPassword, verifyPassword } from './passwords'
import { generateInviteCode, generateSessionToken, hashToken } from './tokens'

describe('passwords', () => {
  it('verifies the password it hashed and rejects another', async () => {
    const hash = await hashPassword('correct horse battery staple')

    expect(hash).toMatch(/^\$scrypt\$ln=15,r=8,p=3\$/)
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true)
    expect(await verifyPassword('correct horse battery stapler', hash)).toBe(false)
  })

  it('salts every hash', async () => {
    expect(await hashPassword('same password')).not.toBe(await hashPassword('same password'))
  })

  it('treats a malformed hash as a mismatch', async () => {
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false)
  })

  it('spends the same work when there is no account', async () => {
    expect(await verifyNoPassword('anything')).toBe(false)
  })
})

describe('tokens', () => {
  it('generates distinct session tokens and hashes them to hex', () => {
    const token = generateSessionToken()

    expect(token).not.toBe(generateSessionToken())
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken(token)).toBe(hashToken(token))
  })

  it('generates invite codes from the shared alphabet', () => {
    for (let i = 0; i < 50; i++) expect(isInviteCode(generateInviteCode())).toBe(true)
  })
})
