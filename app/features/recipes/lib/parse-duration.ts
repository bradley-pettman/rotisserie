/**
 * Parses an ISO 8601 duration string and returns the total number of minutes.
 *
 * @param iso - ISO 8601 duration string (e.g., "PT30M", "PT1H30M", "P1DT2H")
 * @returns Total minutes as an integer, or null if unparseable
 *
 * @example
 * parseDuration("PT30M") // 30
 * parseDuration("PT1H30M") // 90
 * parseDuration("PT2H") // 120
 * parseDuration("P0DT1H0M") // 60
 * parseDuration("P1D") // 1440 (24 hours)
 * parseDuration("P2DT3H15M") // 3075 (2 days + 3 hours + 15 minutes)
 * parseDuration("PT90S") // 0 (seconds are ignored/floored)
 * parseDuration("") // null
 * parseDuration(undefined) // null
 * parseDuration("invalid") // null
 */
export function parseDuration(iso: string | undefined | null): number | null {
  if (!iso || typeof iso !== 'string') {
    return null;
  }

  // ISO 8601 duration regex
  // P[n]DT[n]H[n]M[n]S
  // P = period marker (required)
  // D = days
  // T = time marker (required if H, M, or S are present)
  // H = hours
  // M = minutes
  // S = seconds
  //
  // The `T` is REQUIRED before H/M/S, not optional. ISO 8601 reuses `M` for
  // both months (date part) and minutes (time part), and the marker is what
  // separates them -- so with `T?` the date-part `M` fell through to the
  // minutes capture and `P1M`, which means one month, parsed as one minute.
  // `P1H` -- not valid ISO at all -- parsed as 60 minutes for the same reason.
  // Months are deliberately not supported: no recipe has a prep time in
  // months, and guessing at 30 days would be worse than declining.
  const regex = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i;
  const match = iso.match(regex);

  if (!match) {
    return null;
  }

  // If the string is just "P" or "PT" with no actual duration values, it's invalid
  const [, days, hours, minutes, seconds] = match;
  if (!days && !hours && !minutes && !seconds) {
    return null;
  }

  // Calculate total minutes
  let totalMinutes = 0;

  if (days) {
    totalMinutes += parseInt(days, 10) * 24 * 60; // 1 day = 1440 minutes
  }

  if (hours) {
    totalMinutes += parseInt(hours, 10) * 60;
  }

  if (minutes) {
    totalMinutes += parseInt(minutes, 10);
  }

  // Seconds are ignored (floored to minutes)
  // No need to process seconds parameter

  return totalMinutes;
}