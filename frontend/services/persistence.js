import {
  STORAGE_KEYS_V2,
  createDefaultUserV2,
  createDefaultTrackV2,
  createDefaultTodayV2,
  createDefaultHistoryV2,
  createDefaultTelegramV2,
  isoDateNow,
  normalizeDayStatus,
  normalizeTrackStatus,
  normalizeGoalCategory,
  BLOCKER_CATEGORIES,
} from '../core/state-model.js';

const K = STORAGE_KEYS_V2;

export async function loadPersistedDomains({ userId, db }) {
  const local = readLocalDomains();
  let cloud = null;
  if (userId && db) {
    cloud = await readCloudDomains({ userId, db });
  }
  const source = cloud && Object.keys(cloud).length ? cloud : local;
  return validateDomains(source);
}

export async function saveDomains(domains, { userId, db }) {
  writeLocalDomains(domains);
  if (!userId || !db) return;
  await writeCloudDomains(domains, { userId, db });
}

export async function clearProgressData({ userId, db }) {
  const progressKeys = [K.track, K.today, K.history];
  progressKeys.forEach((k) => localStorage.removeItem(k));
  if (!userId || !db) return;
  try {
    const kvRef = db.collection('users').doc(userId).collection('kv');
    await Promise.all(progressKeys.map((k) => kvRef.doc(k).delete().catch(() => {})));
  } catch (error) {
    console.warn('Cloud progress wipe failed (local cleared)', error);
  }
}

export async function saveDomain(name, value, { userId, db }) {
  if (!Object.prototype.hasOwnProperty.call(K, name)) return;
  const key = K[name];
  localStorage.setItem(key, JSON.stringify(value));
  if (!userId || !db) return;
  const ref = db.collection('users').doc(userId).collection('kv').doc(key);
  await ref.set(
    { value: JSON.stringify(value), updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}

// ── Local I/O ──────────────────────────────────────────────────────────────

function readLocalDomains() {
  return {
    user:     parse(localStorage.getItem(K.user)),
    track:    parse(localStorage.getItem(K.track)),
    today:    parse(localStorage.getItem(K.today)),
    history:  parse(localStorage.getItem(K.history)),
    telegram: parse(localStorage.getItem(K.telegram)),
  };
}

function writeLocalDomains(domains) {
  localStorage.setItem(K.user,     JSON.stringify(domains.user));
  localStorage.setItem(K.track,    JSON.stringify(domains.track));
  localStorage.setItem(K.today,    JSON.stringify(domains.today));
  localStorage.setItem(K.history,  JSON.stringify(domains.history));
  localStorage.setItem(K.telegram, JSON.stringify(domains.telegram));
}

// ── Cloud I/O ──────────────────────────────────────────────────────────────

async function readCloudDomains({ userId, db }) {
  try {
    const snap = await db.collection('users').doc(userId).collection('kv').get();
    const result = {};
    snap.forEach((docSnap) => {
      const key = docSnap.id;
      const val = docSnap.data()?.value;
      if (!val || typeof val !== 'string') return;
      if (key === K.user)     result.user     = parse(val);
      if (key === K.track)    result.track    = parse(val);
      if (key === K.today)    result.today    = parse(val);
      if (key === K.history)  result.history  = parse(val);
      if (key === K.telegram) result.telegram = parse(val);
    });
    return result;
  } catch (error) {
    console.warn('Cloud read failed, using local domains', error);
    return null;
  }
}

async function writeCloudDomains(domains, { userId, db }) {
  try {
    const batch = db.batch();
    const kvRef = db.collection('users').doc(userId).collection('kv');
    const ts = firebase.firestore.FieldValue.serverTimestamp();
    const set = (key, val) =>
      batch.set(kvRef.doc(key), { value: JSON.stringify(val), updatedAt: ts }, { merge: true });
    set(K.user,     domains.user);
    set(K.track,    domains.track);
    set(K.today,    domains.today);
    set(K.history,  domains.history);
    set(K.telegram, domains.telegram);
    await batch.commit();
  } catch (error) {
    console.warn('Cloud write failed, local save preserved', error);
  }
}

// ── Validation / normalization ─────────────────────────────────────────────

function validateDomains(raw) {
  return {
    user:     validateUser(raw?.user),
    track:    validateTrack(raw?.track),
    today:    validateToday(raw?.today),
    history:  validateHistory(raw?.history),
    telegram: validateTelegram(raw?.telegram),
  };
}

function validateUser(raw) {
  const base = createDefaultUserV2();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    id:              String(raw.id           || ''),
    email:           String(raw.email        || ''),
    name:            String(raw.name         || ''),
    goalCategory:    normalizeGoalCategory(raw.goalCategory),
    createdAt:       String(raw.createdAt    || base.createdAt),
    experienceLevel: ['beginner', 'intermediate', 'advanced'].includes(raw.experienceLevel)
                       ? raw.experienceLevel : 'intermediate',
    dailyHours:      ['1-2', '2-4', '4-6', '6-8', '8+'].includes(raw.dailyHours)
                       ? raw.dailyHours : '2-4',
    currentProject:  String(raw.currentProject || '').slice(0, 200),
    weekGoal:        String(raw.weekGoal       || '').slice(0, 200),
    whyItMatters:    String(raw.whyItMatters   || '').slice(0, 200),
    triedBefore:     String(raw.triedBefore    || '').slice(0, 200),
  };
}

function validateTrack(raw) {
  const base = createDefaultTrackV2();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    id:               String(raw.id           || ''),
    goal:             String(raw.goal         || ''),
    goalCategory:     normalizeGoalCategory(raw.goalCategory),
    blockerHint:      String(raw.blockerHint  || ''),
    generatedAt:      String(raw.generatedAt  || ''),
    startDate:        String(raw.startDate    || ''),
    status:           normalizeTrackStatus(raw.status),
    currentDayNumber: Math.max(1, Math.min(7, Number(raw.currentDayNumber) || 1)),
    days:             Array.isArray(raw.days) ? raw.days.map(validateDayPlan) : [],
    continuationOf:   raw.continuationOf ? String(raw.continuationOf) : null,
  };
}

