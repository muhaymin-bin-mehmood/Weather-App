/** Letters from any script, plus spaces, hyphens, apostrophes and periods (St. John's, Bahawalpur, Zürich, 東京). */
const CITY_PATTERN = /^[\p{L}\p{M}\s.'’-]+$/u;

export function validateCityQuery(raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'Enter a city name to search.';
  if (!CITY_PATTERN.test(value)) {
    return 'City names can only contain letters, spaces, hyphens, periods and apostrophes.';
  }
  if (value.length < 2) return 'Type at least 2 letters.';
  if (value.length > 80) return 'That name is too long — try just the city name.';
  return null;
}

/** "HH:MM", 24-hour. */
export function validateReminderTime(value: string): string | null {
  if (!value) return 'Choose a time for your reminder.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return 'Enter a time like 07:30.';
  return null;
}
