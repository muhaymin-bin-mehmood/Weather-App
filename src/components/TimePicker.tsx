import { useId } from 'react';
import { Select, type SelectOption } from './Select';

/*
 * Reminder time as three styled dropdowns (hour, minute, AM/PM) instead of the
 * browser's native time field, which looks different in every browser. The
 * value in and out is always 24-hour "HH:MM", so storage and scheduling are
 * unchanged. Every minute is offered, so any saved time can be shown.
 */

const HOURS: SelectOption[] = Array.from({ length: 12 }, (_, i) => {
  const h = String(i + 1);
  return { value: h, label: h.padStart(2, '0') };
});
const MINUTES: SelectOption[] = Array.from({ length: 60 }, (_, i) => {
  const m = String(i).padStart(2, '0');
  return { value: m, label: m };
});
const PERIODS: SelectOption[] = [
  { value: 'AM', label: 'AM' },
  { value: 'PM', label: 'PM' },
];

export function split(value: string): { hour: string; minute: string; period: 'AM' | 'PM' } {
  const [h = 7, m = 30] = value.split(':').map(Number);
  const safeH = Number.isFinite(h) ? ((h % 24) + 24) % 24 : 7;
  const safeM = Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 30;
  return {
    hour: String(safeH % 12 === 0 ? 12 : safeH % 12),
    minute: String(safeM).padStart(2, '0'),
    period: safeH < 12 ? 'AM' : 'PM',
  };
}

export function join(hour: string, minute: string, period: string): string {
  let h = Number(hour) % 12;
  if (period === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${minute}`;
}

export function TimePicker({
  value,
  onChange,
  label,
  describedBy,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  describedBy?: string;
}) {
  const labelId = useId();
  const { hour, minute, period } = split(value || '07:30');
  return (
    <div className="time-picker" role="group" aria-labelledby={labelId} aria-describedby={describedBy}>
      <span id={labelId} className="sr-only">
        {label}
      </span>
      <Select
        className="time-part"
        label="Hour"
        hideLabel
        value={hour}
        options={HOURS}
        onChange={(h) => onChange(join(h, minute, period))}
        popupAlign="start"
      />
      <span className="time-colon" aria-hidden="true">
        :
      </span>
      <Select
        className="time-part"
        label="Minute"
        hideLabel
        value={minute}
        options={MINUTES}
        onChange={(m) => onChange(join(hour, m, period))}
        popupAlign="start"
      />
      <Select
        className="time-part time-period"
        label="AM or PM"
        hideLabel
        value={period}
        options={PERIODS}
        onChange={(p) => onChange(join(hour, minute, p))}
        popupAlign="start"
      />
    </div>
  );
}
