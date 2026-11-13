import type { City, WeatherData } from '../types';
import { ApiError, isAbort, toApiError } from './errors';
import { getOpenMeteo } from './openMeteo';
import { getOpenWeather } from './openWeather';

const OWM_KEY: string = import.meta.env.VITE_OWM_KEY ?? '';

/** Errors from the primary source that should trigger the Open-Meteo fallback. */
function shouldFallBack(err: ApiError): boolean {
  return ['missing-key', 'auth', 'rate-limit', 'server', 'network', 'bad-response', 'not-found'].includes(err.kind);
}

/**
 * OpenWeatherMap first, Open-Meteo when it is unconfigured, rate-limited or
 * failing. The UI only ever sees the normalised WeatherData shape.
 */
export async function getWeather(city: City, signal?: AbortSignal): Promise<WeatherData> {
  try {
    return await getOpenWeather(city, OWM_KEY, signal);
  } catch (err) {
    if (isAbort(err)) throw toApiError(err);
    const primary = toApiError(err);
    // Truly offline: the fallback would fail the same way, so skip the second wait.
    if (primary.kind === 'offline' || !shouldFallBack(primary)) throw primary;
    if (primary.kind !== 'missing-key') console.warn('[weather] OpenWeatherMap failed, using Open-Meteo:', primary.message);
    try {
      return await getOpenMeteo(city, signal);
    } catch (fallbackErr) {
      throw toApiError(fallbackErr);
    }
  }
}
