import { restMutate, restSelect } from '../../supabase.js';
import { fetchJson } from '../../fetch.js';
import { createMeta } from '../../http.js';
import { getLocalWeekdayIndex, getNextLocalMidnightIso, isSameLocalDay } from '../../time.js';

const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL || 'https://dog-calorie-counter-default-rtdb.firebaseio.com';

function deriveCategoryDay(category) {
  const map = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  if (!category) return null;
  const entry = Object.entries(map).find(([key]) => category.toLowerCase().includes(key));
  return entry ? entry[1] : null;
}

function buildEmptyChores(config, warning = '') {
  return {
    degraded: Boolean(warning),
    warning: warning || null,
    nextResetAt: getNextLocalMidnightIso(new Date(), config.system.timezone),
    overdue: [],
    dueToday: [],
    completedToday: [],
    upcoming: [],
    summary: {
      dueToday: 0,
      completedToday: 0,
      overdueCount: 0,
      progressPercent: 0,
    },
  };
}

function buildEmptyTreats(config, warning = '') {
  const dailyLimitTreats = Math.max(Number(config?.household?.treats?.dailyLimitTreats || 0), 0);
  return {
    degraded: Boolean(warning),
    warning: warning || null,
    petId: 'pet',
    petName: config?.household?.treats?.petName || 'Pet',
    avatarEmoji: config?.household?.treats?.avatarEmoji || '🐕',
    dailyLimitTreats,
    treatsGivenToday: 0,
    treatsRemaining: dailyLimitTreats,
    percentOfLimit: 0,
    caloriesToday: {
      total: 0,
      fromFood: 0,
      fromTreats: 0,
      dailyCalorieTarget: 0,
    },
    statusLevel: warning ? 'unknown' : 'under',
    lastTreat: null,
    history: [],
    resetsAt: getNextLocalMidnightIso(new Date(), config.system.timezone),
  };
}

function evaluateChores(config, chores) {
  const weekday = getLocalWeekdayIndex(new Date(), config.system.timezone);
  const grouped = { overdue: [], dueToday: [], completedToday: [], upcoming: [] };
  for (const chore of chores) {
    const scheduledDay = typeof chore.day_of_week === 'number' ? chore.day_of_week : deriveCategoryDay(chore.category);
    const isDaily = scheduledDay == null && (chore.category === 'Daily' || !chore.category);
    const isDueToday = isDaily || scheduledDay === weekday;
    const wasCompletedToday = chore.last_completed_at
      ? isSameLocalDay(chore.last_completed_at, new Date(), config.system.timezone)
      : chore.status === 'done';

    const normalized = {
      id: chore.id,
      title: chore.title || chore.name || 'Untitled chore',
      assignee: chore.assignee || chore.completed_by_name || null,
      frequency: isDaily ? 'daily' : 'weekly',
      badge: isDueToday ? 'Today' : scheduledDay != null ? 'Weekly' : 'Daily',
      completed: wasCompletedToday || chore.status === 'done',
      overdue: false,
    };

    if (normalized.completed && isDueToday) {
      grouped.completedToday.push(normalized);
      continue;
    }
    if (!normalized.completed && isDueToday) {
      grouped.dueToday.push(normalized);
      continue;
    }
    if (!normalized.completed && scheduledDay != null && scheduledDay < weekday) {
      normalized.overdue = true;
      normalized.badge = 'Overdue';
      grouped.overdue.push(normalized);
      continue;
    }
    grouped.upcoming.push(normalized);
  }

  const dueToday = grouped.dueToday.length + grouped.completedToday.length;
  const progressPercent = dueToday > 0 ? Math.round((grouped.completedToday.length / dueToday) * 100) : 100;

  return {
    degraded: false,
    warning: null,
    nextResetAt: getNextLocalMidnightIso(new Date(), config.system.timezone),
    overdue: grouped.overdue,
    dueToday: grouped.dueToday,
    completedToday: grouped.completedToday,
    upcoming: grouped.upcoming,
    summary: {
      dueToday: grouped.dueToday.length,
      completedToday: grouped.completedToday.length,
      overdueCount: grouped.overdue.length,
      progressPercent,
    },
  };
}

async function fetchTreatProfile(config) {
  const dogsResponse = await fetchJson(`${FIREBASE_DATABASE_URL}/dogs.json`, {}, 6000);
  if (!dogsResponse.ok) {
    throw new Error('Treat profile fetch failed');
  }

  const dogs = dogsResponse.data || {};
  const dogEntries = Object.entries(dogs);
  const petName = config.household.treats.petName;
  const selected = dogEntries.find(([, dog]) => dog?.name === petName) || dogEntries[0] || [null, null];
  const [dogId, dog] = selected;
  return {
    dogId,
    dog: dog || {
      name: petName,
      dailyCalorieLimit: 1800,
    },
  };
}

