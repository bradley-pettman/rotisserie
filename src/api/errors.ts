import type { Context } from 'hono'

export type ErrorCode = 'validation' | 'not_found' | 'conflict' | 'internal'

export type ErrorBody = {
  error: {
    code: ErrorCode
    message: string
    fields?: Record<string, string[]>
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export function handleError(error: Error, c: Context): Response {
  throw new Error('Not implemented')
}

export function handleNotFound(c: Context): Response {
  throw new Error('Not implemented')
}
