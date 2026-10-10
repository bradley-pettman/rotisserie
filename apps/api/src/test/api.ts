import { app } from '~/api/app'
import { defaultMember } from './accounts'

export async function send(
  method: string,
  path: string,
  body?: unknown,
  options: { as?: { token: string } | null } = {}
): Promise<{ status: number; body: any }> {
  const caller = options.as === undefined ? defaultMember() : options.as
  const headers: Record<string, string> = {}
  if (caller !== null) headers.Authorization = `Bearer ${caller.token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const response = await app.request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  return { status: response.status, body: response.status === 204 ? null : await response.json() }
}
