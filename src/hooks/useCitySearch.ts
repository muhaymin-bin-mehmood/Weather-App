import { useEffect, useRef, useState } from 'react';
import { searchCities, type CitySource } from '../api/cities';
import { isAbort, toApiError, type ApiError } from '../api/errors';
import { validateCityQuery } from '../lib/validation';
import type { City } from '../types';

/**
 * Waits for a short pause before searching, so fast typing sends one request
 * instead of one per key. The total delay is this plus GeoDB's own response
 * time (measured 650–920 ms), so the brief's 300 ms target is not met; see README.
 */
export const SEARCH_DEBOUNCE_MS = 250;

export interface CitySearchState {
  status: 'idle' | 'loading' | 'success' | 'error';
  cities: City[];
  source: CitySource | null;
  error: ApiError | null;
  /** The query the current `cities` belong to. */
  query: string;
}

const IDLE: CitySearchState = { status: 'idle', cities: [], source: null, error: null, query: '' };

export function useCitySearch(query: string, enabled: boolean, country = '') {
  const [state, setState] = useState<CitySearchState>(IDLE);
  const [retryToken, setRetryToken] = useState(0);
  const cache = useRef(new Map<string, { cities: City[]; source: CitySource }>());

  useEffect(() => {
    const q = query.trim();
    if (!enabled || validateCityQuery(q)) {
      setState(IDLE);
      return;
    }
    const key = `${country}|${q.toLowerCase()}`;
    const cached = cache.current.get(key);
    if (cached) {
      setState({ status: 'success', ...cached, error: null, query: q });
      return;
    }

    // Keep the previous suggestions visible while the next ones load — no flicker.
    setState((prev) => ({ ...prev, status: 'loading', error: null }));
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await searchCities(q, controller.signal, country || undefined);
        cache.current.set(key, result);
        setState({ status: 'success', ...result, error: null, query: q });
      } catch (err) {
        if (isAbort(err)) return;
        setState({ status: 'error', cities: [], source: null, error: toApiError(err), query: q });
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, enabled, country, retryToken]);

  return { ...state, retry: () => setRetryToken((t) => t + 1) };
}
