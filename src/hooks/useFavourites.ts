import { useCallback, useEffect, useState } from 'react';
import { isSameCity } from '../api/cities';
import { KEYS, storage } from '../lib/storage';
import type { City } from '../types';

export const MAX_FAVOURITES = 5;

function isCityList(v: unknown): v is City[] {
  return (
    Array.isArray(v) &&
    v.every(
      (c) =>
        c &&
        typeof c.id === 'string' &&
        typeof c.name === 'string' &&
        typeof c.lat === 'number' &&
        typeof c.lon === 'number',
    )
  );
}

function load(): City[] {
  return storage.get<City[]>(KEYS.favourites, [], isCityList).slice(0, MAX_FAVOURITES);
}

export type AddResult = 'added' | 'exists' | 'full';

export function useFavourites() {
  const [favourites, setFavourites] = useState<City[]>(load);

  // Keep several open tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEYS.favourites) setFavourites(load());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const persist = (next: City[]) => {
    storage.set(KEYS.favourites, next);
    setFavourites(next);
  };

  const add = useCallback(
    (city: City): AddResult => {
      if (favourites.some((f) => isSameCity(f, city))) return 'exists';
      if (favourites.length >= MAX_FAVOURITES) return 'full';
      persist([...favourites, city]);
      return 'added';
    },
    [favourites],
  );

  const remove = useCallback(
    (city: City) => persist(favourites.filter((f) => !isSameCity(f, city))),
    [favourites],
  );

  const isFavourite = useCallback((city: City) => favourites.some((f) => isSameCity(f, city)), [favourites]);

  return { favourites, add, remove, isFavourite, isFull: favourites.length >= MAX_FAVOURITES };
}
