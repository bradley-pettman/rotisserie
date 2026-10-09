import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { groupBy, mapValues } from 'lodash-es'
import pg from 'pg'
import type z from 'zod'
import { InvalidCursorError } from '~/providers/sql'
import { NotFoundError } from '~/providers/errors'

export type ErrorCode = 'validation' | 'not_found' | 'conflict' | 'internal'

export type ErrorBody = {
  error: {
    code: ErrorCode
    message: string
    fields?: Record<string, string[]>
  }
}

export class RequestValidationError extends Error {
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super('Invalid request')
    this.name = 'RequestValidationError'
  }
}

export function rejectInvalid(result: { success: true } | { success: false; error: z.core.$ZodError }): void {
  if (!result.success) throw new RequestValidationError(result.error.issues)
}

const CONFLICT_CODES = ['23502', '23503', '23505', '23514']

function errorResponse(c: Context, status: ContentfulStatusCode, error: ErrorBody['error']): Response {
  return c.json<ErrorBody>({ error }, status)
}

export function handleError(error: Error, c: Context): Response {
  if (error instanceof RequestValidationError) {
    return errorResponse(c, 400, {
      code: 'validation',
      message: error.message,
      fields: mapValues(
        groupBy(error.issues, (issue) => issue.path.join('.')),
        (issues) => issues.map((issue) => issue.message)
      )
    })
  }
  if (error instanceof InvalidCursorError) {
    return errorResponse(c, 400, { code: 'validation', message: error.message })
  }
  if (error instanceof HTTPException) {
    return errorResponse(c, error.status, { code: 'validation', message: error.message })
  }
  if (error instanceof NotFoundError) {
    return errorResponse(c, 404, { code: 'not_found', message: error.message })
  }
  if (error instanceof pg.DatabaseError && CONFLICT_CODES.includes(error.code ?? '')) {
    return errorResponse(c, 409, { code: 'conflict', message: error.detail ?? error.message })
  }
  console.error(error)
  return errorResponse(c, 500, { code: 'internal', message: 'Something went wrong' })
}

export function handleNotFound(c: Context): Response {
  return errorResponse(c, 404, { code: 'not_found', message: `No route for ${c.req.method} ${c.req.path}` })
}
