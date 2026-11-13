import { describe, expect, it } from 'vitest';
import { owmCondition, wmoCondition } from './conditions';
import { normaliseOpenMeteo } from './openMeteo';
import { groupForecastByDay, localDateKey, type OwmForecastSlot } from './openWeather';
import { isSameCity } from './cities';
import type { City } from '../types';

const city: City = { id: 'x', name: 'Test', country: 'Nowhere', countryCode: 'NW', lat: 0, lon: 0 };

/** 40 three-hour slots starting at `startUtc`, temps rising by 1 each slot. */
function slots(startUtc: string, count = 40): OwmForecastSlot[] {
  const start = Date.parse(startUtc) / 1000;
  return Array.from({ length: count }, (_, i) => ({
    dt: start + i * 3 * 3600,
    main: { temp_min: i, temp_max: i + 0.5 },
    weather: [{ id: i % 2 ? 500 : 800, description: i % 2 ? 'light rain' : 'clear sky', icon: '01d' }],
  }));
}

describe('groupForecastByDay', () => {
  it('groups by the city local date (UTC+5, Karachi), not by UTC', () => {
    // 2026-11-13 21:00 UTC is 02:00 on the 14th in UTC+5.
    const list = slots('2026-11-13T21:00:00Z');
    const now = Date.parse('2026-11-13T20:30:00Z') / 1000; // 01:30 local on the 14th
    const days = groupForecastByDay(list, 5 * 3600, now);
    expect(days).toHaveLength(5);
    expect(days[0].date).toBe('2026-11-14');
    expect(days.map((d) => d.date)).toEqual(['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']);
    // Slot 0 (02:00 local) to slot 7 (23:00 local) belong to the 14th.
    expect(days[0].minC).toBe(0);
    expect(days[0].maxC).toBe(7.5);
  });

  it('handles negative offsets (UTC-8, Los Angeles)', () => {
    // 2026-11-14 06:00 UTC is 22:00 on the 13th in UTC-8.
    const list = slots('2026-11-14T06:00:00Z');
    const now = Date.parse('2026-11-14T05:00:00Z') / 1000; // 21:00 local on the 13th
    const days = groupForecastByDay(list, -8 * 3600, now);
    // Only one slot left for the 13th, so it's dropped in favour of 5 full-ish days.
    expect(days[0].date).toBe('2026-11-14');
    expect(days).toHaveLength(5);
    expect(new Set(days.map((d) => d.date)).size).toBe(5);
  });

  it('picks the condition from the slot nearest local noon', () => {
    const list = slots('2026-11-14T00:00:00Z', 8); // UTC+0, hours 0..21
    const days = groupForecastByDay(list, 0, Date.parse('2026-11-13T23:00:00Z') / 1000);
    // 12:00 is slot index 4 → even → clear sky.
    expect(days[0].condition).toBe('clear');
  });

  it('localDateKey uses the given offset', () => {
    const t = Date.parse('2026-11-13T22:00:00Z') / 1000;
    expect(localDateKey(t, 0)).toBe('2026-11-13');
    expect(localDateKey(t, 5 * 3600)).toBe('2026-11-14');
  });
});

describe('condition mapping', () => {
  it('maps OpenWeatherMap ids', () => {
    expect(owmCondition(211)).toBe('thunder');
    expect(owmCondition(301)).toBe('drizzle');
    expect(owmCondition(502)).toBe('rain');
    expect(owmCondition(511)).toBe('snow');
    expect(owmCondition(741)).toBe('fog');
    expect(owmCondition(800)).toBe('clear');
    expect(owmCondition(802)).toBe('partly-cloudy');
    expect(owmCondition(804)).toBe('cloudy');
  });

  it('maps WMO codes', () => {
    expect(wmoCondition(0)).toBe('clear');
    expect(wmoCondition(2)).toBe('partly-cloudy');
    expect(wmoCondition(3)).toBe('cloudy');
    expect(wmoCondition(45)).toBe('fog');
    expect(wmoCondition(53)).toBe('drizzle');
    expect(wmoCondition(81)).toBe('rain');
    expect(wmoCondition(86)).toBe('snow');
    expect(wmoCondition(99)).toBe('thunder');
  });
});

describe('normaliseOpenMeteo', () => {
  it('produces local dates from unix midnight timestamps', () => {
    const offset = 5 * 3600;
    const midnight14 = Date.parse('2026-11-14T00:00:00Z') / 1000 - offset;
    const data = normaliseOpenMeteo(city, {
      utc_offset_seconds: offset,
      current: {
        time: midnight14 + 3600,
        temperature_2m: 20,
        apparent_temperature: 19,
        relative_humidity_2m: 40,
        wind_speed_10m: 3,
        weather_code: 61,
        is_day: 0,
      },
      daily: {
        time: [0, 1, 2, 3, 4].map((i) => midnight14 + i * 86400),
        weather_code: [0, 1, 3, 61, 95],
        temperature_2m_max: [25, 26, 27, 28, 29],
        temperature_2m_min: [10, 11, 12, 13, 14],
      },
    });
    expect(data.daily.map((d) => d.date)).toEqual(['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']);
    expect(data.current.condition).toBe('rain');
    expect(data.current.isDay).toBe(false);
    expect(data.source).toBe('open-meteo');
  });
});

describe('isSameCity', () => {
  it('matches the same place from different sources', () => {
    const a: City = { id: 'geodb:1', name: 'Lahore', country: 'Pakistan', countryCode: 'PK', lat: 31.549, lon: 74.343 };
    const b: City = { id: 'om:2', name: 'Lahore', country: 'Pakistan', countryCode: 'PK', lat: 31.558, lon: 74.351 };
    const c: City = { id: 'om:3', name: 'Paris', country: 'United States', countryCode: 'US', lat: 33.66, lon: -95.55 };
    const d: City = { id: 'om:4', name: 'Paris', country: 'France', countryCode: 'FR', lat: 48.85, lon: 2.35 };
    expect(isSameCity(a, b)).toBe(true);
    expect(isSameCity(c, d)).toBe(false);
  });
});