async function fetchTreatEvents(dogId) {
  if (!dogId) throw new Error('Treat profile is missing a dog id');
  const response = await fetchJson(`${FIREBASE_DATABASE_URL}/treats/${dogId}.json`, {}, 6000);
  if (!response.ok) {
    throw new Error('Treat events fetch failed');
  }
  return response.data || {};
}

function evaluateTreats(config, dogId, dog, rawEvents) {
  const dailyLimitTreats = Math.max(Number(config.household.treats.dailyLimitTreats || 0), 0);
  const events = Object.entries(rawEvents || {})
    .map(([id, event]) => ({ id, ...event }))
    .filter((event) => event.timestamp && isSameLocalDay(event.timestamp, new Date(), config.system.timezone))
    .sort((left, right) => right.timestamp - left.timestamp);

  const treatsGivenToday = events.length;
  const treatsRemaining = Math.max(dailyLimitTreats - treatsGivenToday, 0);
  const percentOfLimit = dailyLimitTreats > 0
    ? Math.min(Math.round((treatsGivenToday / dailyLimitTreats) * 100), 100)
    : 0;
  const caloriesFromTreats = events.reduce((sum, event) => sum + Number(event.calories || 0), 0);
  const statusLevel = dailyLimitTreats === 0
    ? 'unknown'
    : treatsGivenToday >= dailyLimitTreats
      ? 'at'
      : treatsGivenToday >= Math.ceil(dailyLimitTreats * 0.7)
        ? 'near'
        : 'under';

  return {
    degraded: false,
    warning: null,
    petId: dogId || 'pet',
    petName: dog?.name || config.household.treats.petName,
    avatarEmoji: config.household.treats.avatarEmoji,
    dailyLimitTreats,
    treatsGivenToday,
    treatsRemaining,
    percentOfLimit,
    caloriesToday: {
      total: Number(dog?.dailyCalorieLimit || 0),
      fromFood: 0,
      fromTreats: caloriesFromTreats,
      dailyCalorieTarget: Number(dog?.dailyCalorieLimit || 0),
    },
    statusLevel,
    lastTreat: events[0] ? {
      at: new Date(events[0].timestamp).toISOString(),
      by: events[0].by || 'Family',
      note: events[0].name || events[0].note || null,
    } : null,
    history: events.slice(0, 10).map((event) => ({
      id: event.id,
      at: new Date(event.timestamp).toISOString(),
      by: event.by || 'Family',
      note: event.name || event.note || null,
      calories: Number(event.calories || 0),
    })),
    resetsAt: getNextLocalMidnightIso(new Date(), config.system.timezone),
  };
}

function buildHouseholdPayload(config, chores, treats, warnings = []) {
  const degraded = warnings.length > 0 || chores.degraded || treats.degraded;
  let status = 'success';
  if (chores.summary.overdueCount > 0 || treats.statusLevel === 'at') {
    status = 'warning';
  } else if (degraded || chores.summary.dueToday > 0 || treats.statusLevel === 'near' || treats.statusLevel === 'unknown') {
    status = 'info';
  }

  let headline = `${chores.summary.completedToday} of ${chores.summary.completedToday + chores.summary.dueToday} chores done`;
  let supportingText = `${treats.petName}: ${treats.treatsRemaining} treats left today.`;

  if (chores.summary.overdueCount > 0) {
    headline = `${chores.summary.overdueCount} overdue chore${chores.summary.overdueCount === 1 ? '' : 's'}`;
  } else if (degraded && chores.degraded) {
    headline = 'Chore status temporarily unavailable';
  }

  if (treats.statusLevel === 'at') {
    supportingText = `${treats.petName} has reached today’s treat limit.`;
  } else if (degraded && treats.degraded) {
    supportingText = 'Treat tracker data is temporarily unavailable.';
  } else if (degraded && warnings.length) {
    supportingText = 'HomeHub is showing the best available household state.';
  }

  return {
    meta: createMeta({
      degraded,
      warnings,
    }),
    summary: {
      status,
      priority: status === 'warning' ? 'attention_needed' : 'normal',
      headline,
      supportingText,
      badges: [
        chores.degraded ? 'chores degraded' : `${chores.summary.dueToday} due`,
        treats.degraded ? 'treats degraded' : `${treats.treatsRemaining} treats left`,
      ],
      cta: { label: 'Open Household', route: '#/household' },
      updatedAt: new Date().toISOString(),
      chores: chores.summary,
      treats: {
        petName: treats.petName,
        statusLevel: treats.statusLevel,
        treatsRemaining: treats.treatsRemaining,
      },
    },
    detail: {
      chores,
      treats,
    },
  };
}