function validateDayPlan(raw) {
  const empty = { dayNumber: 1, title: '', why: '', successCriteria: '', estimateMinutes: 60, category: '', status: 'pending', date: '', adaptedAt: '', adaptNote: '' };
  if (!raw || typeof raw !== 'object') return empty;
  return {
    dayNumber:       Math.max(1, Math.min(7, Number(raw.dayNumber) || 1)),
    title:           String(raw.title           || ''),
    why:             String(raw.why             || ''),
    successCriteria: String(raw.successCriteria || ''),
    estimateMinutes: Number(raw.estimateMinutes) || 60,
    category:        String(raw.category        || ''),
    status:          normalizeDayStatus(raw.status),
    date:            String(raw.date            || '').slice(0, 10),
    adaptedAt:       String(raw.adaptedAt       || ''),
    adaptNote:       String(raw.adaptNote       || '').slice(0, 160),
  };
}

function validateToday(raw) {
  const base = createDefaultTodayV2();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    date:           String(raw.date           || isoDateNow()).slice(0, 10),
    dayNumber:      Math.max(1, Math.min(7, Number(raw.dayNumber) || 1)),
    status:         normalizeDayStatus(raw.status),
    proof:          validateProof(raw.proof),
    agentSession:   validateAgentSession(raw.agentSession),
    actionKit:      validateActionKit(raw.actionKit),
    proofResult:    validateProofResult(raw.proofResult),
    rescueAction:    validateRescueAction(raw.rescueAction),
    rescueRepeating: Boolean(raw.rescueRepeating),
    blockerText:     String(raw.blockerText    || ''),
    skipReason:     String(raw.skipReason     || ''),
    outcomeAt:      String(raw.outcomeAt      || ''),
    adaptationNote: String(raw.adaptationNote || ''),
  };
}

function validateActionKit(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const VALID_TYPES = new Set(['template', 'reference', 'question', 'tool', 'tip']);
  return raw
    .map((item) => ({
      type:    VALID_TYPES.has(item?.type) ? item.type : 'tip',
      label:   String(item?.label   || '').slice(0, 50),
      content: String(item?.content || '').slice(0, 400),
    }))
    .filter((item) => item.content);
}

function validateProof(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    type:        ['text', 'link', 'statement'].includes(raw.type) ? raw.type : 'text',
    value:       String(raw.value       || ''),
    submittedAt: String(raw.submittedAt || ''),
  };
}

function validateRescueAction(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.rescueTitle) return null;
  return {
    rescueTitle:      String(raw.rescueTitle      || '').slice(0, 100),
    steps:            Array.isArray(raw.steps) ? raw.steps.map((s) => String(s).slice(0, 200)) : [],
    reframeNote:      String(raw.reframeNote      || '').slice(0, 200),
    estimateMinutes:  Number(raw.estimateMinutes)  || 0,
    source:           raw.source === 'ai' ? 'ai' : 'fallback',
  };
}

function validateProofResult(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const VERDICTS = new Set(['met', 'partial', 'not_enough']);
  if (!VERDICTS.has(raw.verdict)) return null;
  return {
    verdict: raw.verdict,
    note:    String(raw.note || ''),
  };
}

