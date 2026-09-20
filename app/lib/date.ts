/**
 * Calendar-day and duration formatting.
 *
 * Every date here is a CALENDAR DAY as 'YYYY-MM-DD', never a Date, because
 * that is the shape the query layer hands over (see the DATE note in
 * CLAUDE.md). Parsing one with `new Date("2026-09-20")` reads it as UTC
 * midnight and prints the 19th anywhere west of UTC, so the helpers below
 * either work on the string directly or pin formatting to UTC.
 */

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** A calendar day as a UTC-pinned Date, safe to read weekday/month off. */
function parseDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

/** Today in the server's LOCAL time as 'YYYY-MM-DD' — not toISOString(). */
export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const date = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${date}`;
}

export function addDays(day: string, count: number): string {
  const date = parseDay(day);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

/**
 * The Sunday on or before `day`. Weeks run Sunday to Saturday throughout.
 */
export function startOfWeek(day: string): string {
  return addDays(day, -parseDay(day).getUTCDay());
}

export function weekdayShort(day: string): string {
  return WEEKDAY[parseDay(day).getUTCDay()];
}

export function dayOfMonth(day: string): number {
  return parseDay(day).getUTCDate();
}

/** "Sep 20" */
export function shortDate(day: string): string {
  const date = parseDay(day);
  return `${MONTH[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** "Sun, Sep 20" */
export function mediumDate(day: string): string {
  return `${weekdayShort(day)}, ${shortDate(day)}`;
}

/** "Sep 20 – 26" for a week, collapsing the month when both ends share it. */
export function dateRange(from: string, to: string): string {
  const start = parseDay(from);
  const end = parseDay(to);
  return start.getUTCMonth() === end.getUTCMonth()
    ? `${MONTH[start.getUTCMonth()]} ${start.getUTCDate()} – ${end.getUTCDate()}`
    : `${shortDate(from)} – ${shortDate(to)}`;
}

/**
 * "Today" / "Yesterday" / "3 days ago" / "Sep 2" against a reference day.
 * Both arguments are calendar days, so this is plain integer arithmetic on
 * UTC-pinned dates — no timezone can shift the answer by one.
 */
/**
 * `reference` is REQUIRED, and that is the whole point of this signature.
 *
 * It used to default to `todayIso()`, which is `new Date()` -- evaluated at
 * call time, during render. On the server that reads the Node process's
 * timezone; in the browser it reads the user's. A cook on 2026-09-19, rendered
 * at 18:00 in UTC-7 from a UTC server, is "Yesterday" in the SSR HTML and
 * "Today" after hydration: React reports a mismatch and re-renders, and the
 * user watches the label change.
 *
 * Today has to come from the loader, where it is computed once per request and
 * shipped with the data. Making the parameter required is what forces that:
 * the compiler now finds every place that would otherwise have guessed.
 */
export function relativeDay(day: string, reference: string): string {
  const days = Math.round(
    (parseDay(reference).getTime() - parseDay(day).getTime()) / 86_400_000
  );

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days === -1) return "Tomorrow";
  if (days > 1 && days < 7) return `${days} days ago`;
  if (days < -1 && days > -7) return `in ${-days} days`;
  return shortDate(day);
}

/** 95 -> "1h 35m", 40 -> "40m", 0/null -> null so callers can omit the field. */
export function duration(minutes: number | null | undefined): string | null {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * Total hands-on-to-table time, or null when neither half is recorded.
 * `(prep || 0) + (cook || 0)` would render "0m" for a recipe that records
 * neither — a number that reads as a measurement rather than a blank.
 */
export function totalTime(
  prep: number | null | undefined,
  cook: number | null | undefined
): number | null {
  const total = (prep ?? 0) + (cook ?? 0);
  return total > 0 ? total : null;
}

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