export async function getHouseholdPayload(config, context) {
  const warnings = [];
  let chores = buildEmptyChores(config);
  let treats = buildEmptyTreats(config);

  if (!context.householdId) {
    const warning = 'Household context is missing.';
    warnings.push(warning);
    chores = buildEmptyChores(config, warning);
  } else {
    try {
      const rawChores = await restSelect('chores', `select=*&household_id=eq.${context.householdId}&order=created_at.desc`);
      chores = evaluateChores(config, rawChores || []);
    } catch (error) {
      const warning = `Chores unavailable: ${error.message}`;
      warnings.push(warning);
      chores = buildEmptyChores(config, warning);
    }
  }

  try {
    const { dogId, dog } = await fetchTreatProfile(config);
    const treatEvents = await fetchTreatEvents(dogId);
    treats = evaluateTreats(config, dogId, dog, treatEvents);
  } catch (error) {
    const warning = `Treat tracker unavailable: ${error.message}`;
    warnings.push(warning);
    treats = buildEmptyTreats(config, warning);
  }

  return buildHouseholdPayload(config, chores, treats, warnings);
}

async function writeTreatEvent(dogId, event) {
  const response = await fetchJson(`${FIREBASE_DATABASE_URL}/treats/${dogId}/${event.id}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  }, 6000);
  if (!response.ok) throw new Error('Failed to write treat event');
}

function requireField(value, message) {
  if (value == null || String(value).trim() === '') {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
}

export async function mutateHousehold(config, context, body = {}) {
  if (!context.householdId) {
    const error = new Error('Household context required');
    error.statusCode = 401;
    throw error;
  }

  const action = body.action;
  if (action === 'toggle_chore') {
    requireField(body.id, 'A chore id is required.');
    const isComplete = Boolean(body.complete);
    const payload = {
      status: isComplete ? 'done' : 'pending',
      completed_by_name: isComplete ? (context.user?.user_metadata?.full_name || context.user?.email || 'Family') : null,
      last_completed_at: isComplete ? new Date().toISOString() : null,
    };
    await restMutate('chores', `id=eq.${body.id}`, 'PATCH', payload, { prefer: 'return=minimal' });
    return { meta: createMeta(), success: true };
  }

  if (action === 'create_chore') {
    requireField(body.title, 'A chore title is required.');
    const payload = {
      household_id: context.householdId,
      title: String(body.title).trim(),
      category: body.category || 'Daily',
      priority: body.priority || 'medium',
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    const data = await restMutate('chores', '', 'POST', payload);
    return { meta: createMeta(), success: true, data };
  }

  if (action === 'delete_chore') {
    requireField(body.id, 'A chore id is required.');
    await restMutate('chores', `id=eq.${body.id}`, 'DELETE', {}, { prefer: 'return=minimal' });
    return { meta: createMeta(), success: true };
  }

  if (action === 'log_treat') {
    const { dogId } = await fetchTreatProfile(config);
    if (!dogId) {
      const error = new Error('Treat profile is unavailable.');
      error.statusCode = 503;
      throw error;
    }
    const event = {
      name: String(body.name || 'Treat').trim() || 'Treat',
      calories: Number(body.calories || 0),
      timestamp: Date.now(),
      by: context.user?.user_metadata?.full_name || context.user?.email || 'Family',
      id: String(Date.now()),
    };
    await writeTreatEvent(dogId, event);
    return { meta: createMeta(), success: true };
  }

  const error = new Error(`Unknown household action: ${action}`);
  error.statusCode = 400;
  throw error;
}

export async function getHouseholdHealth(config, context) {
  try {
    const payload = await getHouseholdPayload(config, context);
    return {
      status: payload.meta.degraded ? 'degraded' : 'healthy',
      choresDueToday: payload.summary.chores.dueToday,
      treatsRemaining: payload.summary.treats.treatsRemaining,
      warnings: payload.meta.warnings,
    };
  } catch (error) {
    return {
      status: 'error',
      errorState: error.message,
      warnings: [error.message],
    };
  }
}
