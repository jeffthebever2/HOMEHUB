import { restMutate, restSelect } from '../../supabase.js';
import { getLocalWeekdayIndex, getNextLocalMidnightIso, isSameLocalDay } from '../../time.js';
import { fetchJson } from '../../fetch.js';

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

function evaluateChores(config, chores) {
  const weekday = getLocalWeekdayIndex(new Date(), config.system.timezone);
  const grouped = { overdue: [], dueToday: [], completedToday: [], upcoming: [] };
  for (const chore of chores) {
    const scheduledDay = typeof chore.day_of_week === 'number' ? chore.day_of_week : deriveCategoryDay(chore.category);
    const isDaily = !scheduledDay && (chore.category === 'Daily' || !chore.category);
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
    nextResetAt: getNextLocalMidnightIso(new Date(), config.system.timezone),
    grouped,
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
  const dogs = dogsResponse.ok ? (dogsResponse.data || {}) : {};
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
  if (!dogId) return {};
  const response = await fetchJson(`${FIREBASE_DATABASE_URL}/treats/${dogId}.json`, {}, 6000);
  return response.ok ? (response.data || {}) : {};
}

function evaluateTreats(config, dogId, dog, rawEvents) {
  const dailyLimitTreats = config.household.treats.dailyLimitTreats;
  const events = Object.entries(rawEvents || {})
    .map(([id, event]) => ({ id, ...event }))
    .filter((event) => event.timestamp && isSameLocalDay(event.timestamp, new Date(), config.system.timezone))
    .sort((left, right) => right.timestamp - left.timestamp);

  const treatsGivenToday = events.length;
  const treatsRemaining = Math.max(dailyLimitTreats - treatsGivenToday, 0);
  const percentOfLimit = Math.min(Math.round((treatsGivenToday / dailyLimitTreats) * 100), 100);
  const caloriesFromTreats = events.reduce((sum, event) => sum + Number(event.calories || 0), 0);
  const statusLevel = treatsGivenToday >= dailyLimitTreats ? 'at' : treatsGivenToday >= Math.ceil(dailyLimitTreats * 0.7) ? 'near' : 'under';

  return {
    petId: dogId || 'barker',
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

export async function getHouseholdPayload(config, context) {
  const rawChores = context.householdId
    ? await restSelect('chores', `select=*&household_id=eq.${context.householdId}&order=created_at.desc`)
    : [];
  const chores = evaluateChores(config, rawChores || []);
  const { dogId, dog } = await fetchTreatProfile(config);
  const treatEvents = await fetchTreatEvents(dogId);
  const treats = evaluateTreats(config, dogId, dog, treatEvents);
  const status = chores.summary.overdueCount > 0 || treats.statusLevel === 'at'
    ? 'warning'
    : chores.summary.dueToday > 0 || treats.statusLevel === 'near'
      ? 'info'
      : 'success';

  return {
    meta: {
      schemaVersion: 1,
      fetchedAt: new Date().toISOString(),
      stale: false,
      degraded: false,
      isMock: false,
      warnings: [],
    },
    summary: {
      status,
      priority: status === 'warning' ? 'attention_needed' : 'normal',
      headline: chores.summary.overdueCount > 0
        ? `${chores.summary.overdueCount} overdue chore${chores.summary.overdueCount === 1 ? '' : 's'}`
        : `${chores.summary.completedToday} of ${chores.summary.completedToday + chores.summary.dueToday} chores done`,
      supportingText: treats.statusLevel === 'at'
        ? `${treats.petName} has reached today’s treat limit.`
        : `${treats.petName}: ${treats.treatsRemaining} treats left today.`,
      badges: [`${chores.summary.dueToday} due`, `${treats.treatsRemaining} treats left`],
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
      chores: {
        nextResetAt: chores.nextResetAt,
        overdue: chores.grouped.overdue,
        dueToday: chores.grouped.dueToday,
        completedToday: chores.grouped.completedToday,
        upcoming: chores.grouped.upcoming,
      },
      treats,
    },
  };
}

async function writeTreatEvent(dogId, event) {
  const response = await fetchJson(`${FIREBASE_DATABASE_URL}/treats/${dogId}/${event.id}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  }, 6000);
  if (!response.ok) throw new Error('Failed to write treat event');
}

export async function mutateHousehold(config, context, body = {}) {
  if (!context.householdId) {
    const error = new Error('Household context required');
    error.statusCode = 401;
    throw error;
  }

  const action = body.action;
  if (action === 'toggle_chore') {
    const isComplete = Boolean(body.complete);
    const payload = {
      status: isComplete ? 'done' : 'pending',
      completed_by_name: isComplete ? (context.user?.user_metadata?.full_name || context.user?.email || 'Family') : null,
      last_completed_at: isComplete ? new Date().toISOString() : null,
    };
    await restMutate('chores', `id=eq.${body.id}`, 'PATCH', payload, { prefer: 'return=minimal' });
    return { success: true };
  }

  if (action === 'create_chore') {
    const payload = {
      household_id: context.householdId,
      title: body.title,
      category: body.category || 'Daily',
      priority: body.priority || 'medium',
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    const data = await restMutate('chores', '', 'POST', payload);
    return { success: true, data };
  }

  if (action === 'delete_chore') {
    await restMutate('chores', `id=eq.${body.id}`, 'DELETE', {}, { prefer: 'return=minimal' });
    return { success: true };
  }

  if (action === 'log_treat') {
    const { dogId } = await fetchTreatProfile(config);
    const event = {
      name: body.name || 'Treat',
      calories: Number(body.calories || 0),
      timestamp: Date.now(),
      by: context.user?.user_metadata?.full_name || context.user?.email || 'Family',
      id: String(Date.now()),
    };
    await writeTreatEvent(dogId, event);
    return { success: true };
  }

  throw new Error(`Unknown household action: ${action}`);
}

export async function getHouseholdHealth(config, context) {
  try {
    const payload = await getHouseholdPayload(config, context);
    return {
      status: payload.meta.degraded ? 'degraded' : 'healthy',
      choresDueToday: payload.summary.chores.dueToday,
      treatsRemaining: payload.summary.treats.treatsRemaining,
    };
  } catch (error) {
    return {
      status: 'error',
      errorState: error.message,
    };
  }
}
