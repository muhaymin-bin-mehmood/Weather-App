import { isSameCity } from '../api/cities';
import { MAX_FAVOURITES } from '../hooks/useFavourites';
import type { City } from '../types';
import { Icon } from './Icon';

interface Props {
  favourites: City[];
  current: City | null;
  onOpen: (city: City) => void;
  onRemove: (city: City) => void;
  persistent: boolean;
}

export function Favourites({ favourites, current, onOpen, onRemove, persistent }: Props) {
  return (
    <section className="panel places" aria-labelledby="favourites-title">
      <div className="section-head">
        <h2 id="favourites-title" className="eyebrow">
          Your places
        </h2>
        <span className="section-note" aria-label={`${favourites.length} of ${MAX_FAVOURITES} saved`}>
          {favourites.length}/{MAX_FAVOURITES}
        </span>
      </div>

      {favourites.length === 0 ? (
        <p className="panel-empty">
          Tap the <Icon name="star" size={14} /> next to a city to keep it here. You can save up to {MAX_FAVOURITES}.
        </p>
      ) : (
        <ul className="place-list">
          {favourites.map((city) => {
            const isCurrent = current ? isSameCity(city, current) : false;
            return (
              <li key={city.id} className={`place${isCurrent ? ' is-current' : ''}`}>
                <button
                  type="button"
                  className="place-open"
                  onClick={() => onOpen(city)}
                  aria-current={isCurrent ? 'true' : undefined}
                  title={[city.name, city.region, city.country].filter(Boolean).join(', ')}
                >
                  <span className="place-dot" aria-hidden="true" />
                  <span className="place-name">{city.name}</span>
                  <span className="place-country">
                    <span aria-hidden="true">/ </span>
                    {city.country || city.countryCode}
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-button place-remove"
                  aria-label={`Remove ${city.name} from favourites`}
                  title="Remove from Your places"
                  onClick={() => onRemove(city)}
                >
                  <Icon name="star" filled size={20} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!persistent ? (
        <p className="field-hint">
          <Icon name="info" size={14} /> Your browser is blocking storage, so saved places last only until you close
          this tab.
        </p>
      ) : null}
    </section>
  );
}
