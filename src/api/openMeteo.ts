import type { City, WeatherData } from '../types';
import { wmoCondition, wmoDescription } from './conditions';
import { ApiError } from './errors';
import { fetchJson } from './http';

const SERVICE = 'Open-Meteo';

export interface OpenMeteoResponse {
  utc_offset_seconds: number;
  current: {
    time: number;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    weather_code: number;
    is_day: number;
  };
  daily: {
    /** Unix seconds of local midnight (we request timeformat=unixtime). */
    time: number[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
}

export function openMeteoUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '5',
    wind_speed_unit: 'ms',
    timeformat: 'unixtime',
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

export function normaliseOpenMeteo(city: City, res: OpenMeteoResponse, now = Date.now()): WeatherData {
  const { current, daily } = res;
  if (!current || !daily?.time?.length) throw new ApiError('bad-response', `${SERVICE} response was missing fields`);
  const offset = res.utc_offset_seconds ?? 0;

  return {
    city,
    current: {
      tempC: current.temperature_2m,
      feelsLikeC: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      windMs: current.wind_speed_10m,
      condition: wmoCondition(current.weather_code),
      description: wmoDescription(current.weather_code),
      isDay: current.is_day === 1,
      observedAt: current.time * 1000,
    },
    daily: daily.time.slice(0, 5).map((t, i) => ({
      date: new Date((t + offset) * 1000).toISOString().slice(0, 10),
      minC: daily.temperature_2m_min[i],
      maxC: daily.temperature_2m_max[i],
      condition: wmoCondition(daily.weather_code[i]),
      description: wmoDescription(daily.weather_code[i]),
    })),
    source: 'open-meteo',
    fetchedAt: now,
    timezoneOffsetSec: offset,
  };
}

export async function getOpenMeteo(city: City, signal?: AbortSignal): Promise<WeatherData> {
  const res = await fetchJson<OpenMeteoResponse>(openMeteoUrl(city.lat, city.lon), SERVICE, { signal });
  return normaliseOpenMeteo(city, res);
}
