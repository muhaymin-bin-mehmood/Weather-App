import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import type { ThemeChoice } from '../hooks/useSettings';
import type { TempUnit } from '../lib/format';
import { formatDateTime } from '../lib/format';
import type { City } from '../types';
import { Icon } from './Icon';
import { LogoMark } from './WeatherIcon';

/* App chrome: header, offline banner, update prompt, empty state. */

const THEME_NEXT: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_LABEL: Record<ThemeChoice, string> = {
  system: 'Theme: match system',
  light: 'Theme: light',
  dark: 'Theme: dark',
};

export function Header({
  unit,
  theme,
  onUnit,
  onTheme,
}: {
  unit: TempUnit;
  theme: ThemeChoice;
  onUnit: (u: TempUnit) => void;
  onTheme: (t: ThemeChoice) => void;
}) {
  const { canInstall, install } = useInstallPrompt();
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="WeatherBoard home">
        <LogoMark width={52} className="brand-mark" />
        <span>WeatherBoard</span>
      </a>
      <div className="topbar-actions">
        {canInstall ? (
          <button type="button" className="button button-ghost install-button" onClick={install}>
            <Icon name="download" size={18} />
            <span className="hide-sm">Install app</span>
            <span className="sr-only show-sm">Install app</span>
          </button>
        ) : null}
        <div className="unit-toggle" role="group" aria-label="Temperature unit">
          <button type="button" aria-pressed={unit === 'C'} onClick={() => onUnit('C')}>
            °C
          </button>
          <span aria-hidden="true">/</span>
          <button type="button" aria-pressed={unit === 'F'} onClick={() => onUnit('F')}>
            °F
          </button>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={() => onTheme(THEME_NEXT[theme])}
          aria-label={`${THEME_LABEL[theme]}. Change theme`}
          title={THEME_LABEL[theme]}
        >
          <Icon name={theme === 'system' ? 'monitor' : theme === 'light' ? 'sun' : 'moon'} />
        </button>
      </div>
    </header>
  );
}

export function OfflineBanner({ snapshotCity, snapshotAt }: { snapshotCity: string | null; snapshotAt: number | null }) {
  return (
    <div className="offline-banner" role="status">
      <Icon name="wifi-off" size={18} />
      <p>
        <strong>You're offline.</strong>{' '}
        {snapshotCity && snapshotAt
          ? `Showing ${snapshotCity} as of ${formatDateTime(snapshotAt)}. Search and other cities need a connection.`
          : 'Search and forecasts need a connection. We will refresh automatically when you are back online.'}
      </p>
    </div>
  );
}

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    // Ask the active worker to refill any precache entries the browser has
    // dropped, so the next offline cold start still has the app shell.
    onRegisteredSW(_url, registration) {
      if (!registration || !navigator.onLine) return;
      void navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: 'REPAIR_PRECACHE' }));
    },
  });

  // "Ready offline" is informational; let it go away on its own.
  useEffect(() => {
    if (!offlineReady) return;
    const t = window.setTimeout(() => setOfflineReady(false), 6000);
    return () => window.clearTimeout(t);
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh && !offlineReady) return null;
  return (
    <div className="toast" role="status">
      <p>{needRefresh ? 'A new version of WeatherBoard is available.' : 'WeatherBoard is ready to work offline.'}</p>
      {needRefresh ? (
        <button type="button" className="button button-small button-primary" onClick={() => updateServiceWorker(true)}>
          Reload
        </button>
      ) : null}
      <button
        type="button"
        className="icon-button"
        aria-label="Dismiss"
        onClick={() => {
          setNeedRefresh(false);
          setOfflineReady(false);
        }}
      >
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}

// Shown before any city has been picked. Two well-known places make the
// first tap useful even with no favourites yet.
const STARTERS: City[] = [
  { id: 'om:1172451', name: 'Lahore', region: 'Punjab', country: 'Pakistan', countryCode: 'PK', lat: 31.5497, lon: 74.3436 },
  { id: 'om:2643743', name: 'London', region: 'England', country: 'United Kingdom', countryCode: 'GB', lat: 51.5085, lon: -0.1257 },
];

export function EmptyState({ favourites, onOpen }: { favourites: City[]; onOpen: (c: City) => void }) {
  const picks = favourites.length ? favourites : STARTERS;
  return (
    <section className="empty-state" aria-labelledby="empty-title">
      <LogoMark width={200} className="empty-mark" />
      <h2 id="empty-title">Where are you headed?</h2>
      <p>Search a city to see the day ahead.</p>
      <div className="chip-row" aria-label={favourites.length ? 'Your places' : 'Suggestions'} role="group">
        {picks.map((c) => (
          <button key={c.id} type="button" className="chip" onClick={() => onOpen(c)}>
            {c.name}
          </button>
        ))}
      </div>
    </section>
  );
}
