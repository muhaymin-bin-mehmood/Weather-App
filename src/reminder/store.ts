import { get, set } from 'idb-keyval';
import { DEFAULT_REMINDER, type ReminderSettings } from './schedule';

/**
 * Reminder settings live in IndexedDB, not localStorage, because the service
 * worker has to read them and service workers cannot access localStorage.
 */
const KEY = 'wb:reminder';

export async function loadReminder(): Promise<ReminderSettings> {
  try {
    const value = await get<Partial<ReminderSettings>>(KEY);
    return { ...DEFAULT_REMINDER, ...(value ?? {}) };
  } catch {
    return { ...DEFAULT_REMINDER };
  }
}

export async function saveReminder(settings: ReminderSettings): Promise<boolean> {
  try {
    await set(KEY, settings);
    return true;
  } catch {
    return false;
  }
}
