import type { ReactNode } from 'react';
import { userMessage, type ApiError } from '../api/errors';
import { formatCity } from '../api/cities';
import {
  cityTime,
  cityToday,
  dayLabel,
  formatDateTime,
  formatTemp,
  formatWind,
  relativeTime,
  shortDate,
  type TempUnit,
} from '../lib/format';
import { conditionLine, longDate, outlook } from '../lib/outlook';
import type { AsyncState, City, DailyForecast, WeatherData } from '../types';
import { Icon } from './Icon';
import { HeroArt, WeatherIcon } from './WeatherIcon';

interface Props {
  state: AsyncState<WeatherData>;
  unit: TempUnit;
  online: boolean;
  onRetry: () => void;
  isFavourite: boolean;
  favouritesFull: boolean;
  onToggleFavourite: (city: City) => void;
  /** Offline and this city has no saved copy: offer the one that does. */
  offlineFallback?: { name: string; onShow: () => void } | null;
}

export function WeatherView({
  state,
  unit,
  online,
  onRetry,
  isFavourite,
  favouritesFull,
  onToggleFavourite,
  offlineFallback,
}: Props) {
  if (state.status === 'idle') return null;
  if (!state.data) {
    if (state.status === 'error')
      return <ErrorPanel error={state.error} onRetry={onRetry} online={online} fallback={offlineFallback} />;
    return <WeatherSkeleton />;
  }

  const data = state.data;
  return (
    <section className="weather" aria-labelledby="current-city" aria-busy={state.status === 'loading'}>
      <CurrentCard
        notice={
          state.status === 'error' ? (
            <StaleNotice error={state.error} fetchedAt={data.fetchedAt} onRetry={onRetry} online={online} />
          ) : null
        }
        data={data}
        unit={unit}
        refreshing={state.status === 'loading'}
        isFavourite={isFavourite}
        favouritesFull={favouritesFull}
        onToggleFavourite={onToggleFavourite}
      />
      <Forecast
        days={data.daily}
        unit={unit}
        offsetSec={data.timezoneOffsetSec}
        isDayNow={data.current.isDay}
        source={data.source === 'openweathermap' ? 'OpenWeatherMap' : 'Open-Meteo'}
      />
    </section>
  );
}

function CurrentCard({
  notice,
  data,
  unit,
  refreshing,
  isFavourite,
  favouritesFull,
  onToggleFavourite,
}: {
  notice: ReactNode;
  data: WeatherData;
  unit: TempUnit;
  refreshing: boolean;
  isFavourite: boolean;
  favouritesFull: boolean;
  onToggleFavourite: (city: City) => void;
}) {
  const { city, current } = data;
  const blocked = !isFavourite && favouritesFull;
  const story = outlook(current, unit);

  return (
    <article className="current">
      {notice}
      <header className="current-header">
        <p className="eyebrow">Your daily outlook</p>
        <div className="current-title">
          <h2 id="current-city" title={formatCity(city)}>
            {city.name}
          </h2>
          <button
            type="button"
            className={`icon-button favourite-toggle${isFavourite ? ' is-on' : ''}`}
            aria-pressed={isFavourite}
            aria-label={isFavourite ? `Remove ${city.name} from favourites` : `Save ${city.name} to favourites`}
            aria-describedby={blocked ? 'favourites-full' : undefined}
            disabled={blocked}
            onClick={() => onToggleFavourite(city)}
            title={blocked ? 'You can save up to 5 cities' : undefined}
          >
            <Icon name="star" filled={isFavourite} size={24} />
          </button>
        </div>
        <p className="current-sub">
          {[city.region, city.country].filter(Boolean).join(', ')}
          <span className="sep" aria-hidden="true">
            ·
          </span>
          <span>
            {longDate(cityToday(data.timezoneOffsetSec))}, {cityTime(data.timezoneOffsetSec)} local
          </span>
        </p>
        {blocked ? (
          <p id="favourites-full" className="field-hint">
            You can save up to 5 cities. Remove one from Your places to add {city.name}.
          </p>
        ) : null}
      </header>

      <div className="current-body">
        <p className="current-temp">
          <span className="sr-only">Now </span>
          {formatTemp(current.tempC, unit)}
          <span className="sr-only">{unit === 'C' ? 'Celsius' : 'Fahrenheit'}</span>
        </p>
        <div className="current-story">
          <p className="condition-line">
            <span className="ember-dot" aria-hidden="true" />
            {conditionLine(current.condition, current.isDay)}
          </p>
          <p className="story-headline">{story.headline}</p>
          <p className="story-body">{story.body}</p>
        </div>
        <HeroArt condition={current.condition} isDay={current.isDay} />
      </div>

      <dl className="metrics">
        <div className="metric">
          <dt>Feels like</dt>
          <dd>{formatTemp(current.feelsLikeC, unit)}</dd>
        </div>
        <div className="metric">
          <dt>Humidity</dt>
          <dd>{Math.round(current.humidity)}%</dd>
        </div>
        <div className="metric">
          <dt>Wind</dt>
          <dd>{formatWind(current.windMs, unit)}</dd>
        </div>
      </dl>

      <p className="current-meta">
        <span className={`status-dot${refreshing ? ' is-busy' : ''}`} aria-hidden="true" />
        <span aria-live="polite">{refreshing ? 'Refreshing…' : `Updated ${relativeTime(data.fetchedAt)}`}</span>
        <span className="sep" aria-hidden="true">
          ·
        </span>
        <span>{data.source === 'openweathermap' ? 'OpenWeatherMap' : 'Open-Meteo'}</span>
      </p>
    </article>
  );
}

