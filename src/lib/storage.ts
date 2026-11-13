/**
 * localStorage that never throws. If storage is blocked (Safari private mode,
 * disabled cookies, quota exceeded) we fall back to an in-memory map and
 * report isPersistent = false so the UI can say so.
 */
export interface SafeStorage {
  readonly isPersistent: boolean;
  get<T>(key: string, fallback: T, validate?: (value: unknown) => value is T): T;
  set(key: string, value: unknown): boolean;
  remove(key: string): void;
}

export function createSafeStorage(getBacking: () => Storage | undefined): SafeStorage {
  const memory = new Map<string, string>();
  let backing: Storage | undefined;
  try {
    backing = getBacking();
    if (backing) {
      const probe = '__wb_probe__';
      backing.setItem(probe, '1');
      backing.removeItem(probe);
    }
  } catch {
    backing = undefined;
  }

  let persistent = Boolean(backing);

  const read = (key: string): string | null => {
    // Once a write has failed, the in-memory copy is newer than what's on disk.
    if (!persistent && memory.has(key)) return memory.get(key) ?? null;
    if (backing) {
      try {
        return backing.getItem(key);
      } catch {
        /* fall through to memory */
      }
    }
    return memory.get(key) ?? null;
  };

  return {
    get isPersistent() {
      return persistent;
    },
    get<T>(key: string, fallback: T, validate?: (value: unknown) => value is T): T {
      const raw = read(key);
      if (raw == null) return fallback;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (validate && !validate(parsed)) return fallback;
        return parsed as T;
      } catch {
        return fallback; // corrupted JSON → defaults, never a crash
      }
    },
    set(key: string, value: unknown): boolean {
      const raw = JSON.stringify(value);
      memory.set(key, raw);
      if (!backing) return false;
      try {
        backing.setItem(key, raw);
        return true;
      } catch {
        // Quota exceeded or storage revoked mid-session: keep going in memory.
        persistent = false;
        return false;
      }
    },
    remove(key: string) {
      memory.delete(key);
      try {
        backing?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export const storage = createSafeStorage(() =>
  typeof window !== 'undefined' ? window.localStorage : undefined,
);

export const KEYS = {
  favourites: 'wb:favourites',
  lastCity: 'wb:lastCity',
  lastWeather: 'wb:lastWeather',
  settings: 'wb:settings',
  searchCountry: 'wb:searchCountry',
  storageNoticeDismissed: 'wb:storageNoticeDismissed',
} as const;
