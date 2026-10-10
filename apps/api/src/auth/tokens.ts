import { createHash, randomBytes, randomInt } from 'node:crypto'
import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH } from '@rotisserie/shared/accounts'

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generateInviteCode(): string {
  return Array.from({ length: INVITE_CODE_LENGTH }, () => INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)]).join(
    ''
  )
}
