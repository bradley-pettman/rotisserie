type Headers = Record<string, string>

export async function request(
  base: string,
  method: string,
  path: string,
  body?: unknown,
  headers: Headers = {}
): Promise<unknown> {
  const response = await fetch(new URL(path, base), {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  if (!response.ok) throw new Error(`${method} ${path} failed with ${response.status}: ${await response.text()}`)
  return response.status === 204 ? null : response.json()
}

export function promptHidden(label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process
    let value = ''
    const finish = (outcome: () => void) => {
      stdin.setRawMode?.(false)
      stdin.pause()
      stdin.off('data', onData)
      stdout.write('\n')
      outcome()
    }
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish(() => resolve(value))
        if (char === '\u0003') return finish(() => reject(new Error('Cancelled')))
        value = char === '\u007f' || char === '\b' ? value.slice(0, -1) : value + char
      }
    }
    stdout.write(label)
    stdin.setEncoding('utf8')
    stdin.setRawMode?.(true)
    stdin.resume()
    stdin.on('data', onData)
  })
}
