export class InvalidCursorError extends Error {
  constructor() {
    super('Invalid cursor')
    this.name = 'InvalidCursorError'
  }
}

export function isoTimestamp(column: string): string {
  return `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
}

export function isoDate(column: string): string {
  return `to_char(${column}, 'YYYY-MM-DD')`
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

export function encodeCursor(values: string[]): string {
  return Buffer.from(JSON.stringify(values)).toString('base64url')
}

export function decodeCursor(cursor: string, length: number): string[] {
  let values: unknown
  try {
    values = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    throw new InvalidCursorError()
  }
  if (!Array.isArray(values) || values.length !== length || !values.every((value) => typeof value === 'string')) {
    throw new InvalidCursorError()
  }
  return values
}
