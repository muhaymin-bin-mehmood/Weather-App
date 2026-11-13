/// <reference lib="webworker" />
import { cacheNames, clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, getCacheKeyForURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { getOpenMeteo } from './api/openMeteo';
import { buildReminderMessage, REMINDER_TAG } from './reminder/message';
import { isDue, localDateKey } from './reminder/schedule';
import { loadReminder, saveReminder } from './reminder/store';
import type { WeatherData } from './types';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

// --- App shell -------------------------------------------------------------
// Every built asset is precached, so the UI loads with no network at all.
// Weather data for the last viewed city is stored by the page (localStorage),
// not here: the API URLs contain the key and vary by parameters, so a snapshot
// of the normalised data is simpler and more reliable than caching responses.
const PRECACHE_MANIFEST = self.__WB_MANIFEST;
cleanupOutdatedCaches();
precacheAndRoute(PRECACHE_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Workbox fills the precache only during `install`. If the browser evicts it,
// or site storage is cleared while this worker stays active, the shell is no
// longer offline-capable until the next deploy. (Found in testing: an active
// worker with an empty precache gave ERR_FAILED on an offline cold start.)
// The page asks for this check on every online load; it only fetches entries
// that are actually missing.
async function repairPrecache(): Promise<number> {
  const cache = await caches.open(cacheNames.precache);
  let repaired = 0;
  for (const entry of PRECACHE_MANIFEST) {
    const url = new URL(entry.url, self.location.href).href;
    const key = getCacheKeyForURL(url);
    if (!key || (await cache.match(key))) continue;
    try {
      const res = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
      if (res.ok) {
        await cache.put(key, res);
        repaired += 1;
      }
    } catch {
      // Offline again; the next online load will retry.
    }
  }
  return repaired;
}

self.addEventListener('message', (event) => {
  // The page shows "A new version is available — Reload" and sends this.
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
  if (event.data?.type === 'REPAIR_PRECACHE') {
    event.waitUntil(
      repairPrecache().then((n) => {
        if (n) console.info(`[sw] restored ${n} missing precache entries`);
      }),
    );
  }
});
clientsClaim();

// --- Daily reminder --------------------------------------------------------

async function showDailyReminder(): Promise<void> {
  const settings = await loadReminder();
  if (!isDue(settings)) return;
  if (Notification.permission !== 'granted') return;
  // Claim today before the network call so the page can't double-fire.
  await saveReminder({ ...settings, lastShownDate: localDateKey(new Date()) });

  let data: WeatherData | null = null;
  if (settings.city) {
    try {
      // Open-Meteo needs no key, so the worker never handles one.
      data = await getOpenMeteo({
        id: 'reminder',
        name: settings.city.name,
        country: '',
        countryCode: '',
        lat: settings.city.lat,
        lon: settings.city.lon,
      });
    } catch {
      data = null;
    }
  }
  const msg = buildReminderMessage(data, settings.city?.name ?? null, settings.unit);
  await self.registration.showNotification(msg.title, {
    body: msg.body,
    tag: REMINDER_TAG,
    icon: '/pwa-192x192.png',
    badge: '/pwa-64x64.png',
    data: { url: '/' },
  });
}

interface PeriodicSyncEvent extends ExtendableEvent {
  tag: string;
}

// Chromium + installed PWA only; the browser decides when this runs.
self.addEventListener('periodicsync', ((event: PeriodicSyncEvent) => {
  if (event.tag === REMINDER_TAG) event.waitUntil(showDailyReminder());
}) as EventListener);

// No `push` handler on purpose: there is no push subscription and no server
// that sends scheduled pushes, so a handler here would be dead code that
// looks like a feature. See README → Known limitations.

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | null)?.url ?? '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
