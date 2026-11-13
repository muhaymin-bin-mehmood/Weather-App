export type TempUnit = 'C' | 'F';

export function toUnit(celsius: number, unit: TempUnit): number {
  return unit === 'C' ? celsius : celsius * 1.8 + 32;
}

export function formatTemp(celsius: number, unit: TempUnit): string {
  return `${Math.round(toUnit(celsius, unit))}°`;
}

export function formatWind(ms: number, unit: TempUnit): string {
  // Pair metric temperature with km/h and imperial with mph — what people expect.
  return unit === 'C' ? `${Math.round(ms * 3.6)} km/h` : `${Math.round(ms * 2.237)} mph`;
}

/** "Today", "Tomorrow" or a weekday, relative to the city's own local date. */
export function dayLabel(date: string, cityToday: string): string {
  if (date === cityToday) return 'Today';
  const d = new Date(`${date}T00:00:00Z`);
  const t = new Date(`${cityToday}T00:00:00Z`);
  if (d.getTime() - t.getTime() === 86_400_000) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
}

export function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** Today's YYYY-MM-DD in a fixed UTC offset. */
export function cityToday(offsetSec: number, now = Date.now()): string {
  return new Date(now + offsetSec * 1000).toISOString().slice(0, 10);
}

/** Local time in the city, e.g. "14:05". */
export function cityTime(offsetSec: number, now = Date.now()): string {
  return new Date(now + offsetSec * 1000).toISOString().slice(11, 16);
}

export function relativeTime(then: number, now = Date.now()): string {
  const mins = Math.round((now - then) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}
