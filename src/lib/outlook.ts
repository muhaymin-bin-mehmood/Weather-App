import type { ConditionKind, CurrentWeather } from '../types';
import { formatTemp, type TempUnit } from './format';

/*
 * The short editorial copy next to the temperature ("A calm end to the day.").
 * Everything here is derived from the live reading — condition, time of day,
 * wind and feels-like — so it never claims more than the data says.
 */

const LABEL: Record<ConditionKind, string> = {
  clear: 'Clear',
  'partly-cloudy': 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Foggy',
  drizzle: 'Drizzle',
  rain: 'Rain',
  thunder: 'Thunderstorms',
  snow: 'Snow',
};

/** "Clear tonight", "Rain today". */
export function conditionLine(condition: ConditionKind, isDay: boolean): string {
  return `${LABEL[condition]} ${isDay ? 'today' : 'tonight'}`;
}

const HEADLINE: Record<ConditionKind, [day: string, night: string]> = {
  clear: ['A bright, open sky.', 'A calm, clear night.'],
  'partly-cloudy': ['Sun and cloud, by turns.', 'A few clouds overhead.'],
  cloudy: ['A grey, settled sky.', 'A quiet, overcast night.'],
  fog: ['Low visibility out there.', 'A foggy night — take it slow.'],
  drizzle: ['A light drizzle about.', 'Light drizzle tonight.'],
  rain: ['Keep an umbrella close.', 'A wet night ahead.'],
  thunder: ['Storms in the area.', 'Storms around tonight.'],
  snow: ['Snow in the air.', 'Snow falling tonight.'],
};

/** Beaufort-ish wording from m/s. */
export function windPhrase(ms: number): string {
  if (ms < 1.5) return 'almost no wind';
  if (ms < 5.5) return 'a gentle breeze';
  if (ms < 10.8) return 'a fresh breeze';
  if (ms < 17.2) return 'strong winds';
  return 'gale-force winds';
}

export function feelWord(feelsLikeC: number): string {
  if (feelsLikeC < 0) return 'freezing';
  if (feelsLikeC < 10) return 'cold';
  if (feelsLikeC < 18) return 'cool';
  if (feelsLikeC < 26) return 'comfortable';
  if (feelsLikeC < 32) return 'warm';
  return 'hot';
}

export function outlook(current: CurrentWeather, unit: TempUnit): { headline: string; body: string } {
  const headline = HEADLINE[current.condition][current.isDay ? 0 : 1];
  const desc = current.description.charAt(0).toUpperCase() + current.description.slice(1);
  const humid = current.humidity >= 80 && current.feelsLikeC >= 18 ? ', and humid' : '';
  const body = `${desc} with ${windPhrase(current.windMs)}. Feels ${feelWord(current.feelsLikeC)} at ${formatTemp(
    current.feelsLikeC,
    unit,
  )}${humid}.`;
  return { headline, body };
}

/** "Friday, 13 November" for the city's own local date (YYYY-MM-DD). */
export function longDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/** Background mood for the page, from the current reading. */
export type Sky = 'clear-day' | 'clear-night' | 'cloudy' | 'fog' | 'rain' | 'storm' | 'snow';

export function skyFor(condition: ConditionKind, isDay: boolean): Sky {
  switch (condition) {
    case 'clear':
    case 'partly-cloudy':
      return isDay ? 'clear-day' : 'clear-night';
    case 'cloudy':
      return 'cloudy';
    case 'fog':
      return 'fog';
    case 'drizzle':
    case 'rain':
      return 'rain';
    case 'thunder':
      return 'storm';
    case 'snow':
      return 'snow';
  }
}
