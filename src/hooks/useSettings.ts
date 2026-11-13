import { useCallback, useEffect, useState } from 'react';
import type { TempUnit } from '../lib/format';
import { KEYS, storage } from '../lib/storage';

export type ThemeChoice = 'system' | 'light' | 'dark';

export interface Settings {
  unit: TempUnit;
  theme: ThemeChoice;
}

/**
 * Celsius unless the user is actually in the US. The browser language alone
 * is a bad signal: plenty of people outside the US run en-US browsers, so we
 * also require a US time zone.
 */
function guessUnit(): TempUnit {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    const region = (navigator.language.split('-')[1] ?? '').toUpperCase();
    const usZone = /^America\/(New_York|Chicago|Denver|Phoenix|Los_Angeles|Anchorage|Detroit|Boise|Indiana|Kentucky|North_Dakota|Juneau|Sitka|Nome|Adak|Menominee)/.test(tz) || tz === 'Pacific/Honolulu';
    return region === 'US' && usZone ? 'F' : 'C';
  } catch {
    return 'C';
  }
}

function isSettings(v: unknown): v is Partial<Settings> {
  return typeof v === 'object' && v !== null;
}

function load(): Settings {
  const saved = storage.get<Partial<Settings>>(KEYS.settings, {}, isSettings);
  return {
    unit: saved.unit === 'F' || saved.unit === 'C' ? saved.unit : guessUnit(),
    theme: saved.theme === 'light' || saved.theme === 'dark' ? saved.theme : 'system',
  };
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
  }, [settings.theme]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      storage.set(KEYS.settings, next);
      return next;
    });
  }, []);

  return { settings, update };
}
