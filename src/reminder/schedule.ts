/**
 * Pure reminder timing logic, shared by the page and the service worker.
 * Times are in the DEVICE's local time zone (the user's morning), not the
 * selected city's.
 */

export interface ReminderCity {
  name: string;
  lat: number;
  lon: number;
}

export interface ReminderSettings {
  enabled: boolean;
  /** "HH:MM", 24-hour, device local time. */
  time: string;
  /** Device-local YYYY-MM-DD of the last reminder shown, so we never show two a day. */
  lastShownDate: string | null;
  city: ReminderCity | null;
  unit: 'C' | 'F';
}

export const DEFAULT_REMINDER: ReminderSettings = {
  enabled: false,
  time: '07:30',
  lastShownDate: null,
  city: null,
  unit: 'C',
};

/**
 * A background wake-up (Periodic Background Sync) can arrive hours late.
 * A "good morning" reminder at 10 pm is noise, so we only show it within
 * this window after the chosen time and otherwise skip that day.
 */
export const LATE_WINDOW_MS = 3 * 60 * 60 * 1000;

export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function atTime(base: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Next moment the reminder should fire, strictly after `now` unless today's is still pending. */
export function nextOccurrence(settings: Pick<ReminderSettings, 'time' | 'lastShownDate'>, now = new Date()): Date {
  const today = atTime(now, settings.time);
  const shownToday = settings.lastShownDate === localDateKey(now);
  if (today.getTime() > now.getTime() && !shownToday) return today;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return atTime(tomorrow, settings.time);
}

/** Should a reminder be shown right now? */
export function isDue(settings: ReminderSettings, now = new Date()): boolean {
  if (!settings.enabled) return false;
  if (settings.lastShownDate === localDateKey(now)) return false;
  const scheduled = atTime(now, settings.time).getTime();
  const t = now.getTime();
  return t >= scheduled && t - scheduled <= LATE_WINDOW_MS;
}
