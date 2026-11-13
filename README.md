# WeatherBoard

A responsive, installable weather dashboard. Search any city, see current conditions and a 5-day forecast, keep up to five favourites, use it offline for the last city you viewed, and get a daily morning reminder.

**Live:** _add the Vercel URL here after deploying_
**Built for:** Edspire Frontend (React) technical challenge, November 2026

---

## Features

| Requirement | What it does |
|---|---|
| City search with autocomplete | GeoDB Cities (RapidAPI) suggestions, 250 ms debounce, full keyboard support (WAI-ARIA combobox), visible loading, no-results and error states with Retry. |
| Weather | Current temperature, feels-like, humidity, wind and condition, plus a 5-day forecast. OpenWeatherMap first, Open-Meteo as fallback. Skeletons while loading, specific errors. |
| Validation | Inline, linked with `aria-describedby`, checked **on blur** and on submit: empty field, too short, invalid characters, no matches, nothing picked from the list, network failure. Errors clear as soon as the input is valid again. |
| Favourites | Up to 5, saved in `localStorage`, quick-access panel, star toggle. Removing always asks first (native `<dialog>`). If storage is blocked or full, the app keeps going in memory and says so. |
| PWA | Manifest (192/512 + maskable icons, `display: standalone`, `theme_color`), Workbox-precached app shell, "Install app" button, "new version available → Reload" prompt. |
| Offline | The last viewed city's full forecast is saved after every successful load. Offline, the app opens from the cache, shows that city and an offline banner with the time of the data, and disables search with a reason. It refreshes on its own when the connection returns. |
| Daily reminder | User picks a time. An explanation comes **before** the browser's permission prompt. Unsupported, denied and iOS-not-installed states are handled without breaking anything else. **On time while the app is open; best-effort or unavailable when it is closed.** See [limitations](#known-limitations). |
| Responsive | Checked at 375, 768, 1024 and 1568 px: no horizontal scroll, touch targets ≥ 44 × 44 px. On phones the 5-day forecast becomes a list; the hero and forecast switch layout with container queries, not just viewport width. |
| Bonus | °C/°F toggle (persisted, converts at render time with no refetch), light/dark/system theme (persisted, applied before first paint), line-art weather icons, a short outlook line written from the live reading, and motion that respects `prefers-reduced-motion`. |

## Design

The brand direction is **"A little clarity. Every day."**

| | |
|---|---|
| Colours | Paper `#F5F3EE`, Ink `#172324`, Night `#101C20`, Mist `#DCE6E3`, Ember `#D85C3B`. Ember text uses a darker `#AD4126` so it reaches 4.5:1 on paper. |
| Type | Manrope (headings, 600–700) and Inter (interface and figures). Both are self-hosted as latin-subset variable `woff2` files (SIL Open Font License, from Fontsource), so they are precached and work offline with no third-party font request. |
| Identity | A sun-orbit mark (an ember half-sun on an ink orbit, with an ember dot), reused in the weather illustrations, the empty state and the app icon. |
| Layout | Large temperatures, fine dividers and few boxes. Light mode is a warm editorial page; dark mode uses Ink and Night. |

The outlook copy ("A calm, clear night." and the sentence under it) is generated from the current condition, day or night, wind speed, feels-like temperature and humidity in `src/lib/outlook.ts`. It never says more than the data does.

## Setup

Requires **Node 20+**.

```bash
npm install
```

```bash
cp .env.example .env
```

Fill in `.env`. Both keys are optional; without them the app still works fully on keyless Open-Meteo:

