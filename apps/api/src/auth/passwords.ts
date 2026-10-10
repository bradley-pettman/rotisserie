import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

type ScryptParams = { logN: number; r: number; p: number }

const PARAMS: ScryptParams = { logN: 15, r: 8, p: 3 }
const SALT_BYTES = 16
const KEY_BYTES = 32
const MAX_MEMORY = 64 * 1024 * 1024
const PHC = /^\$scrypt\$ln=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/

function derive(password: string, salt: Buffer, { logN, r, p }: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_BYTES, { N: 2 ** logN, r, p, maxmem: MAX_MEMORY }, (error, key) =>
      error ? reject(error) : resolve(key)
    )
  })
}

function base64(buffer: Buffer): string {
  return buffer.toString('base64').replace(/=+$/, '')
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const key = await derive(password, salt, PARAMS)
  return `$scrypt$ln=${PARAMS.logN},r=${PARAMS.r},p=${PARAMS.p}$${base64(salt)}$${base64(key)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = PHC.exec(stored)
  if (match === null) return false

  const [, logN, r, p, salt = '', key = ''] = match
  const expected = Buffer.from(key, 'base64')
  const actual = await derive(password, Buffer.from(salt, 'base64'), { logN: Number(logN), r: Number(r), p: Number(p) })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

let decoy: Promise<string> | undefined

export async function verifyNoPassword(password: string): Promise<false> {
  decoy ??= hashPassword(randomBytes(SALT_BYTES).toString('hex'))
  await verifyPassword(password, await decoy)
  return false
}
