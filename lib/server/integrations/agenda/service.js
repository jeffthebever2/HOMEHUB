import { fetchJson } from '../../fetch.js';

function classifyEvents(events) {
  const today = [];
  const tomorrow = [];
  const upcoming = [];
  const now = new Date();
  const tomorrowDate = new Date();
  tomorrowDate.setDate(now.getDate() + 1);
  for (const event of events) {
    const start = new Date(event.start.dateTime || event.start.date);
    const sameDay = start.toDateString() === now.toDateString();
    const sameTomorrow = start.toDateString() === tomorrowDate.toDateString();
    if (sameDay) today.push(event);
    else if (sameTomorrow) tomorrow.push(event);
    else upcoming.push(event);
  }
  return { today, tomorrow, upcoming };
}

export async function getAgendaPayload(config, context) {
  const token = context.googleProviderToken;
  if (!token) {
    return {
      status: 'disconnected',
      headline: 'Calendar not connected',
      supportingText: 'Sign in with Google Calendar access to show today’s schedule.',
      items: [],
    };
  }

  const calendarIds = config.agenda.selectedCalendars || ['primary'];
  const maxItems = config.agenda.maxItems || 6;
  const timeMin = new Date().toISOString();
  const events = [];

  for (const calendarId of calendarIds) {
    const response = await fetchJson(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
      `?maxResults=${maxItems}&orderBy=startTime&singleEvents=true&timeMin=${encodeURIComponent(timeMin)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      },
      7000
    );
    if (response.ok && Array.isArray(response.data?.items)) {
      events.push(...response.data.items.map((event) => ({ ...event, calendarId })));
    }
  }

  events.sort((left, right) => new Date(left.start.dateTime || left.start.date) - new Date(right.start.dateTime || right.start.date));
  const limited = events.slice(0, maxItems);
  const buckets = classifyEvents(limited);
  const next = limited[0] || null;

  return {
    status: next ? 'normal' : 'empty',
    headline: next ? next.summary || 'Upcoming event' : 'No upcoming events',
    supportingText: next
      ? new Date(next.start.dateTime || next.start.date).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
      : 'Nothing scheduled soon.',
    items: limited.map((event) => ({
      id: event.id,
      summary: event.summary || 'Untitled event',
      start: event.start.dateTime || event.start.date,
      calendarId: event.calendarId,
    })),
    sections: {
      today: buckets.today.length,
      tomorrow: buckets.tomorrow.length,
      upcoming: buckets.upcoming.length,
    },
  };
}

export function getAgendaHealth(context) {
  return {
    providerId: 'google_calendar',
    healthStatus: context.googleProviderToken ? 'healthy' : 'missing',
    authState: context.googleProviderToken ? 'connected' : 'missing',
    warnings: context.googleProviderToken ? [] : ['No Google provider token present in the current session.'],
  };
}