function Forecast({
  days,
  unit,
  offsetSec,
  isDayNow,
  source,
}: {
  days: DailyForecast[];
  unit: TempUnit;
  offsetSec: number;
  isDayNow: boolean;
  source: string;
}) {
  const today = cityToday(offsetSec);
  return (
    <section className="forecast" aria-labelledby="forecast-title">
      <div className="section-head">
        <h3 id="forecast-title" className="eyebrow">
          The next {days.length === 5 ? 'five' : days.length} days
        </h3>
        <span className="section-note" aria-hidden="true">
          High / Low
        </span>
      </div>
      <ol className="forecast-list">
        {days.map((d) => (
          <li key={d.date} className="forecast-day" title={`${shortDate(d.date)}: ${d.description}`}>
            <span className="forecast-label">{dayLabel(d.date, today)}</span>
            <span className="forecast-row">
              <WeatherIcon condition={d.condition} isDay={d.date === today ? isDayNow : true} size={36} />
              <span className="forecast-temps">
                <span className="sr-only">
                  {d.description}. High {formatTemp(d.maxC, unit)}, low {formatTemp(d.minC, unit)}
                </span>
                <span aria-hidden="true">
                  {formatTemp(d.maxC, unit)}
                  <span className="slash"> / </span>
                  <span className="temp-min">{formatTemp(d.minC, unit)}</span>
                </span>
              </span>
            </span>
          </li>
        ))}
      </ol>
      <p className="forecast-source">{source}</p>
    </section>
  );
}

export function WeatherSkeleton() {
  return (
    <section className="weather" aria-busy="true" aria-label="Loading weather">
      <div className="current skeleton">
        <span className="skeleton-line eyebrow-line" />
        <span className="skeleton-line title" />
        <span className="skeleton-line short" />
        <div className="current-body">
          <span className="skeleton-block temp" />
          <span className="skeleton-block story" />
          <span className="skeleton-circle" />
        </div>
      </div>
      <div className="forecast skeleton">
        <span className="skeleton-line short" />
        <div className="skeleton-row">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className="skeleton-block small" />
          ))}
        </div>
      </div>
      <p className="sr-only" role="status">
        Loading the forecast…
      </p>
    </section>
  );
}

function ErrorPanel({
  error,
  onRetry,
  online,
  fallback,
}: {
  error: ApiError;
  onRetry: () => void;
  online: boolean;
  fallback?: { name: string; onShow: () => void } | null;
}) {
  const msg = userMessage(error, 'weather');
  return (
    <section className="error-panel" role="alert">
      <Icon name={online ? 'alert' : 'wifi-off'} size={28} />
      <div>
        <h2>{msg.title}</h2>
        <p>
          {fallback
            ? `Only your last viewed city (${fallback.name}) is saved for offline use. Reconnect to load this one.`
            : msg.hint}
        </p>
        <div className="button-row">
          <button type="button" className="button" onClick={onRetry}>
            <Icon name="refresh" size={18} /> Retry
          </button>
          {fallback ? (
            <button type="button" className="button button-primary" onClick={fallback.onShow}>
              Show {fallback.name}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function StaleNotice({
  error,
  fetchedAt,
  onRetry,
  online,
}: {
  error: ApiError;
  fetchedAt: number;
  onRetry: () => void;
  online: boolean;
}) {
  const msg = userMessage(error, 'weather');
  return (
    <div className="notice notice-warning" role="status">
      <Icon name={online ? 'alert' : 'wifi-off'} size={18} />
      <p>
        <strong>Couldn't refresh.</strong> {msg.title} Showing data from {formatDateTime(fetchedAt)}.
      </p>
      <button type="button" className="button button-small" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
