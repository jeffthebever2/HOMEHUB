export function getTimeZone(config) {
  return config?.system?.timezone || process.env.HOMEHUB_TZ || 'America/New_York';
}

export function toLocalDateKey(date = new Date(), timeZone = 'America/New_York') {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

export function getLocalWeekdayIndex(date = new Date(), timeZone = 'America/New_York') {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  });
  const key = formatter.format(date);
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[key] ?? date.getDay();
}

export function getNextLocalMidnightIso(date = new Date(), timeZone = 'America/New_York') {
  const localKey = toLocalDateKey(date, timeZone);
  const [year, month, day] = localKey.split('-').map(Number);
  const tomorrowUtc = new Date(Date.UTC(year, month - 1, day + 1, 5, 0, 0));
  return tomorrowUtc.toISOString();
}

export function isSameLocalDay(left, right = new Date(), timeZone = 'America/New_York') {
  if (!left) return false;
  return toLocalDateKey(new Date(left), timeZone) === toLocalDateKey(new Date(right), timeZone);
}

export function parseClockMinutes(value) {
  if (!value || !value.includes(':')) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return (hours * 60) + minutes;
}

export function isQuietHours(config, date = new Date()) {
  const start = parseClockMinutes(config?.system?.quietHoursStart);
  const end = parseClockMinutes(config?.system?.quietHoursEnd);
  if (start == null || end == null) return false;
  const nowMinutes = (date.getHours() * 60) + date.getMinutes();
  if (start <= end) return nowMinutes >= start && nowMinutes < end;
  return nowMinutes >= start || nowMinutes < end;
}
