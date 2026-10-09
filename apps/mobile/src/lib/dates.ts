const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function fromIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
}

export function today(): string {
  return toIsoDate(new Date())
}

export function addDays(iso: string, days: number): string {
  const date = fromIsoDate(iso)
  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

export function daysBetween(from: string, to: string): string[] {
  const days: string[] = []
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day)
  return days
}

export function startOfWeek(iso: string): string {
  const offset = (fromIsoDate(iso).getDay() + 6) % 7
  return addDays(iso, -offset)
}

export function weekdayShort(iso: string): string {
  return WEEKDAYS[fromIsoDate(iso).getDay()] ?? ''
}

export function dayOfMonth(iso: string): number {
  return fromIsoDate(iso).getDate()
}

export function shortDate(iso: string): string {
  const date = fromIsoDate(iso)
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`
}

export function dayLabel(iso: string): string {
  return `${weekdayShort(iso)}, ${shortDate(iso)}`
}

export function relativeDayLabel(iso: string, now = today()): string {
  if (iso === now) return 'Today'
  if (iso === addDays(now, 1)) return 'Tomorrow'
  if (iso === addDays(now, -1)) return 'Yesterday'
  return dayLabel(iso)
}
