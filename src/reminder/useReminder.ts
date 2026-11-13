/**
 * Daily weather reminder — what is and isn't guaranteed.
 *
 * The brief asks for a reminder at a user-chosen time that fires even when
 * the tab is closed, with no backend. Browsers don't offer that:
 *
 * - Web Push does wake a closed app, but a push has to be SENT by a server at
 *   the right time (VAPID keys + a scheduler). Client code can't send one to
 *   itself in the future.
 * - Notification Triggers (showTrigger), the API that would have let a page
 *   schedule a local notification, was trialled in Chrome and abandoned.
 * - Periodic Background Sync wakes the service worker of an INSTALLED PWA on
 *   Chromium, but the browser decides how often (often every few hours or
 *   less), so the time is approximate and not guaranteed.
 * - Timers only run while a tab is open (and are throttled in the background).
 *
 * What this implements:
 *   1. App open → a timer fires at the chosen time (and re-checks when the
 *      tab becomes visible, because background timers get throttled).
 *   2. BEST-EFFORT, installed on Chrome/Edge/Android only → Periodic
 *      Background Sync. IF the browser grants it and IF it wakes the service
 *      worker within 3 hours after the chosen time (LATE_WINDOW_MS), the
 *      reminder is shown. The browser may wake it late or never.
 *
 * Not implemented: scheduled Web Push. That needs a push subscription plus a
 * server that sends at the right time; neither exists in this client-only app.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getWeather } from '../api/weather';
import { isStandalone } from '../hooks/useInstallPrompt';
import type { TempUnit } from '../lib/format';
import type { City } from '../types';
import { buildReminderMessage, REMINDER_TAG } from './message';
import { isDue, localDateKey, nextOccurrence, type ReminderSettings } from './schedule';
import { loadReminder, saveReminder } from './store';

export type ReminderSupport = 'supported' | 'unsupported' | 'ios-needs-install';
export type BackgroundMode = 'periodic-sync' | 'open-tab-only';

const PERIODIC_TAG = REMINDER_TAG;
const PERIODIC_MIN_INTERVAL_MS = 60 * 60 * 1000;

interface PeriodicSyncManager {
  register(tag: string, options?: { minInterval: number }): Promise<void>;
  unregister(tag: string): Promise<void>;
  getTags(): Promise<string[]>;
}

function detectSupport(): ReminderSupport {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && !isStandalone()) return 'ios-needs-install';
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  return 'supported';
}

async function getRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  try {
    return await navigator.serviceWorker?.getRegistration();
  } catch {
    return undefined;
  }
}

async function registerPeriodicSync(): Promise<boolean> {
  const reg = await getRegistration();
  const periodicSync = (reg as (ServiceWorkerRegistration & { periodicSync?: PeriodicSyncManager }) | undefined)
    ?.periodicSync;
  if (!periodicSync) return false;
  try {
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName });
    if (status.state !== 'granted') return false; // typically: not installed, or low engagement
    await periodicSync.register(PERIODIC_TAG, { minInterval: PERIODIC_MIN_INTERVAL_MS });
    return true;
  } catch {
    return false;
  }
}

async function unregisterPeriodicSync(): Promise<void> {
  const reg = await getRegistration();
  const periodicSync = (reg as (ServiceWorkerRegistration & { periodicSync?: PeriodicSyncManager }) | undefined)
    ?.periodicSync;
  try {
    await periodicSync?.unregister(PERIODIC_TAG);
  } catch {
    /* nothing to undo */
  }
}

async function showReminder(settings: ReminderSettings): Promise<void> {
  let data = null;
  if (settings.city) {
    try {
      const city: City = {
        id: 'reminder',
        name: settings.city.name,
        country: '',
        countryCode: '',
        lat: settings.city.lat,
        lon: settings.city.lon,
      };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      data = await getWeather(city, controller.signal);
      clearTimeout(timer);
    } catch {
      data = null; // a reminder without numbers beats no reminder
    }
  }
  const msg = buildReminderMessage(data, settings.city?.name ?? null, settings.unit);
  const options: NotificationOptions = {
    body: msg.body,
    tag: REMINDER_TAG, // the page and the SW share a tag, so a double fire replaces, not stacks
    icon: '/pwa-192x192.png',
    badge: '/pwa-64x64.png',
    data: { url: '/' },
  };
  const reg = await getRegistration();
  if (reg) await reg.showNotification(msg.title, options);
  else new Notification(msg.title, options);
}

