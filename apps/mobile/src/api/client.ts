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

function url(path: string, query?: Query): string {
  const params = Object.entries(query ?? {}).filter((entry): entry is [string, string | number] => entry[1] !== undefined)
  const search = new URLSearchParams(params.map(([key, value]) => [key, String(value)])).toString()
  return `${baseUrl}${path}${search ? `?${search}` : ''}`
}

async function request(method: string, path: string, options: { query?: Query; body?: unknown } = {}): Promise<unknown> {
  const response = await fetch(url(path, options.query), {
    method,
    headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  })
  if (response.status === 204) return null
  const json: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = (json as { error?: { code?: string; message?: string; fields?: Record<string, string[]> } } | null)?.error
    throw new ApiError(response.status, error?.code ?? 'internal', error?.message ?? response.statusText, error?.fields)
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
  async delete(path: string): Promise<void> {
    await request('DELETE', path)
  }
}
