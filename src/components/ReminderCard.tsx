import { useEffect, useId, useState } from 'react';
import type { TempUnit } from '../lib/format';
import { validateReminderTime } from '../lib/validation';
import { nextOccurrence } from '../reminder/schedule';
import { useReminder } from '../reminder/useReminder';
import type { City } from '../types';
import { Icon } from './Icon';

interface Props {
  currentCity: City | null;
  unit: TempUnit;
}

function describeNext(date: Date): string {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) return `today at ${time}`;
  if (date.toDateString() === tomorrow.toDateString()) return `tomorrow at ${time}`;
  return `${date.toLocaleDateString(undefined, { weekday: 'long' })} at ${time}`;
}

export function ReminderCard({ currentCity, unit }: Props) {
  const r = useReminder(currentCity, unit);
  const timeId = useId();
  const errorId = useId();
  const [explaining, setExplaining] = useState(false);
  const [timeValue, setTimeValue] = useState('');
  const [timeError, setTimeError] = useState<string | null>(null);
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    if (r.settings && !timeValue) setTimeValue(r.settings.time);
  }, [r.settings, timeValue]);

  const on = Boolean(r.settings?.enabled && r.permission === 'granted');

  const header = (
    <div className="section-head">
      <h2 className="eyebrow eyebrow-icon">
        <Icon name="bell" size={16} />
        Morning briefing
      </h2>
      {on ? <span className="section-note">On</span> : null}
    </div>
  );

  if (r.support === 'unsupported') {
    return (
      <section className="panel briefing">
        {header}
        <div className="panel-empty">
          <p>
            This browser can't show notifications from websites, so daily reminders aren't available here. Everything
            else in WeatherBoard works normally.
          </p>
        </div>
      </section>
    );
  }

  if (r.support === 'ios-needs-install') {
    return (
      <section className="panel briefing">
        {header}
        <div className="panel-empty">
          <p>
            On iPhone and iPad, Safari only allows notifications for installed apps. Tap <strong>Share</strong> →{' '}
            <strong>Add to Home Screen</strong>, open WeatherBoard from there (iOS 16.4 or later), and turn the
            reminder on.
          </p>
        </div>
      </section>
    );
  }

  if (!r.settings) {
    return (
      <section className="panel briefing" aria-busy="true">
        {header}
        <span className="skeleton-line" />
        <span className="skeleton-line short" />
      </section>
    );
  }

  const commitTime = async () => {
    const err = validateReminderTime(timeValue);
    setTimeError(err);
    if (!err && timeValue !== r.settings?.time) await r.setTime(timeValue);
  };

  const turnOn = async () => {
    const err = validateReminderTime(timeValue);
    setTimeError(err);
    if (err) return;
    if (r.permission === 'granted') {
      await r.setTime(timeValue);
      await r.enable();
    } else {
      setExplaining(true); // explain before the browser's own prompt appears
    }
  };

  const blocked = r.permission === 'denied';

  const controls = (
    <div className="briefing-row">
      <div className="field">
        <label htmlFor={timeId} className="sr-only">
          Remind me at
        </label>
        <input
          id={timeId}
          type="time"
          className="input time-input"
          value={timeValue}
          required
          aria-invalid={timeError ? true : undefined}
          aria-describedby={timeError ? errorId : undefined}
          onChange={(e) => {
            setTimeValue(e.target.value);
            if (timeError) setTimeError(validateReminderTime(e.target.value));
          }}
          onBlur={commitTime}
        />
      </div>
      <button
        type="button"
        role="switch"
        className="switch"
        aria-checked={on}
        aria-label="Daily morning briefing notification"
        disabled={blocked || r.busy}
        onClick={() => (on ? r.disable() : turnOn())}
      >
        <span className="switch-thumb" aria-hidden="true" />
      </button>
    </div>
  );

  const timeErrorEl = timeError ? (
    <p id={errorId} className="field-error" role="alert">
      <Icon name="alert" size={16} />
      {timeError}
    </p>
  ) : null;

  if (blocked) {
    return (
      <section className="panel briefing">
        {header}
        {controls}
        <p className="briefing-status">
          <Icon name="bell-off" size={16} /> Notifications are blocked for this site.
        </p>
        <p className="field-hint">
          To get a morning briefing, allow notifications in your browser's site settings (the icon left of the address
          bar), then reload. Everything else keeps working.
        </p>
      </section>
    );
  }

  const delivery = (
    <details className="disclosure">
      <summary>How delivery works</summary>
      <p>
        {r.mode === 'periodic-sync'
          ? 'Arrives on time while WeatherBoard is open. When it’s closed, delivery is best-effort: your browser decides when to wake the app, so the briefing may come late or be skipped that day.'
          : 'Arrives on time only while WeatherBoard is open in a tab. When it’s closed, this browser won’t deliver it — that would need a push server, which this app doesn’t have.'}
      </p>
    </details>
  );

  if (on) {
    const next = nextOccurrence(r.settings);
    return (
      <section className="panel briefing">
        {header}
        {controls}
        {timeErrorEl}
        <p className="briefing-status">
          Next briefing {describeNext(next)}
          {r.settings.city ? ` for ${r.settings.city.name}` : ''}.
        </p>
        <div className="link-row">
          {delivery}
          <button
            type="button"
            className="text-button"
            onClick={async () => {
              await r.sendTest();
              setTestSent(true);
              window.setTimeout(() => setTestSent(false), 4000);
            }}
          >
            {testSent ? 'Sent ✓' : 'Send a test'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel briefing">
      {header}
      {controls}
      {timeErrorEl}
      {explaining ? (
        <div className="explain" role="group" aria-label="Allow notifications">
          <p>
            <strong>One notification a day</strong> at the time you pick, with the current weather
            {currentCity ? ` in ${currentCity.name}` : ''}. Your browser will ask for permission next — you can turn
            it off any time.
          </p>
          <div className="button-row">
            <button
              type="button"
              className="button button-primary"
              disabled={r.busy}
              onClick={async () => {
                const err = validateReminderTime(timeValue);
                setTimeError(err);
                if (err) return;
                await r.setTime(timeValue);
                await r.enable();
                setExplaining(false);
              }}
            >
              {r.busy ? 'Waiting for your browser…' : 'Allow notifications'}
            </button>
            <button type="button" className="button button-ghost" onClick={() => setExplaining(false)}>
              Not now
            </button>
          </div>
        </div>
      ) : (
        <p className="briefing-status">A short weather summary at this time each day.</p>
      )}
      {delivery}
    </section>
  );
}