export function useReminder(currentCity: City | null, unit: TempUnit) {
  const [support] = useState<ReminderSupport>(detectSupport);
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    'Notification' in window ? Notification.permission : 'denied',
  );
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [mode, setMode] = useState<BackgroundMode>('open-tab-only');
  const [busy, setBusy] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    loadReminder().then(setSettings);
  }, []);

  const update = useCallback(async (patch: Partial<ReminderSettings>) => {
    const base = settingsRef.current ?? (await loadReminder());
    const next = { ...base, ...patch };
    settingsRef.current = next;
    setSettings(next);
    await saveReminder(next);
    return next;
  }, []);

  // The reminder follows the city the user looked at last, and their unit choice.
  useEffect(() => {
    if (!settings) return;
    const patch: Partial<ReminderSettings> = {};
    if (currentCity && settings.city?.name !== currentCity.name) {
      patch.city = { name: currentCity.name, lat: currentCity.lat, lon: currentCity.lon };
    }
    if (settings.unit !== unit) patch.unit = unit;
    if (Object.keys(patch).length) void update(patch);
  }, [currentCity, unit, settings, update]);

  // Permission can change in browser settings while we're open.
  useEffect(() => {
    if (!('permissions' in navigator)) return;
    let status: PermissionStatus | null = null;
    navigator.permissions
      .query({ name: 'notifications' as PermissionName })
      .then((s) => {
        status = s;
        s.onchange = () => setPermission(Notification.permission);
      })
      .catch(() => undefined);
    return () => {
      if (status) status.onchange = null;
    };
  }, []);

  // Layer 1: exact-time timer while the app is open.
  const enabled = Boolean(settings?.enabled) && permission === 'granted';
  const time = settings?.time;
  useEffect(() => {
    if (!enabled || !time) return;
    let timer: number | undefined;

    const check = async () => {
      const current = await loadReminder();
      if (isDue(current)) {
        await update({ lastShownDate: localDateKey(new Date()) }); // claim the day first
        await showReminder(current);
      }
    };
    const schedule = () => {
      window.clearTimeout(timer);
      const s = settingsRef.current;
      if (!s) return;
      const delay = nextOccurrence(s).getTime() - Date.now();
      timer = window.setTimeout(async () => {
        await check();
        schedule();
      }, Math.max(1000, delay));
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void check().then(schedule);
      }
    };

    void check().then(schedule);
    document.addEventListener('visibilitychange', onVisible);
    void registerPeriodicSync().then((ok) => setMode(ok ? 'periodic-sync' : 'open-tab-only'));
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, time, update]);

  /** Must be called from a click handler — browsers require a user gesture. */
  const enable = useCallback(async (): Promise<NotificationPermission> => {
    setBusy(true);
    try {
      const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        const city = currentCity
          ? { name: currentCity.name, lat: currentCity.lat, lon: currentCity.lon }
          : settingsRef.current?.city ?? null;
        // If today's time already passed, start tomorrow rather than firing immediately.
        const s = settingsRef.current;
        const passed = s ? nextOccurrence({ ...s, lastShownDate: null }).getDate() !== new Date().getDate() : false;
        await update({ enabled: true, city, unit, lastShownDate: passed ? localDateKey(new Date()) : null });
      }
      return result;
    } finally {
      setBusy(false);
    }
  }, [currentCity, unit, update]);

  const disable = useCallback(async () => {
    await update({ enabled: false });
    await unregisterPeriodicSync();
    setMode('open-tab-only');
  }, [update]);

  const setTime = useCallback(
    async (value: string) => {
      const now = new Date();
      const s = settingsRef.current;
      if (!s) return;
      // Changing the time resets "already shown today" only if the new time is still ahead.
      const ahead = nextOccurrence({ time: value, lastShownDate: null }, now).getDate() === now.getDate();
      await update({ time: value, lastShownDate: ahead ? null : localDateKey(now) });
    },
    [update],
  );

  const sendTest = useCallback(async () => {
    const s = settingsRef.current;
    if (!s) return;
    await showReminder({ ...s, unit });
  }, [unit]);

  return { support, permission, settings, mode, busy, enable, disable, setTime, sendTest };
}
