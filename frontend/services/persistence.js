import { migrateFromLegacy } from '../core/migrations.js';
import { STORAGE_KEYS, createDefaultHistory, createDefaultPlan, createDefaultToday, createDefaultUser, isoDateNow } from '../core/state-model.js';
import { normalizePlan } from '../domain/plan-engine.js';

export async function loadPersistedDomains({ userId, db }) {
  const local = readLocalDomains();
  let cloud = null;
  if (userId && db) {
    cloud = await readCloudDomains({ userId, db });
  }
  const source = cloud && Object.keys(cloud).length ? cloud : local;
  let domains = validateDomains(source);
  if (!hasCoreData(domains)) {
    const migration = migrateFromLegacy((key) => localStorage.getItem(key));
    if (migration) {
      domains = validateDomains(migration);
      await saveDomains(domains, { userId, db });
    }
  }
  return domains;
}

export async function saveDomains(domains, { userId, db }) {
  writeLocalDomains(domains);
  if (!userId || !db) return;
  await writeCloudDomains(domains, { userId, db });
}

export async function saveDomain(name, value, { userId, db }) {
  if (!Object.prototype.hasOwnProperty.call(STORAGE_KEYS, name)) return;
  const key = STORAGE_KEYS[name];
  localStorage.setItem(key, JSON.stringify(value));
  if (!userId || !db) return;
  const ref = db.collection('users').doc(userId).collection('kv').doc(key);
  await ref.set(
    {
      value: JSON.stringify(value),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

function readLocalDomains() {
  return {
    user: parse(localStorage.getItem(STORAGE_KEYS.user)),
    plan: parse(localStorage.getItem(STORAGE_KEYS.plan)),
    today: parse(localStorage.getItem(STORAGE_KEYS.today)),
    history: parse(localStorage.getItem(STORAGE_KEYS.history)),
  };
}

async function readCloudDomains({ userId, db }) {
  try {
    const snap = await db.collection('users').doc(userId).collection('kv').get();
    const result = {};
    snap.forEach((docSnap) => {
      const key = docSnap.id;
      const val = docSnap.data()?.value;
      if (!val || typeof val !== 'string') return;
      if (key === STORAGE_KEYS.user) result.user = parse(val);
      if (key === STORAGE_KEYS.plan) result.plan = parse(val);
      if (key === STORAGE_KEYS.today) result.today = parse(val);
      if (key === STORAGE_KEYS.history) result.history = parse(val);
    });
    return result;
  } catch (error) {
    console.warn('Cloud read failed, using local domains', error);
    return null;
  }
}

function writeLocalDomains(domains) {
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(domains.user));
  localStorage.setItem(STORAGE_KEYS.plan, JSON.stringify(domains.plan));
  localStorage.setItem(STORAGE_KEYS.today, JSON.stringify(domains.today));
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(domains.history));
}

async function writeCloudDomains(domains, { userId, db }) {
  try {
    const batch = db.batch();
    const kvRef = db.collection('users').doc(userId).collection('kv');
    batch.set(
      kvRef.doc(STORAGE_KEYS.user),
      {
        value: JSON.stringify(domains.user),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    batch.set(
      kvRef.doc(STORAGE_KEYS.plan),
      {
        value: JSON.stringify(domains.plan),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    batch.set(
      kvRef.doc(STORAGE_KEYS.today),
      {
        value: JSON.stringify(domains.today),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    batch.set(
      kvRef.doc(STORAGE_KEYS.history),
      {
        value: JSON.stringify(domains.history),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await batch.commit();
  } catch (error) {
    console.warn('Cloud write failed, local save preserved', error);
  }
}

function validateDomains(raw) {
  const user = validateUser(raw?.user);
  const plan = validatePlan(raw?.plan, user);
  const today = validateToday(raw?.today);
  const history = validateHistory(raw?.history);
  return { user, plan, today, history };
}

function validateUser(raw) {
  return {
    ...createDefaultUser(),
    ...(raw && typeof raw === 'object' ? raw : {}),
    id: String(raw?.id || ''),
    email: String(raw?.email || ''),
    name: String(raw?.name || ''),
    goal: String(raw?.goal || ''),
    deadline: String(raw?.deadline || ''),
    niche: String(raw?.niche || ''),         
    executionStyle: String(raw?.executionStyle || ''), 
  };
}

function validatePlan(raw, user) {
  if (!raw || typeof raw !== 'object') return createDefaultPlan();
  return normalizePlan(raw, {
    goal: String(raw.goal || user.goal || ''),
    deadline: String(raw.deadline || user.deadline || ''),
  });
}

function validateToday(raw) {
  const base = createDefaultToday();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    date: String(raw.date || isoDateNow()),
    primaryTaskId: String(raw.primaryTaskId || ''),
    primaryTaskText: String(raw.primaryTaskText || ''),
    reason: String(raw.reason || ''),
    stageProgressHint: String(raw.stageProgressHint || ''),
    status: normalizeTodayStatus(raw.status),
    attemptCount: Number(raw.attemptCount || 0),
    adjustmentLevel: Number(raw.adjustmentLevel || 0),
    skippedTaskIds: Array.isArray(raw.skippedTaskIds) ? raw.skippedTaskIds.map(String) : [],
    forceTaskId: String(raw.forceTaskId || ''),
    lastOutcomeAt: String(raw.lastOutcomeAt || ''),
  };
}

function validateHistory(raw) {
  const base = createDefaultHistory();
  if (!raw || typeof raw !== 'object') return base;
  const entries = Array.isArray(raw.entries) ? raw.entries : [];
  return {
    entries: entries
      .map((entry) => ({
        date: String(entry?.date || '').slice(0, 10),
        outcome: normalizeOutcome(entry?.outcome),
        taskId: String(entry?.taskId || ''),
        taskTitle: String(entry?.taskTitle || ''),
        stageId: String(entry?.stageId || ''),
        source: String(entry?.source || 'system'),
        createdAt: String(entry?.createdAt || ''),
      }))
      .filter((entry) => entry.date && entry.outcome),
    successStreak: Number(raw.successStreak || 0),
    missStreak: Number(raw.missStreak || 0),
  };
}

function hasCoreData(domains) {
  return Boolean(domains?.plan?.goal && domains?.plan?.stages?.length);
}

function normalizeOutcome(value) {
  const str = String(value || '').toLowerCase();
  if (str === 'done' || str === 'missed' || str === 'blocked') return str;
  return '';
}

function normalizeTodayStatus(value) {
  const str = String(value || '').toLowerCase();
  if (str === 'done' || str === 'missed' || str === 'blocked' || str === 'pending') return str;
  return 'pending';
}

function parse(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}
