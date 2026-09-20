/**
 * One definition of "is this a UUID", shared by the JSON API and the query
 * layer.
 *
 * WHY IT MATTERS HERE. Every primary key in this schema is a `uuid` column, so
 * `WHERE id = $1` has Postgres parse the value -- and a string that is not a
 * UUID is not a miss, it is `22P02 invalid input syntax for type uuid`, which
 * comes back as a rejected promise and a 500. The JSON API learned this early
 * and guards its path parameters; the HTML routes did not, so `/recipes?recipe=abc`
 * replaced the whole recipe list with an error page rather than simply opening
 * no drawer.
 *
 * Guarding in the query functions rather than at each call site is deliberate:
 * there is no id a caller could hold that is worth a 500, and a check that
 * lives next to the query cannot be forgotten by the next route to be written.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
