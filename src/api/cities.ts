import type { City } from '../types';
import { ApiError, isAbort, toApiError } from './errors';
import { fetchJson } from './http';

const RAPIDAPI_KEY: string = import.meta.env.VITE_RAPIDAPI_KEY ?? '';
const GEODB_HOST = 'wft-geo-db.p.rapidapi.com';
const GEODB_SERVICE = 'GeoDB Cities';

/** GeoDB's free RapidAPI plan allows 1 request per second. */
export const GEODB_MIN_INTERVAL_MS = 1050;
const RATE_LIMIT_RETRY_MS = 1100;

interface GeoDbCity {
  id: number;
  name: string;
  region?: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  population?: number;
}

interface OpenMeteoGeoResult {
  id: number;
  name: string;
  admin1?: string;
  admin2?: string;
  country?: string;
  country_code?: string;
  latitude: number;
  longitude: number;
  population?: number;
}

/** 'mixed': GeoDB answered, but its list was thin, so Open-Meteo filled the gaps. */
export type CitySource = 'geodb' | 'open-meteo' | 'mixed';

/** A city plus the population we rank by. Population never reaches the UI. */
export interface Candidate {
  city: City;
  population: number;
  /** Second-level area (e.g. "Sanghar District"), used only to tell same-named places apart. */
  district?: string;
}

const MAX_SUGGESTIONS = 5;
/** A top result smaller than this suggests GeoDB missed the place people mean. */
const THIN_TOP_POPULATION = 50_000;
const THIN_COUNT = 3;

/**
 * GeoDB's data has gaps: in testing, "Lahore" (Pakistan, ~11 million people)
 * exists only as "Lahore District"/"Lahore Division" (ADM2), so a CITY search
 * returns just Lahore, Virginia (population 0). When GeoDB's list looks thin,
 * Open-Meteo's results are merged in.
 */
export function isThin(results: Candidate[]): boolean {
  return results.length < THIN_COUNT || Math.max(0, ...results.map((r) => r.population)) < THIN_TOP_POPULATION;
}

/** "Hyderābād" and "Hyderabad" are the same name for matching purposes. */
function plainName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function samePlace(a: City, b: City): boolean {
  return (
    plainName(a.name) === plainName(b.name) &&
    a.countryCode.toUpperCase() === b.countryCode.toUpperCase() &&
    Math.abs(a.lat - b.lat) < 0.5 &&
    Math.abs(a.lon - b.lon) < 0.5
  );
}

/** Merge, drop duplicates (GeoDB's entry wins), largest population first. */
export function mergeCandidates(primary: Candidate[], extra: Candidate[]): City[] {
  const merged: Candidate[] = [];
  // Also catches duplicates inside one source (GeoDB can list a city twice).
  for (const c of [...primary, ...extra]) if (!merged.some((m) => samePlace(m.city, c.city))) merged.push(c);
  return merged
    .map((c, i) => ({ ...c, i }))
    .sort((a, b) => b.population - a.population || a.i - b.i)
    .slice(0, MAX_SUGGESTIONS)
    .map((c, _i, list) => {
      // Several villages can share a name and province ("Hyderabad, Punjab" ×3);
      // add the district so the list doesn't look like duplicates.
      const ambiguous = list.some(
        (o) =>
          o !== c &&
          plainName(o.city.name) === plainName(c.city.name) &&
          o.city.region === c.city.region &&
          o.city.countryCode === c.city.countryCode,
      );
      return ambiguous && c.district && c.district !== c.city.region
        ? { ...c.city, region: [c.district, c.city.region].filter(Boolean).join(', ') }
        : c.city;
    });
}

export interface CitySearchResult {
  cities: City[];
  source: CitySource;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ApiError('aborted', 'Request cancelled'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new ApiError('aborted', 'Request cancelled'));
      },
      { once: true },
    );
  });
}

/**
 * Serialises GeoDB calls so two requests are never closer than the plan's
 * 1 req/s limit. Returns how long the caller had to wait (for the UI hint).
 */
let lastGeoDbRequestAt = 0;
async function geoDbGate(signal?: AbortSignal): Promise<void> {
  const elapsed = Date.now() - lastGeoDbRequestAt;
  if (elapsed < GEODB_MIN_INTERVAL_MS) await wait(GEODB_MIN_INTERVAL_MS - elapsed, signal);
  lastGeoDbRequestAt = Date.now();
}

async function searchGeoDb(query: string, signal?: AbortSignal, country?: string): Promise<Candidate[]> {
  const params = new URLSearchParams({
    namePrefix: query,
    limit: '5',
    sort: '-population',
    types: 'CITY',
  });
  if (country) params.set('countryIds', country);
  const request = async () => {
    await geoDbGate(signal);
    return fetchJson<{ data?: GeoDbCity[] }>(`https://${GEODB_HOST}/v1/geo/cities?${params}`, GEODB_SERVICE, {
      signal,
      headers: { 'X-RapidAPI-Key': RAPIDAPI_KEY, 'X-RapidAPI-Host': GEODB_HOST },
    });
  };

  let res: { data?: GeoDbCity[] };
  try {
    res = await request();
  } catch (err) {
    const apiErr = toApiError(err);
    if (apiErr.kind !== 'rate-limit') throw apiErr;
    await wait(RATE_LIMIT_RETRY_MS, signal);
    res = await request();
  }
  if (!Array.isArray(res.data)) throw new ApiError('bad-response', `${GEODB_SERVICE} response was missing data`);
  return res.data.map((c) => ({
    population: c.population ?? 0,
    city: {
      id: `geodb:${c.id}`,
      name: c.name,
      region: c.region || undefined,
      country: c.country,
      countryCode: c.countryCode,
      lat: c.latitude,
      lon: c.longitude,
    },
  }));
}

