import { app } from '~/api/app'

export async function send(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const response = await app.request(
    path,
    body === undefined ? { method } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  )
  return { status: response.status, body: response.status === 204 ? null : await response.json() }
}
