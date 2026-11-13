import { formatTemp, type TempUnit } from '../lib/format';
import type { WeatherData } from '../types';

export const REMINDER_TAG = 'daily-weather';

export interface ReminderMessage {
  title: string;
  body: string;
}

/** Shared by the page and the service worker so both say the same thing. */
export function buildReminderMessage(data: WeatherData | null, cityName: string | null, unit: TempUnit): ReminderMessage {
  if (!data) {
    return {
      title: 'Good morning ☀️',
      body: cityName ? `Tap to see today's weather in ${cityName}.` : "Tap to check today's weather.",
    };
  }
  const today = data.daily[0];
  const range = today ? ` · H ${formatTemp(today.maxC, unit)} L ${formatTemp(today.minC, unit)}` : '';
  return {
    title: `Good morning — ${data.city.name}`,
    body: `${formatTemp(data.current.tempC, unit)}${unit}, ${data.current.description.toLowerCase()}${range}`,
  };
}
