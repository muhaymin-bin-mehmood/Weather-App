import { useCallback, useEffect, useRef, useState } from 'react';
import { CitySearch } from './components/CitySearch';
import { EmptyState, Header, OfflineBanner, UpdatePrompt } from './components/Chrome';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Favourites } from './components/Favourites';
import { ReminderCard } from './components/ReminderCard';
import { WeatherView } from './components/WeatherView';
import { isSameCity } from './api/cities';
import { useFavourites } from './hooks/useFavourites';
import { useOnline } from './hooks/useOnline';
import { useSettings } from './hooks/useSettings';
import { loadSnapshot, useWeather } from './hooks/useWeather';
import { KEYS, storage } from './lib/storage';
import type { City } from './types';

const STALE_AFTER_MS = 15 * 60 * 1000;

function isCity(v: unknown): v is City {
  const c = v as City;
  return Boolean(c && typeof c.id === 'string' && typeof c.lat === 'number' && typeof c.lon === 'number');
}

export function App() {
  const { settings, update } = useSettings();
  const online = useOnline();
  const fav = useFavourites();
  const [city, setCity] = useState<City | null>(
    () => storage.get<City | null>(KEYS.lastCity, null, (v): v is City | null => isCity(v)) ?? loadSnapshot()?.city ?? null,
  );
  const { state, retry } = useWeather(city);
  const [pendingRemove, setPendingRemove] = useState<City | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const mainRef = useRef<HTMLElement>(null);

  const selectCity = useCallback((next: City) => {
    setCity(next);
    storage.set(KEYS.lastCity, next);
  }, []);

  // Back online → refresh. Tab visible again with old data → refresh.
  const lastFetched = state.data?.fetchedAt ?? 0;
  const status = state.status;
  useEffect(() => {
    if (online && city && (status === 'error' || Date.now() - lastFetched > STALE_AFTER_MS)) retry();
    // Only react to connectivity changes.
  }, [online]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine && city && Date.now() - lastFetched > STALE_AFTER_MS) {
        retry();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [city, lastFetched, retry]);

  const toggleFavourite = (c: City) => {
    if (fav.isFavourite(c)) {
      setPendingRemove(c); // removal always asks first
      return;
    }
    const result = fav.add(c);
    if (result === 'added') setAnnouncement(`${c.name} saved to favourites.`);
    if (result === 'full') setAnnouncement('You can save up to 5 cities. Remove one to add another.');
  };

  const confirmRemove = () => {
    if (!pendingRemove) return;
    fav.remove(pendingRemove);
    setAnnouncement(`${pendingRemove.name} removed from favourites.`);
    setPendingRemove(null);
  };

  const cancelRemove = useCallback(() => setPendingRemove(null), []);

  const offline = !online || (state.status === 'error' && state.error.kind === 'offline');
  const snapshot = offline ? loadSnapshot() : null;
  const showingSnapshot = Boolean(snapshot && state.data && isSameCity(snapshot.city, state.data.city));

  return (
    <div className="app">
      <div className="sheet">
      <a href="#main" className="skip-link">
        Skip to weather
      </a>
      <Header
        unit={settings.unit}
        theme={settings.theme}
        onUnit={(unit) => update({ unit })}
        onTheme={(theme) => update({ theme })}
      />
      {offline ? (
        <OfflineBanner
          snapshotCity={showingSnapshot ? snapshot!.city.name : null}
          snapshotAt={showingSnapshot ? snapshot!.fetchedAt : null}
        />
      ) : null}

      <main id="main" ref={mainRef} className="layout" tabIndex={-1}>
          <CitySearch
            onSelect={selectCity}
            disabledReason={
              !online ? "You're offline. Search needs a connection — your favourites and last viewed city still work." : null
            }
          />
          {city ? (
            <WeatherView
              state={state}
              unit={settings.unit}
              online={online}
              onRetry={retry}
              isFavourite={fav.isFavourite(city)}
              favouritesFull={fav.isFull}
              onToggleFavourite={toggleFavourite}
              offlineFallback={
                offline && snapshot && !isSameCity(snapshot.city, city)
                  ? { name: snapshot.city.name, onShow: () => selectCity(snapshot.city) }
                  : null
              }
            />
          ) : (
            <EmptyState favourites={fav.favourites} onOpen={selectCity} />
          )}
        <aside className="side" aria-label="Your places and morning briefing">
          <Favourites
            favourites={fav.favourites}
            current={city}
            onOpen={selectCity}
            onRemove={setPendingRemove}
            persistent={storage.isPersistent}
          />
          <ReminderCard currentCity={city} unit={settings.unit} />
        </aside>
      </main>

      </div>
      <footer className="site-footer">
        Weather by OpenWeatherMap with Open-Meteo as fallback · City search by GeoDB Cities
      </footer>

      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
      <ConfirmDialog
        open={pendingRemove !== null}
        title={pendingRemove ? `Remove ${pendingRemove.name} from favourites?` : ''}
        body="You can add it again later from search."
        confirmLabel="Remove"
        onConfirm={confirmRemove}
        onCancel={cancelRemove}
      />
      <UpdatePrompt />
    </div>
  );
}
