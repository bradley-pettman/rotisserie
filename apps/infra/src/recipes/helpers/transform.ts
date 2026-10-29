export type Transform<T> = (props: T) => T

export function transformed<T>(defaults: T, transform?: Transform<T>): T {
  return transform ? transform(defaults) : defaults
}
