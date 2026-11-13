import type { City, DailyForecast, WeatherData } from '../types';
import { capitalise, owmCondition } from './conditions';
import { ApiError } from './errors';
import { fetchJson } from './http';

const BASE = 'https://api.openweathermap.org/data/2.5';
const SERVICE = 'OpenWeatherMap';

interface OwmWeather {
  id: number;
  description: string;
  icon: string;
}

export interface OwmCurrentResponse {
  dt: number;
  timezone: number;
  main: { temp: number; feels_like: number; humidity: number };
  wind: { speed: number };
  weather: OwmWeather[];
}

export interface OwmForecastSlot {
  dt: number;
  main: { temp_min: number; temp_max: number };
  weather: OwmWeather[];
}

export interface OwmForecastResponse {
  list: OwmForecastSlot[];
  city: { timezone: number };
}

/** YYYY-MM-DD for a unix-seconds timestamp, in a fixed UTC offset (not the browser's zone). */
export function localDateKey(unixSec: number, offsetSec: number): string {
  return new Date((unixSec + offsetSec) * 1000).toISOString().slice(0, 10);
}

function localHour(unixSec: number, offsetSec: number): number {
  return new Date((unixSec + offsetSec) * 1000).getUTCHours();
}

/**
 * The free forecast endpoint returns 40 three-hour slots, not days. Group them
 * by the CITY's local date, take min/max per day, and use the slot nearest to
 * local noon for the day's condition. Today is dropped if fewer than 2 slots
 * remain for it (late evening) and we still have 5 other days.
 */
export function groupForecastByDay(
  list: OwmForecastSlot[],
  offsetSec: number,
  nowSec: number,
  days = 5,
): DailyForecast[] {
  const groups = new Map<string, OwmForecastSlot[]>();
  for (const slot of list) {
    const key = localDateKey(slot.dt, offsetSec);
    const bucket = groups.get(key);
    if (bucket) bucket.push(slot);
    else groups.set(key, [slot]);
  }

  const today = localDateKey(nowSec, offsetSec);
  let entries = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  const todayEntry = entries.find(([key]) => key === today);
  if (todayEntry && todayEntry[1].length < 2 && entries.length > days) {
    entries = entries.filter(([key]) => key !== today);
  }

  return entries.slice(0, days).map(([date, slots]) => {
    const noonSlot = slots.reduce((best, slot) =>
      Math.abs(localHour(slot.dt, offsetSec) - 12) < Math.abs(localHour(best.dt, offsetSec) - 12) ? slot : best,
    );
    const weather = noonSlot.weather[0];
    return {
      date,
      minC: Math.min(...slots.map((s) => s.main.temp_min)),
      maxC: Math.max(...slots.map((s) => s.main.temp_max)),
      condition: owmCondition(weather?.id ?? 800),
      description: capitalise(weather?.description ?? 'Unknown conditions'),
    };
  });
}

export function normaliseOwm(
  city: City,
  current: OwmCurrentResponse,
  forecast: OwmForecastResponse,
  now = Date.now(),
): WeatherData {
  const weather = current.weather[0];
  const offset = current.timezone ?? forecast.city.timezone ?? 0;
  const daily = groupForecastByDay(forecast.list, offset, Math.floor(now / 1000));
  if (daily.length === 0) throw new ApiError('bad-response', `${SERVICE} returned an empty forecast`);

  // Fold the live temperature into today's range so "now" never sits outside it.
  if (daily[0].date === localDateKey(Math.floor(now / 1000), offset)) {
    daily[0] = {
      ...daily[0],
      minC: Math.min(daily[0].minC, current.main.temp),
      maxC: Math.max(daily[0].maxC, current.main.temp),
    };
  }

  return {
    city,
    current: {
      tempC: current.main.temp,
      feelsLikeC: current.main.feels_like,
      humidity: current.main.humidity,
      windMs: current.wind.speed,
      condition: owmCondition(weather?.id ?? 800),
      description: capitalise(weather?.description ?? 'Unknown conditions'),
      isDay: !(weather?.icon ?? 'd').endsWith('n'),
      observedAt: current.dt * 1000,
    },
    daily,
    source: 'openweathermap',
    fetchedAt: now,
    timezoneOffsetSec: offset,
  };
}

export async function getOpenWeather(city: City, apiKey: string, signal?: AbortSignal): Promise<WeatherData> {
  if (!apiKey) throw new ApiError('missing-key', `${SERVICE} API key is not configured`);
  const qs = `lat=${city.lat}&lon=${city.lon}&units=metric&appid=${encodeURIComponent(apiKey)}`;
  const [current, forecast] = await Promise.all([
    fetchJson<OwmCurrentResponse>(`${BASE}/weather?${qs}`, SERVICE, { signal }),
    fetchJson<OwmForecastResponse>(`${BASE}/forecast?${qs}`, SERVICE, { signal }),
  ]);
  if (!current?.main || !Array.isArray(forecast?.list)) {
    throw new ApiError('bad-response', `${SERVICE} response was missing fields`);
  }
  return normaliseOwm(city, current, forecast);
}
