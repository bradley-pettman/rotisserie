import type z from 'zod'

const baseUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string[]>
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type Query = Record<string, string | number | undefined>

export type SessionErrorCode = 'unauthenticated' | 'no_household'

let sessionToken: string | null = null
let sessionErrorListener: (code: SessionErrorCode) => void = () => {}

export function setSessionToken(token: string | null): void {
  sessionToken = token
}

export function onSessionError(listener: (code: SessionErrorCode) => void): () => void {
  sessionErrorListener = listener
  return () => {
    if (sessionErrorListener === listener) sessionErrorListener = () => {}
  }
}

function url(path: string, query?: Query): string {
  const params = Object.entries(query ?? {}).filter((entry): entry is [string, string | number] => entry[1] !== undefined)
  const search = new URLSearchParams(params.map(([key, value]) => [key, String(value)])).toString()
  return `${baseUrl}${path}${search ? `?${search}` : ''}`
}

async function request(method: string, path: string, options: { query?: Query; body?: unknown } = {}): Promise<unknown> {
  const headers: Record<string, string> = {}
  if (sessionToken !== null) headers.Authorization = `Bearer ${sessionToken}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  const response = await fetch(url(path, options.query), {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  })
  if (response.status === 204) return null
  const json: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = (json as { error?: { code?: string; message?: string; fields?: Record<string, string[]> } } | null)?.error
    const apiError = new ApiError(
      response.status,
      error?.code ?? 'internal',
      error?.message ?? response.statusText,
      error?.fields
    )
    if (sessionToken !== null && (apiError.code === 'unauthenticated' || apiError.code === 'no_household')) {
      sessionErrorListener(apiError.code)
    }
    throw apiError
  }
  return json
}

export const api = {
  async get<T extends z.ZodType>(schema: T, path: string, query?: Query): Promise<z.output<T>> {
    return schema.parse(await request('GET', path, { query }))
  },
  async post<T extends z.ZodType>(schema: T, path: string, body: unknown): Promise<z.output<T>> {
    return schema.parse(await request('POST', path, { body }))
  },
  async put<T extends z.ZodType>(schema: T, path: string, body: unknown): Promise<z.output<T>> {
    return schema.parse(await request('PUT', path, { body }))
  },
  async patch<T extends z.ZodType>(schema: T, path: string, body: unknown): Promise<z.output<T>> {
    return schema.parse(await request('PATCH', path, { body }))
  },
  async delete(path: string): Promise<void> {
    await request('DELETE', path)
  }
}
