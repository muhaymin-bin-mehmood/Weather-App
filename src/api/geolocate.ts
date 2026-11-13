import type { City } from '../types';
import { fetchJson } from './http';

/*
 * "Use my current location": browser geolocation, then a place name from
 * OpenWeatherMap's reverse geocoder. The weather itself only needs the
 * coordinates, so if naming fails the city is simply called "Current
 * location" — the forecast still loads.
 */

const OWM_KEY: string = import.meta.env.VITE_OWM_KEY ?? '';

export type LocateErrorKind = 'unsupported' | 'insecure' | 'denied' | 'unavailable' | 'timeout';

export class LocateError extends Error {
  constructor(public kind: LocateErrorKind) {
    super(kind);
  }
}

/** What failed and what the user can do about it. */
export function locateMessage(kind: LocateErrorKind): string {
  switch (kind) {
    case 'unsupported':
      return 'This browser can’t share your location. Search for your city instead.';
    case 'insecure':
      return 'Location only works on a secure (https) page. Search for your city instead.';
    case 'denied':
      return 'Location access is blocked for this site. Allow it in your browser’s site settings, or search for your city.';
    case 'unavailable':
      return 'Your device couldn’t find its location right now. Check that location services are on, or search for your city.';
    case 'timeout':
      return 'Finding your location took too long. Try again, or search for your city.';
  }
}

export function getPosition(timeoutMs = 10_000): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new LocateError('unsupported'));
    if (!window.isSecureContext) return reject(new LocateError('insecure'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) =>
        reject(
          new LocateError(
            err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable',
          ),
        ),
      // City-level accuracy is plenty for weather and is faster and kinder to battery.
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60 * 1000 },
    );
  });
}

interface OwmReverse {
  name: string;
  local_names?: Record<string, string>;
  state?: string;
  country: string;
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();

export async function nameForCoords(lat: number, lon: number, signal?: AbortSignal): Promise<City> {
  const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
  const fallback: City = {
    id: `geo:${r4(lat)},${r4(lon)}`,
    name: 'Current location',
    country: '',
    countryCode: '',
    lat: r4(lat),
    lon: r4(lon),
  };
  if (!OWM_KEY) return fallback;
  try {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon), limit: '1', appid: OWM_KEY });
    const res = await fetchJson<OwmReverse[]>(
      `https://api.openweathermap.org/geo/1.0/reverse?${params}`,
      'OpenWeatherMap Geocoding',
      { signal },
    );
    const place = res[0];
    if (!place?.name) return fallback;
    return {
      ...fallback,
      name: place.local_names?.en ?? place.name,
      region: place.state || undefined,
      country: regionNames?.of(place.country) ?? place.country,
      countryCode: place.country,
    };
  } catch {
    return fallback; // naming is a nicety; the forecast only needs coordinates
  }
}

export async function locateMe(signal?: AbortSignal): Promise<City> {
  const { lat, lon } = await getPosition();
  return nameForCoords(lat, lon, signal);
}
