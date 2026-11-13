import { describe, expect, it } from 'vitest';
import { createSafeStorage } from './storage';
import { validateCityQuery, validateReminderTime } from './validation';
import { dayLabel, formatTemp } from './format';
import { isDue, localDateKey, nextOccurrence, type ReminderSettings } from '../reminder/schedule';

class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

describe('createSafeStorage', () => {
  it('persists through the backing store', () => {
    const backing = new MemoryStorage() as unknown as Storage;
    const s = createSafeStorage(() => backing);
    expect(s.isPersistent).toBe(true);
    s.set('a', [1, 2]);
    expect(backing.getItem('a')).toBe('[1,2]');
    expect(s.get('a', [])).toEqual([1, 2]);
  });

  it('falls back to memory when storage throws', () => {
    const s = createSafeStorage(() => {
      throw new Error('SecurityError');
    });
    expect(s.isPersistent).toBe(false);
    s.set('a', { ok: true });
    expect(s.get('a', null)).toEqual({ ok: true });
  });

  it('degrades when quota is exceeded mid-session', () => {
    const backing = new MemoryStorage();
    const s = createSafeStorage(() => backing as unknown as Storage);
    backing.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(s.set('a', 1)).toBe(false);
    expect(s.isPersistent).toBe(false);
    expect(s.get('a', 0)).toBe(1);
  });

  it('returns the fallback for corrupted or invalid data', () => {
    const backing = new MemoryStorage();
    backing.setItem('bad', '{not json');
    backing.setItem('wrong', '"a string"');
    const s = createSafeStorage(() => backing as unknown as Storage);
    expect(s.get('bad', [])).toEqual([]);
    expect(s.get('wrong', [], (v): v is never[] => Array.isArray(v))).toEqual([]);
  });
});

describe('validateCityQuery', () => {
  it.each([
    ['', 'Enter a city name to search.'],
    ['   ', 'Enter a city name to search.'],
    ['a', 'Type at least 2 letters.'],
    ['L4hore', 'City names can only contain letters, spaces, hyphens, periods and apostrophes.'],
    ['Lahore!', 'City names can only contain letters, spaces, hyphens, periods and apostrophes.'],
  ])('rejects %j', (input, message) => {
    expect(validateCityQuery(input)).toBe(message);
  });

  it.each(['Lahore', "St. John's", 'Winston-Salem', 'Zürich', 'São Paulo', '東京'])('accepts %j', (input) => {
    expect(validateCityQuery(input)).toBeNull();
  });
});

describe('validateReminderTime', () => {
  it('accepts HH:MM and rejects the rest', () => {
    expect(validateReminderTime('07:30')).toBeNull();
    expect(validateReminderTime('23:59')).toBeNull();
    expect(validateReminderTime('')).not.toBeNull();
    expect(validateReminderTime('24:00')).not.toBeNull();
    expect(validateReminderTime('7:30')).not.toBeNull();
  });
});

describe('format', () => {
  it('converts units', () => {
    expect(formatTemp(0, 'F')).toBe('32°');
    expect(formatTemp(21.6, 'C')).toBe('22°');
  });
  it('labels days relative to the city', () => {
    expect(dayLabel('2026-11-14', '2026-11-14')).toBe('Today');
    expect(dayLabel('2026-11-15', '2026-11-14')).toBe('Tomorrow');
    expect(dayLabel('2026-11-16', '2026-11-14')).toBe('Mon');
  });
});

describe('reminder schedule', () => {
  const base: ReminderSettings = { enabled: true, time: '07:30', lastShownDate: null, city: null, unit: 'C' };

  it('schedules later today if the time has not passed', () => {
    const now = new Date(2026, 10, 14, 6, 0);
    expect(nextOccurrence(base, now)).toEqual(new Date(2026, 10, 14, 7, 30));
  });

  it('schedules tomorrow if the time has passed or it already fired', () => {
    expect(nextOccurrence(base, new Date(2026, 10, 14, 8, 0))).toEqual(new Date(2026, 10, 15, 7, 30));
    const shown = { ...base, lastShownDate: '2026-11-14' };
    expect(nextOccurrence(shown, new Date(2026, 10, 14, 6, 0))).toEqual(new Date(2026, 10, 15, 7, 30));
  });

  it('isDue only inside the window and once per day', () => {
    expect(isDue(base, new Date(2026, 10, 14, 7, 29))).toBe(false);
    expect(isDue(base, new Date(2026, 10, 14, 7, 30))).toBe(true);
    expect(isDue(base, new Date(2026, 10, 14, 10, 0))).toBe(true);
    expect(isDue(base, new Date(2026, 10, 14, 11, 0))).toBe(false);
    expect(isDue({ ...base, lastShownDate: '2026-11-14' }, new Date(2026, 10, 14, 8, 0))).toBe(false);
    expect(isDue({ ...base, enabled: false }, new Date(2026, 10, 14, 8, 0))).toBe(false);
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