function validateAgentSession(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    steps:            Array.isArray(raw.steps) ? raw.steps.map(validateAgentStep) : [],
    currentStepIndex: Number(raw.currentStepIndex) || 0,
    startedAt:        String(raw.startedAt  || ''),
    closedAt:         String(raw.closedAt   || ''),
    outcome:          ['done', 'blocked', 'partial', ''].includes(raw.outcome) ? raw.outcome : '',
    proofNote:        String(raw.proofNote  || ''),
  };
}

function validateAgentStep(raw) {
  const empty = { index: 0, text: '', output: '', hint: '', status: 'pending', stuckNote: '', userOutput: '', completedAt: '' };
  if (!raw || typeof raw !== 'object') return empty;
  return {
    index:       Number(raw.index)  || 0,
    text:        String(raw.text       || '').slice(0, 240),
    output:      String(raw.output     || '').slice(0, 160),
    hint:        String(raw.hint       || '').slice(0, 240),
    status:      ['pending', 'done', 'skipped'].includes(raw.status) ? raw.status : 'pending',
    stuckNote:   String(raw.stuckNote  || ''),
    userOutput:  String(raw.userOutput || '').slice(0, 600),
    completedAt: String(raw.completedAt || ''),
  };
}

function validateHistory(raw) {
  const base = createDefaultHistoryV2();
  if (!raw || typeof raw !== 'object') return base;
  return {
    entries:          Array.isArray(raw.entries)
                        ? raw.entries.map(validateHistoryEntry).filter(Boolean) : [],
    successStreak:    Math.max(0, Number(raw.successStreak)    || 0),
    currentDayStreak: Math.max(0, Number(raw.currentDayStreak) || 0),
    failurePatterns:  Array.isArray(raw.failurePatterns)
                        ? raw.failurePatterns.map(validateFailurePattern).filter(Boolean) : [],
    archivedTracks:   Array.isArray(raw.archivedTracks) ? raw.archivedTracks : [],
  };
}

function validateHistoryEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const outcome = raw.outcome;
  if (!['done', 'blocked', 'skipped', 'missed', 'rescued'].includes(outcome)) return null;
  const date = String(raw.date || '').slice(0, 10);
  if (!date) return null;
  const agentSteps = Array.isArray(raw.agentSteps)
    ? raw.agentSteps.slice(0, 5).map((s) => ({
        text:       String(s?.text       || '').slice(0, 240),
        output:     String(s?.output     || '').slice(0, 160),
        userOutput: String(s?.userOutput || '').slice(0, 600),
      }))
    : [];
  return {
    date,
    dayNumber:       Number(raw.dayNumber)    || 1,
    trackId:         String(raw.trackId       || ''),
    outcome,
    taskTitle:       String(raw.taskTitle     || ''),
    proofType:       ['text', 'link', 'statement', ''].includes(raw.proofType) ? raw.proofType : '',
    proofValue:      String(raw.proofValue    || '').slice(0, 800),
    agentSteps,
    agentUsed:       Boolean(raw.agentUsed),
    rescueOffered:   Boolean(raw.rescueOffered),
    rescueCompleted: Boolean(raw.rescueCompleted),
    createdAt:       String(raw.createdAt     || ''),
  };
}

function validateFailurePattern(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const date = String(raw.date || '').slice(0, 10);
  if (!date) return null;
  return {
    id:              String(raw.id           || `fp-${Date.now()}`),
    date,
    dayNumber:       Number(raw.dayNumber)   || 1,
    trackId:         String(raw.trackId      || ''),
    taskTitle:       String(raw.taskTitle    || ''),
    blockerText:     String(raw.blockerText  || ''),
    blockerCategory: BLOCKER_CATEGORIES.includes(raw.blockerCategory) ? raw.blockerCategory : 'other',
    rescueOffered:   Boolean(raw.rescueOffered),
    rescueCompleted: Boolean(raw.rescueCompleted),
  };
}

function validateTelegram(raw) {
  const base = createDefaultTelegramV2();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    connected:      Boolean(raw.connected),
    chatId:         String(raw.chatId         || ''),
    username:       String(raw.username       || ''),
    connectedAt:    String(raw.connectedAt    || ''),
    pingHour:       Math.max(0, Math.min(23, Number(raw.pingHour) || 9)),
    pingEnabled:    raw.pingEnabled !== false,
    lastPingSentAt: String(raw.lastPingSentAt || ''),
    lastPingStatus: ['sent', 'failed', 'skipped', ''].includes(raw.lastPingStatus)
                      ? raw.lastPingStatus : '',
  };
}

function parse(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}
