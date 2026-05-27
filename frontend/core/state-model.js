// v2 state model — sv2_* namespace. No STEM/roadmap concepts.

export const STORAGE_KEYS_V2 = Object.freeze({
  user:     'sv2_user',
  track:    'sv2_track',
  today:    'sv2_today',
  history:  'sv2_history',
  telegram: 'sv2_telegram',
});

// Backward-compat alias so stale imports don't crash at parse time.
export const STORAGE_KEYS = STORAGE_KEYS_V2;

export const TRACK_STATUSES     = Object.freeze(['generating', 'active', 'complete', 'paused', 'abandoned']);
export const TRACK_KINDS        = Object.freeze(['spark', 'track']);
export const DAY_STATUSES       = Object.freeze(['pending', 'in_progress', 'done', 'blocked', 'skipped', 'missed', 'rescued', 'rest']);
export const DAY_ROLES          = Object.freeze(['setup', 'build', 'validate', 'ship', 'review', 'rest']);
export const GOAL_CATEGORIES    = Object.freeze(['project', 'startup', 'content', 'skill', 'career', 'study', 'habit', 'fitness', 'other']);
export const BLOCKER_CATEGORIES = Object.freeze(['time', 'skill_gap', 'no_access', 'unclear', 'motivation', 'external', 'other']);

// ── Default factories ──────────────────────────────────────────────────────

export function createDefaultUserV2() {
  return {
    id:               '',
    email:            '',
    name:             '',
    goalCategory:     'other',
    createdAt:        isoDateNow(),
    experienceLevel:  'intermediate',
    dailyHours:       '2-4',
    currentProject:   '',
    weekGoal:         '',
    whyItMatters:     '',
    triedBefore:      '',
    preferredRestDay: null,   // 1–7: position within each 7-day week (1=first day, 7=last). null = no rest day (Spark).
    goalArtifact:     '',     // The one concrete artifact the user commits to building (set during goal sharpening)
  };
}

export function createDefaultTrackV2() {
  return {
    id:                '',
    goal:              '',
    goalCategory:      'other',
    blockerHint:       '',
    generatedAt:       '',
    startDate:         '',
    status:            'active',
    currentDayNumber:  1,
    currentWeekNumber: 1,      // 1–4 for Track, null for Spark
    kind:              'track', // 'spark' | 'track'
    totalDays:         28,     // 7 for Spark, 28 for Track (4 weeks × 7 days)
    phases:            null,   // Phase[] for Track, null for Spark
    restDayPosition:   null,   // 1–7: which day within each week is rest. null = no rest days (Spark).
    days:              [],
    continuationOf:    null,
  };
}

export function createDefaultTodayV2(date, dayNumber) {
  return {
    date:           date || isoDateNow(),
    dayNumber:      dayNumber || 1,
    status:         'pending',
    proof:           null,
    proofResult:     null,
    agentSession:    null,
    actionKit:       null,
    rescueAction:    null,
    rescueRepeating: false,
    blockerDiagnosis: null,  // { stuckAt, tried } — set during diagnosis phase
    blockerText:    '',
    skipReason:     '',
    outcomeAt:      '',
    adaptationNote: '',
  };
}

export function createDefaultHistoryV2() {
  return {
    entries:         [],
    successStreak:   0,
    currentDayStreak: 0,
    failurePatterns: [],
    archivedTracks:  [],
  };
}

export function createDefaultTelegramV2() {
  return {
    connected:      false,
    chatId:         '',
    username:       '',
    connectedAt:    '',
    pingHour:       9,
    pingEnabled:    true,
    lastPingSentAt: '',
    lastPingStatus: '',
  };
}

export function createInitialState() {
  return {
    user:       createDefaultUserV2(),
    track:      createDefaultTrackV2(),
    today:      createDefaultTodayV2(isoDateNow(), 1),
    history:    createDefaultHistoryV2(),
    telegram:   createDefaultTelegramV2(),
    recapText:  '', // session-only, not persisted
    ui: {
      activeRoute:       '/',
      authReady:         false,
      loading:           false,
      trackGenerating:   false,
      agentOpen:         false,
      kitOpen:           false,
      blockedModalOpen:  false,
      rescueLoading:     false,
      proofModalOpen:    false,
      day7RecapOpen:     false,
      toast:             null,
      error:             '',
      insight:           '',
      agentLoading:      false,
      kitLoading:        false,
      proofLoading:      false,
      recapLoading:      false,
      trackContinuing:   false,
      weekRecapData:     null,  // { weekNumber, shipped, onTrack, nextWeekFocus } — session-only
    },
  };
}

// ── Status transition helpers ──────────────────────────────────────────────

const DAY_TRANSITIONS = Object.freeze({
  pending:     ['in_progress', 'done', 'blocked', 'skipped', 'missed'],
  in_progress: ['done', 'blocked', 'skipped'],
  blocked:     ['rescued', 'skipped', 'missed'],
  done:        [],
  rescued:     [],
  skipped:     [],
  missed:      [],
  rest:        [], // rest days are fixed; they never transition to another status
});

export function canTransitionDayStatus(from, to) {
  return Boolean(DAY_TRANSITIONS[from]?.includes(to));
}

export function normalizeDayStatus(value) {
  const s = String(value || '').toLowerCase();
  return DAY_STATUSES.includes(s) ? s : 'pending';
}

export function normalizeTrackStatus(value) {
  const s = String(value || '').toLowerCase();
  return TRACK_STATUSES.includes(s) ? s : 'active';
}

export function normalizeTrackKind(value) {
  const s = String(value || '').toLowerCase();
  return TRACK_KINDS.includes(s) ? s : 'track';
}

export function normalizeGoalCategory(value) {
  const s = String(value || '').toLowerCase();
  return GOAL_CATEGORIES.includes(s) ? s : 'other';
}

// ── Shim: today-engine.js imports this name ────────────────────────────────
export const createDefaultToday = createDefaultTodayV2;

// ── Utilities ──────────────────────────────────────────────────────────────

export function isoDateNow(now = new Date()) {
  const year  = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day   = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
