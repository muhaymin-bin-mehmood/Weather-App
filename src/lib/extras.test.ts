import { describe, expect, it } from 'vitest';
import { countries, countryName } from './countries';
import { skyFor } from './outlook';

describe('weather background', () => {
  it('follows condition and time of day', () => {
    expect(skyFor('clear', true)).toBe('clear-day');
    expect(skyFor('partly-cloudy', false)).toBe('clear-night');
    expect(skyFor('drizzle', true)).toBe('rain');
    expect(skyFor('thunder', false)).toBe('storm');
    expect(skyFor('cloudy', false)).toBe('cloudy');
  });
});

describe('country filter list', () => {
  it('has every ISO code once, sorted by name', () => {
    const list = countries();
    expect(new Set(list.map((c) => c.code)).size).toBe(list.length);
    expect(list.length).toBeGreaterThan(240);
    const names = list.map((c) => c.name);
    expect([...names].sort((a, b) => a.localeCompare(b, 'en'))).toEqual(names);
  });
  it('names Pakistan', () => {
    expect(countryName('PK')).toBe('Pakistan');
  });
});

import { join, split } from '../components/TimePicker';

describe('time picker 12-hour conversion', () => {
  it('round-trips every minute of the day', () => {
    for (let h = 0; h < 24; h++)
      for (const m of ['00', '07', '30', '59']) {
        const v = `${String(h).padStart(2, '0')}:${m}`;
        const p = split(v);
        expect(join(p.hour, p.minute, p.period)).toBe(v);
      }
  });
  it('handles midnight and noon', () => {
    expect(split('00:15')).toEqual({ hour: '12', minute: '15', period: 'AM' });
    expect(split('12:00')).toEqual({ hour: '12', minute: '00', period: 'PM' });
    expect(join('12', '00', 'AM')).toBe('00:00');
  });
});
