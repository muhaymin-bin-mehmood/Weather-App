import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { formatCity } from '../api/cities';
import { userMessage } from '../api/errors';
import { useCitySearch } from '../hooks/useCitySearch';
import { countries, countryName } from '../lib/countries';
import { KEYS, storage } from '../lib/storage';
import { validateCityQuery } from '../lib/validation';
import type { City } from '../types';
import { Icon } from './Icon';
import { Select, type SelectOption } from './Select';

interface Props {
  onSelect: (city: City) => void;
  /** Explanation shown instead of searching (e.g. offline). */
  disabledReason?: string | null;
}

const countryOptions: SelectOption[] = [
  { value: '', label: 'All countries' },
  ...countries().map((c) => ({ value: c.code, label: c.name, hint: c.code })),
];

export function CitySearch({ onSelect, disabledReason }: Props) {
  const id = useId();
  const inputId = `${id}-input`;
  const listId = `${id}-list`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const inputRef = useRef<HTMLInputElement>(null);

  const [value, setValue] = useState('');
  const [selected, setSelected] = useState<City | null>(null);
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  /** Text submitted with Enter before its suggestions had loaded. */
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);

  /** Optional filter: '' means all countries. Remembered between visits. */
  const [country, setCountry] = useState(() =>
    storage.get<string>(KEYS.searchCountry, '', (v): v is string => typeof v === 'string' && /^([A-Z]{2})?$/.test(v)),
  );
  const inCountry = country ? ` in ${countryName(country)}` : '';

  const disabled = Boolean(disabledReason);
  const search = useCitySearch(value, !selected && !disabled, country);
  const trimmed = value.trim();
  const queryValid = validateCityQuery(trimmed) === null;
  const resultsAreCurrent = search.query.toLowerCase() === trimmed.toLowerCase();
  const showList = open && queryValid && !selected && !disabled;
  const options = search.cities;

  const choose = (city: City) => {
    setSelected(city);
    setValue(formatCity(city));
    setOpen(false);
    setActive(-1);
    setError(null);
    setDirty(false);
    onSelect(city);
  };

  /** Validation that needs the search outcome — used on blur and on submit. */
  const validateForCommit = (): string | null => {
    if (selected) return null;
    const basic = validateCityQuery(trimmed);
    if (basic) return basic;
    if (search.status === 'error' && search.error) {
      const msg = userMessage(search.error, 'search');
      return `${msg.title} ${msg.hint}`;
    }
    if (resultsAreCurrent && search.status === 'success' && options.length === 0) {
      return country
        ? `No cities match “${trimmed}”${inCountry}. Check the spelling, or set Country to “All countries”.`
        : `No cities match “${trimmed}”. Check the spelling or try a nearby larger city.`;
    }
    return 'Pick a city from the list so we know which one you mean.';
  };

  const onBlur = () => {
    setOpen(false);
    setActive(-1);
    if (!dirty && !trimmed) return; // don't nag before the user has typed anything
    setError(validateForCommit());
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    if (selected) {
      onSelect(selected);
      return;
    }
    const basic = validateCityQuery(trimmed);
    if (basic) {
      setError(basic);
      inputRef.current?.focus();
      return;
    }
    // Enter on a typed name: take the top (most populous) match, like most search boxes do.
    if (resultsAreCurrent && search.status === 'success' && options.length > 0) {
      choose(options[0]);
      return;
    }
    if (!(resultsAreCurrent && search.status !== 'loading')) {
      // Suggestions for this text haven't arrived yet: finish the submit when they do.
      setError(null);
      setPendingQuery(trimmed);
      return;
    }
    setError(validateForCommit());
    inputRef.current?.focus();
  };

  // Complete a submit that was made while suggestions were still loading.
  useEffect(() => {
    if (!pendingQuery) return;
    if (search.query.toLowerCase() !== pendingQuery.toLowerCase() || search.status === 'loading') return;
    setPendingQuery(null);
    if (search.status === 'success' && search.cities.length > 0) {
      choose(search.cities[0]);
    } else {
      setError(validateForCommit());
      inputRef.current?.focus();
    }
    // choose/validateForCommit read current render values; only the search outcome matters here.
  }, [pendingQuery, search.query, search.status, search.cities]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      if (options.length) setActive((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (options.length) setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === 'Enter' && showList && active >= 0 && options[active]) {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === 'Escape') {
      if (showList) setOpen(false);
      else clear();
    }
  };

  const clear = () => {
    setValue('');
    setSelected(null);
    setError(null);
    setDirty(false);
    setActive(-1);
    inputRef.current?.focus();
  };

  const describedBy = [error ? errorId : null, hintId].filter(Boolean).join(' ');
  const statusText =
    search.status === 'loading'
      ? 'Searching…'
      : search.status === 'success' && resultsAreCurrent
        ? options.length
          ? `${options.length} ${options.length === 1 ? 'city' : 'cities'} found. Use the arrow keys to choose.`
          : `No cities match ${trimmed}${inCountry}.`
        : '';

  return (
    <form className="search" onSubmit={onSubmit} noValidate role="search">
      <Select
        className="country-picker"
        label="Country"
        value={country}
        options={countryOptions}
        disabled={disabled}
        searchable
        searchPlaceholder="Type a country"
        onChange={(next) => {
          setCountry(next);
          storage.set(KEYS.searchCountry, next);
          // A new country starts a new search: clear the city field and close its suggestions.
          // The weather already on screen stays until another city is picked.
          setValue('');
          setSelected(null);
          setOpen(false);
          setActive(-1);
          setError(null);
          setDirty(false);
          setPendingQuery(null);
        }}
      />
      <label htmlFor={inputId} className="sr-only">
        Search a city
      </label>
      <div className={`search-row${error ? ' has-error' : ''}`}>
        <div className="search-field">
          <Icon name="search" className="search-icon" />
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={listId}
            aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder={disabled ? 'Offline — search paused' : country ? `Search a city in ${countryName(country)}` : 'Search a city'}
            value={value}
            disabled={disabled}
            onChange={(e) => {
              const next = e.target.value;
              setValue(next);
              setSelected(null);
              setDirty(true);
              setOpen(true);
              setActive(-1);
              setPendingQuery(null);
              // Once an error is showing, clear it as soon as the input becomes valid again.
              if (error) setError(validateCityQuery(next.trim()));
            }}
            onFocus={() => setOpen(true)}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
          />
          {value && !disabled ? (
            <button type="button" className="icon-button search-clear" onClick={clear} aria-label="Clear search">
              <Icon name="close" />
            </button>
          ) : null}
          <button type="submit" className="icon-button search-submit" disabled={disabled} aria-label="Show weather">
            <Icon name="enter" size={18} />
          </button>
        </div>
      </div>

      {error ? (
        <p id={errorId} className="field-error" role="alert">
          <Icon name="alert" size={16} />
          {error}
        </p>
      ) : null}
      <p id={hintId} className="field-hint">
        {disabledReason ??
          (pendingQuery
            ? `Looking up “${pendingQuery}”… the top match will open as soon as it’s found.`
            : 'Type at least 2 letters, then choose a city from the suggestions.')}
      </p>

      <div className="sr-only" aria-live="polite">
        {showList ? statusText : ''}
      </div>

      {showList ? (
        <div className="suggestions">
          {search.status === 'error' && search.error ? (
            <div className="suggestions-message is-error">
              <div>
                <strong>{userMessage(search.error, 'search').title}</strong>
                <span>{userMessage(search.error, 'search').hint}</span>
              </div>
              <button
                type="button"
                className="button button-small"
                onMouseDown={(e) => e.preventDefault()}
                onClick={search.retry}
              >
                Retry
              </button>
            </div>
          ) : search.status === 'loading' && options.length === 0 ? (
            <div className="suggestions-loading" aria-hidden="true">
              <span className="skeleton-line" />
              <span className="skeleton-line short" />
              <span className="skeleton-line" />
            </div>
          ) : search.status === 'success' && options.length === 0 ? (
            <div className="suggestions-message">
              <div>
                <strong>
                  No cities match “{trimmed}”{inCountry}.
                </strong>
                <span>
                  {country ? 'Check the spelling, or set Country to “All countries”.' : 'Check the spelling or try a nearby larger city.'}
                </span>
              </div>
            </div>
          ) : null}

          {options.length > 0 && search.status !== 'error' ? (
            <ul id={listId} role="listbox" aria-label="City suggestions" className="suggestion-list">
              {options.map((city, i) => (
                <li
                  key={city.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={`suggestion${i === active ? ' is-active' : ''}`}
                  // mousedown fires before the input's blur; preventing it keeps focus so the
                  // blur validation doesn't flash "pick a city" while the user is picking one.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(city)}
                  onMouseEnter={() => setActive(i)}
                >
                  <Icon name="pin" size={18} />
                  <span className="suggestion-text">
                    <span className="suggestion-name">{city.name}</span>
                    <span className="suggestion-meta">{[city.region, city.country].filter(Boolean).join(', ')}</span>
                  </span>
                  {city.countryCode ? <span className="suggestion-code">{city.countryCode}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}

          {search.status === 'loading' && options.length > 0 ? (
            <p className="suggestions-footer">Updating suggestions…</p>
          ) : search.source === 'open-meteo' && options.length > 0 ? (
            <p className="suggestions-footer">Suggestions from Open-Meteo (GeoDB is unavailable right now).</p>
          ) : search.source === 'mixed' && options.length > 0 ? (
            <p className="suggestions-footer">GeoDB had few matches, so Open-Meteo filled in the rest.</p>
          ) : null}
        </div>
      ) : null}
      {/* Keep the element aria-controls points at in the DOM even when nothing is listed. */}
      {!(showList && options.length > 0 && search.status !== 'error') ? (
        <ul id={listId} role="listbox" hidden aria-label="City suggestions" />
      ) : null}
    </form>
  );
}