| Variable | Where to get it |
|---|---|
| `VITE_OWM_KEY` | [openweathermap.org](https://home.openweathermap.org/api_keys), free plan. New keys can take up to ~2 hours to activate. |
| `VITE_RAPIDAPI_KEY` | [GeoDB Cities on RapidAPI](https://rapidapi.com/wirefreethought/api/geodb-cities). Subscribe to the free **Basic** plan. |

```bash
npm run dev
```

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server. The service worker is off in dev. |
| `npm run build` | Type-checks the app and the service worker, then builds to `dist/`. |
| `npm run preview` | Serves `dist/` with the service worker. Use this to test install and offline. |
| `npm test` | Vitest unit tests: forecast grouping across time zones, condition mapping, storage fallback, validation, reminder scheduling. |
| `npm run icons` | Regenerates PWA icons from `public/logo.svg`. |

**Deploy (Vercel):** import the repo, keep the Vite defaults, add the two env vars, then deploy. HTTPS is required for service workers and notifications, and Vercel provides it.

## Architecture

```
src/
  api/            fetch + normalisation only (no React)
    http.ts         fetchJson: timeout, AbortSignal, typed ApiError
    errors.ts       ApiError kinds → user copy ("what failed + what to do")
    openWeather.ts  OWM current + 3-hourly forecast → daily
    openMeteo.ts    Open-Meteo → same shape
    weather.ts      OWM first, Open-Meteo fallback
    cities.ts       GeoDB (rate-gated) with Open-Meteo geocoding fallback
    conditions.ts   OWM ids / WMO codes → our ConditionKind (shared with SW)
  hooks/          useCitySearch, useWeather, useFavourites, useSettings, useOnline, useInstallPrompt
  reminder/       schedule.ts (pure timing), store.ts (IndexedDB), message.ts, useReminder.ts
  components/     CitySearch, WeatherView, Favourites, ReminderCard, ConfirmDialog, WeatherIcon, Chrome
  lib/            storage (never throws), format, validation
  sw.ts           precache + navigation fallback, periodicsync, notificationclick
```

**Data flow:** `CitySearch` → `onSelect(city)` → `App` stores it as the last city → `useWeather(city)` shows the saved snapshot straight away if it has one, fetches through `getWeather`, and saves the result as the new snapshot. The UI only ever sees one normalised `WeatherData` type, so it never knows which provider answered.

## Key decisions

- **One normalised data model, two providers.** OpenWeatherMap is the primary source, as the brief suggests. Open-Meteo takes over on a missing or invalid key, 429, 5xx, timeout or malformed response. It does not take over when the user is truly offline, because there is no point waiting twice. The card shows which source answered.
- **The OWM forecast is 3-hourly, not daily.** Slots are grouped by the **city's** local date, using the response's UTC offset rather than the browser's time zone. Min/max are taken per day, and the condition comes from the slot nearest local noon. Today is dropped if fewer than 2 slots remain. Unit tests cover UTC+5 and UTC-8.
- **GeoDB's free plan allows 1 request per second, and the brief wants results within 300 ms of a pause.** These pull against each other. Resolution:
  - a 250 ms debounce
  - in-flight requests cancelled with `AbortController`
  - an in-memory cache per query
  - a gate that keeps GeoDB calls at least 1.05 s apart
  - a single retry on 429

  Previous suggestions stay visible while the next ones load, so the list never flickers to empty. If GeoDB is down, unconfigured or still rate-limited, search falls back to Open-Meteo's keyless geocoder and labels the suggestions accordingly, instead of dead-ending.

  **Measured with a real GeoDB key** (Chrome, Pakistan, 14 Nov 2026; scripted typing with 90 ms between keys):

  | Query | Requests | Suggestions after the last key |
  |---|---|---|
  | London, Karachi, Istanbul, Berlin, Madrid | GeoDB 200 in 650–920 ms (one request per query) | 0.92–1.19 s |
  | Lahore, Multan (thin GeoDB answer, merged) | GeoDB 200 ~770 ms, Open-Meteo 200 ~270 ms in parallel | 1.0–1.1 s |
  | A repeated query | none (in-memory cache) | 11 ms |

  **So the 300 ms target is not met with GeoDB.** The 250 ms debounce is the only part the frontend controls. GeoDB itself took 650–920 ms per response from here, and the free plan's 1 request/second limit rules out firing a request on every keystroke. Meeting 300 ms would need a server-side cache or a faster index in front of GeoDB, which this frontend-only build does not have.
- **GeoDB's data has gaps, so thin answers are merged with Open-Meteo.** With `types=CITY`, GeoDB returns only Lahore, Virginia (population 0) for "Lahore". Pakistan's Lahore exists there only as "Lahore District"/"Lahore Division". When GeoDB returns fewer than 3 results, or none above 50,000 people, the Open-Meteo results (requested in parallel, and cancelled when not needed) are merged in. Duplicates are dropped, the list is sorted by population, and the dropdown says that Open-Meteo filled in.
- **Enter on typed text** picks the top suggestion, which is sorted by population. Because of the merge above, "Lahore" means Lahore, Pakistan, not Lahore, Virginia. Blur without a choice asks the user to pick one.
- **Clicking a suggestion doesn't flash a blur error.** `mousedown` fires before the input's `blur`, so suggestions call `preventDefault()` on `mousedown`.
- **Offline data is a snapshot, not a runtime-cached API response.** The API URLs carry the key and vary by parameters. Saving the normalised `WeatherData` is simpler, easy to show with "as of" times, and works for both providers.
- **Storage never throws.** One wrapper probes `localStorage`, validates the shape of parsed data, and falls back to memory, including when a write fails partway through a session.
- **Reminder settings live in IndexedDB** (`idb-keyval`), because the service worker has to read them and service workers can't access `localStorage`.
- **Default unit:** °C unless the browser is in a US time zone *and* the locale is `en-US`. Language alone was wrong: an `en-US` browser in Pakistan defaulted to °F during testing.
- **No UI library.** Plain CSS with design tokens, light and dark themes, and a calm palette with one accent colour.
- **The precache repairs itself.** Workbox fills its cache only when a service worker installs. In testing, Chrome had an active worker with an **empty** precache, so a cold start with the network off failed with `ERR_FAILED`. On each online load the page now asks the worker to refetch any precached file that is missing, so offline startup recovers without waiting for a new deploy. Verified by emptying the cache by hand: one online reload restored all 12 files.

## Known limitations

### Daily reminder: "fires even when the tab is closed" without a backend

This can't be guaranteed with standard browser APIs, and the app doesn't pretend otherwise:

- **Web Push** can wake a closed app, but a push has to be **sent by a server** at the right moment, using VAPID keys and a scheduler. A page can't schedule a push to itself.
- **Notification Triggers** (`showTrigger`) would have allowed locally scheduled notifications. Chrome trialled it and then abandoned it, and no browser ships it.
- **Periodic Background Sync** wakes an *installed* PWA's service worker on Chromium only, and the **browser** decides how often (often hours apart, based on engagement).
- **Timers** only run while a tab is open, and they are throttled in background tabs.

**What's implemented:**

| Situation | Behaviour |
|---|---|
| App open in a tab (any browser with notifications) | Fires at the chosen time. When the tab becomes visible again it re-checks, which catches up after background timer throttling. |
| App closed, **installed** on Chrome, Edge or Android | **Best-effort only.** Uses Periodic Background Sync if the browser grants it. If the browser wakes the service worker within 3 hours after the chosen time, the worker fetches the weather and shows the reminder. The browser may wake it late, rarely, or not at all, so a closed-app reminder is not guaranteed on any given day. |
| App closed, anywhere else (normal browser tab, Firefox, Safari) | **No reminder.** Nothing can run. |

Page and service worker share one notification `tag` and a "shown today" date, so the reminder never shows twice. The reminder card tells the user which of these modes applies.

**Not implemented: scheduled Web Push.** There is no push subscription and no server, and the service worker has no `push` handler. A push handler on its own would not deliver anything, because something has to *send* the push at the reminder time.

**What a reliable version needs** (not built, because the brief says no backend):
- `pushManager.subscribe()` with VAPID keys, storing `{subscription, time, timezone, city}` on a server.
- A scheduled function (for example Vercel Cron or a Cloudflare Worker cron) that runs every few minutes and sends a `web-push` message to everyone whose local reminder time just passed.
- A `push` handler in `sw.ts` that shows the notification.

### Other

- **API keys are in the client bundle.** With no backend there is nowhere else to put them. In production they would sit behind a small proxy with caching and rate limiting. Both keys are free-tier and limited by their providers.
- **Offline works for the last viewed city only**, as specified. Other cities show an explanation and a button to open the saved one.
- Free-tier limits: OpenWeatherMap allows 60 calls/min (each view uses 2 calls); GeoDB allows 1 request/s. Both are handled as described above.
- `navigator.onLine` can report `true` on a captive Wi-Fi network, so a fetch failing with a network error is treated as the second offline signal.

## APIs used

- [OpenWeatherMap](https://openweathermap.org/api): `/data/2.5/weather`, `/data/2.5/forecast`
- [Open-Meteo](https://open-meteo.com/): `/v1/forecast` (fallback weather, and the service worker's reminder fetch) and the geocoding API (search fallback)
- [GeoDB Cities](https://rapidapi.com/wirefreethought/api/geodb-cities): `/v1/geo/cities` via RapidAPI
- Browser: Notifications API, Service Worker, Periodic Background Sync, IndexedDB, Web App Manifest

## How this was built

With **Claude Code** (Anthropic's agentic coding tool, desktop app) and Claude Opus 5.5. The full prompt history and what was corrected along the way is in [PROMPTS.md](PROMPTS.md).
