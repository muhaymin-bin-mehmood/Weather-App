import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from './Icon';

/*
 * A styled replacement for <select>, following the WAI-ARIA "select-only
 * combobox" pattern: a button with role="combobox" that opens a listbox.
 *
 * Keyboard: Enter/Space/↓/↑ open; ↑/↓/Home/End/PageUp/PageDown move; Enter or
 * Space picks; Escape closes without changing; Tab picks the highlighted
 * option and moves on; typing letters jumps to the first match.
 *
 * With `searchable`, the popup has a filter field (for long lists such as
 * countries); focus moves into it, and the same keys work from there.
 */

export interface SelectOption {
  value: string;
  label: string;
  /** Shown on the right in the list, e.g. a country code. */
  hint?: string;
}

interface Props {
  label: string;
  /** Hide the visible label (still announced). */
  hideLabel?: boolean;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  className?: string;
  /** Text on the trigger; defaults to the selected option's label. */
  display?: string;
  /** Width of the popup relative to the trigger. */
  popupAlign?: 'stretch' | 'start' | 'end';
}

const PAGE = 8;

export function Select({
  label,
  hideLabel,
  value,
  options,
  onChange,
  disabled,
  searchable,
  searchPlaceholder = 'Type to filter',
  className,
  display,
  popupAlign = 'stretch',
}: Props) {
  const id = useId();
  const labelId = `${id}-label`;
  const listId = `${id}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ text: '', at: 0 });

  const [open, setOpen] = useState(false);
  /** Open upwards when there isn't room below (e.g. the reminder time near the bottom of a phone screen). */
  const [dropUp, setDropUp] = useState(false);
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState(0);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return options;
    const starts = options.filter((o) => o.label.toLowerCase().startsWith(q));
    const contains = options.filter((o) => !o.label.toLowerCase().startsWith(q) && o.label.toLowerCase().includes(q));
    return [...starts, ...contains];
  }, [filter, options]);

  const selected = options.find((o) => o.value === value);

  const openList = () => {
    if (disabled) return;
    setFilter('');
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      setDropUp(below < 300 && rect.top > below);
    }
    setOpen(true);
  };

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const pick = (index: number, refocus = true) => {
    const opt = shown[index];
    if (opt && opt.value !== value) onChange(opt.value);
    close(refocus);
  };

  // Focus the filter when opening; keep the highlighted option in view.
  useEffect(() => {
    if (open && searchable) filterRef.current?.focus();
  }, [open, searchable]);
  useEffect(() => {
    if (!open) return;
    // Scroll only the list. scrollIntoView() would also scroll the page.
    const list = listRef.current;
    const el = list?.children[active] as HTMLElement | undefined;
    if (!list || !el) return;
    if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop - 4;
    else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight + 4;
  }, [open, active]);
  // Typing in the filter highlights the best match. Clearing it on open must
  // not override openList(), which highlights the current value.
  useEffect(() => {
    if (filter) setActive(0);
  }, [filter]);

  // Click outside closes without changing the value.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const move = (to: number) => setActive(Math.max(0, Math.min(shown.length - 1, to)));

  const onKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openList();
      } else if (e.key.length === 1 && !searchable) {
        jumpTo(e.key, true);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(active + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(active - 1);
        break;
      case 'Home':
        if (!searchable) {
          e.preventDefault();
          move(0);
        }
        break;
      case 'End':
        if (!searchable) {
          e.preventDefault();
          move(shown.length - 1);
        }
        break;
      case 'PageDown':
        e.preventDefault();
        move(active + PAGE);
        break;
      case 'PageUp':
        e.preventDefault();
        move(active - PAGE);
        break;
      case 'Enter':
        e.preventDefault();
        pick(active);
        break;
      case ' ':
        if (!searchable) {
          e.preventDefault();
          pick(active);
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case 'Tab':
        pick(active, false);
        break;
      default:
        if (e.key.length === 1 && !searchable) jumpTo(e.key, false);
    }
  };

  /** Type-ahead: letters typed within 600 ms build up a prefix. */
  const jumpTo = (char: string, commit: boolean) => {
    const now = Date.now();
    const t = typeahead.current;
    t.text = now - t.at < 600 ? t.text + char.toLowerCase() : char.toLowerCase();
    t.at = now;
    const i = options.findIndex((o) => o.label.toLowerCase().startsWith(t.text));
    if (i < 0) return;
    if (commit) onChange(options[i].value);
    else setActive(i);
  };

  const activeId = open && shown[active] ? `${id}-opt-${active}` : undefined;

  return (
    <div ref={rootRef} className={`select${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}>
      <span id={labelId} className={hideLabel ? 'sr-only' : 'select-label'}>
        {label}
      </span>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${labelId} ${id}-value`}
        aria-activedescendant={searchable ? undefined : activeId}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
      >
        <span id={`${id}-value`} className="select-value">
          {display ?? selected?.label ?? ''}
        </span>
        <Icon name="chevron" size={16} className="select-chevron" />
      </button>

      {open ? (
        <div className={`select-popup align-${popupAlign}${dropUp ? ' drop-up' : ''}`}>
          {searchable ? (
            <div className="select-filter">
              <Icon name="search" size={16} />
              <input
                ref={filterRef}
                type="text"
                role="combobox"
                aria-label={`Filter ${label.toLowerCase()}`}
                aria-controls={listId}
                aria-expanded="true"
                aria-autocomplete="list"
                aria-activedescendant={activeId}
                placeholder={searchPlaceholder}
                value={filter}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={onKeyDown}
              />
            </div>
          ) : null}
          <ul ref={listRef} id={listId} role="listbox" aria-labelledby={labelId} className="select-list">
            {shown.length === 0 ? (
              <li className="select-empty" role="presentation">
                No match for “{filter.trim()}”
              </li>
            ) : (
              shown.map((o, i) => (
                <li
                  key={o.value}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={o.value === value}
                  className={`select-option${i === active ? ' is-active' : ''}${o.value === value ? ' is-selected' : ''}`}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => pick(i)}
                  onPointerMove={() => i !== active && setActive(i)}
                >
                  <span className="select-option-label">{o.label}</span>
                  {o.hint ? <span className="select-option-hint">{o.hint}</span> : null}
                  {o.value === value ? <Icon name="check" size={16} className="select-check" /> : null}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
