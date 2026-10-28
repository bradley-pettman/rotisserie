export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'

export const INVITE_CODE_LENGTH = 8

export function canonicalizeInviteCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function formatInviteCode(code: string): string {
  const canonical = canonicalizeInviteCode(code)
  return canonical.length > 4 ? `${canonical.slice(0, 4)}-${canonical.slice(4)}` : canonical
}

export function isInviteCode(code: string): boolean {
  return code.length === INVITE_CODE_LENGTH && [...code].every((character) => INVITE_CODE_ALPHABET.includes(character))
}
