import type { ApiError } from './api/errors';

export type ConditionKind =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'thunder';

export interface City {
  /** Source-prefixed id, e.g. "geodb:3453" or "om:1172451". */
  id: string;
  name: string;
  region?: string;
  country: string;
  countryCode: string;
  lat: number;
  lon: number;
}

export interface CurrentWeather {
  tempC: number;
  feelsLikeC: number;
  humidity: number;
  windMs: number;
  condition: ConditionKind;
  description: string;
  isDay: boolean;
  /** Unix ms of the observation. */
  observedAt: number;
}

export interface DailyForecast {
  /** YYYY-MM-DD in the city's local time. */
  date: string;
  minC: number;
  maxC: number;
  condition: ConditionKind;
  description: string;
}

export type WeatherSource = 'openweathermap' | 'open-meteo';

export interface WeatherData {
  city: City;
  current: CurrentWeather;
  daily: DailyForecast[];
  source: WeatherSource;
  /** Unix ms when we fetched it. */
  fetchedAt: number;
  /** City's UTC offset in seconds, used to label days in the city's own time. */
  timezoneOffsetSec: number;
}

export type AsyncState<T> =
  | { status: 'idle'; data: null; error: null }
  | { status: 'loading'; data: T | null; error: null }
  | { status: 'success'; data: T; error: null }
  | { status: 'error'; data: T | null; error: ApiError };