async function searchOpenMeteoGeo(query: string, signal?: AbortSignal, country?: string): Promise<Candidate[]> {
  const params = new URLSearchParams({ name: query, count: '5', language: 'en', format: 'json' });
  if (country) params.set('countryCode', country);
  const res = await fetchJson<{ results?: OpenMeteoGeoResult[] }>(
    `https://geocoding-api.open-meteo.com/v1/search?${params}`,
    'Open-Meteo Geocoding',
    { signal },
  );
  return (res.results ?? []).map((c) => ({
    population: c.population ?? 0,
    district: c.admin2 || undefined,
    city: {
      id: `om:${c.id}`,
      name: c.name,
      region: c.admin1 || undefined,
      country: c.country ?? c.country_code ?? '',
      countryCode: c.country_code ?? '',
      lat: c.latitude,
      lon: c.longitude,
    },
  }));
}

/**
 * GeoDB is the primary source (as the brief asks). If it isn't configured, or
 * it's down / still rate-limited after one retry, Open-Meteo's keyless
 * geocoder keeps search usable instead of dead-ending the user.
 */
/**
 * Circuit breaker: after GeoDB fails, don't make every keystroke wait for it
 * to fail again. A rejected key won't fix itself this session; an outage or a
 * persistent 429 gets a short cool-down.
 */
let geoDbSkipUntil = 0;
const COOL_DOWN_MS: Partial<Record<string, number>> = {
  auth: Number.POSITIVE_INFINITY,
  'missing-key': Number.POSITIVE_INFINITY,
  server: 60_000,
  network: 60_000,
  'bad-response': 60_000,
  'rate-limit': 5_000,
};

/** `country` is an optional ISO 3166-1 alpha-2 code that narrows both sources. */
export async function searchCities(query: string, signal?: AbortSignal, country?: string): Promise<CitySearchResult> {
  if (RAPIDAPI_KEY && Date.now() >= geoDbSkipUntil) {
    // Open-Meteo is keyless and has no rate limit, so it starts alongside GeoDB.
    // Its answer is only used if GeoDB's list is thin (or GeoDB fails), and the
    // request is cancelled otherwise. This keeps the "Lahore" case from paying
    // for two round trips in a row.
    const backup = new AbortController();
    const onAbort = () => backup.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const backupResult = searchOpenMeteoGeo(query, backup.signal, country);
    backupResult.catch(() => undefined); // avoid an unhandled rejection when it is not needed
    const done = () => signal?.removeEventListener('abort', onAbort);

    let geo: Candidate[] | null = null;
    try {
      geo = await searchGeoDb(query, signal, country);
    } catch (err) {
      const apiErr = toApiError(err);
      if (isAbort(err) || apiErr.kind === 'offline') {
        backup.abort();
        done();
        throw isAbort(err) ? err : apiErr;
      }
      geoDbSkipUntil = Date.now() + (COOL_DOWN_MS[apiErr.kind] ?? 30_000);
      console.warn('[search] GeoDB failed, using Open-Meteo geocoding:', apiErr.message);
    }
    try {
      if (geo) {
        if (!isThin(geo)) {
          backup.abort();
          return { cities: mergeCandidates(geo, []), source: 'geodb' };
        }
        try {
          const cities = mergeCandidates(geo, await backupResult);
          const usedExtra = cities.some((c) => c.id.startsWith('om:'));
          return { cities, source: usedExtra ? 'mixed' : 'geodb' };
        } catch (err) {
          if (signal?.aborted) throw err;
          return { cities: geo.map((c) => c.city), source: 'geodb' }; // GeoDB's answer still stands
        }
      }
      return { cities: mergeCandidates([], await backupResult), source: 'open-meteo' };
    } finally {
      done();
    }
  }
  return { cities: mergeCandidates([], await searchOpenMeteoGeo(query, signal, country)), source: 'open-meteo' };
}

export function formatCity(city: City): string {
  return [city.name, city.region, city.country].filter(Boolean).join(', ');
}

/** Same place even when it came from different sources (ids differ). */
export function isSameCity(a: City, b: City): boolean {
  if (a.id === b.id) return true;
  return (
    a.name.toLowerCase() === b.name.toLowerCase() &&
    a.countryCode.toUpperCase() === b.countryCode.toUpperCase() &&
    Math.abs(a.lat - b.lat) < 0.1 &&
    Math.abs(a.lon - b.lon) < 0.1
  );
}
