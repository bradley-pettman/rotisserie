export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export function strict<Args extends unknown[], T>(
  fetch: (...args: Args) => Promise<T | null>,
  entity: string
): (...args: Args) => Promise<NonNullable<T>> {
  return async (...args) => {
    const result = await fetch(...args)
    if (result === null || result === undefined) throw new NotFoundError(`${entity} not found`)
    return result
  }
}
