import { useCallback, useEffect, useState } from 'react';
import { isSameCity } from '../api/cities';
import { isAbort, toApiError } from '../api/errors';
import { getWeather } from '../api/weather';
import { KEYS, storage } from '../lib/storage';
import type { AsyncState, City, WeatherData } from '../types';

function isWeatherData(v: unknown): v is WeatherData {
  const w = v as WeatherData;
  return Boolean(w && w.city && w.current && Array.isArray(w.daily) && typeof w.fetchedAt === 'number');
}

/** The last successfully loaded city's full forecast, kept for offline use. */
export function loadSnapshot(): WeatherData | null {
  return storage.get<WeatherData | null>(KEYS.lastWeather, null, (v): v is WeatherData | null => isWeatherData(v));
}

function snapshotFor(city: City | null): WeatherData | null {
  const snap = loadSnapshot();
  return city && snap && isSameCity(snap.city, city) ? snap : null;
}

export function useWeather(city: City | null) {
  const [state, setState] = useState<AsyncState<WeatherData>>(() => {
    const snap = snapshotFor(city);
    return snap ? { status: 'loading', data: snap, error: null } : { status: 'idle', data: null, error: null };
  });
  const [token, setToken] = useState(0);

  useEffect(() => {
    if (!city) {
      setState({ status: 'idle', data: null, error: null });
      return;
    }
    // Show the saved snapshot immediately (stale-while-revalidate), otherwise skeletons.
    const cached = snapshotFor(city);
    setState((prev) => ({
      status: 'loading',
      data: cached ?? (prev.data && isSameCity(prev.data.city, city) ? prev.data : null),
      error: null,
    }));

    const controller = new AbortController();
    getWeather(city, controller.signal)
      .then((data) => {
        storage.set(KEYS.lastWeather, data);
        setState({ status: 'success', data, error: null });
      })
      .catch((err) => {
        if (isAbort(err)) return;
        setState((prev) => ({ status: 'error', data: cached ?? prev.data, error: toApiError(err) }));
      });
    return () => controller.abort();
  }, [city?.id, token]);

  const retry = useCallback(() => setToken((t) => t + 1), []);
  return { state, retry };
}
