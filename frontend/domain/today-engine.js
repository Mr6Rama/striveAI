// v2 Daily Execution Engine — pure functions, no I/O, no AI calls.
// All state transformations return new state; side-effects (saves, AI calls)
// stay in app.js.

import { createDefaultTodayV2, isoDateNow } from '../core/state-model.js';

// ── Rollover ───────────────────────────────────────────────────────────────
//
// Call once on sign-in (and only on sign-in) with the current ISO date.
// Returns { state, didRollover, missedDayNumbers } where didRollover signals
// whether a Firestore save is actually needed.

export function rolloverIfNeeded(state, nowIso) {
  const now = nowIso || isoDateNow();
  const { track, today, history } = state;

  if (!track?.id || !Array.isArray(track.days) || !track.days.length) {
    return { state, didRollover: false, missedDayNumbers: [] };
  }
  if (track.status === 'complete' || track.status === 'abandoned') {
    return { state, didRollover: false, missedDayNumbers: [] };
  }

  // Find all past-due days still pending
  const overdue = track.days.filter((d) => d.date && d.date < now && d.status === 'pending');

  // Find what today's day plan should be
  const todayDayPlan = track.days.find((d) => d.date === now);

  // Nothing to do: no overdue days and today record is already current
  if (!overdue.length && today?.date === now) {
    return { state, didRollover: false, missedDayNumbers: [] };
  }

  const next         = deepClone(state);
  const missedNums   = [];
  const existingKeys = new Set(
    (next.history.entries || []).map((e) => `${e.trackId}:${e.dayNumber}`)
  );

  // Mark each overdue pending day as missed
  for (const day of overdue) {
    const dayRef = next.track.days.find((d) => d.dayNumber === day.dayNumber);
    if (dayRef) dayRef.status = 'missed';

    const key = `${track.id}:${day.dayNumber}`;
    if (!existingKeys.has(key)) {
      next.history.entries = [{
        date:            day.date,
        dayNumber:       day.dayNumber,
        trackId:         track.id,
        outcome:         'missed',
        taskTitle:       day.title || '',
        proofType:       '',
        agentUsed:       false,
        rescueOffered:   false,
        rescueCompleted: false,
        createdAt:       `${day.date}T23:59:00Z`,
      }, ...next.history.entries].slice(0, 200);
      existingKeys.add(key);
      missedNums.push(day.dayNumber);
    }
  }

  if (missedNums.length) {
    next.history.successStreak    = 0;
    next.history.currentDayStreak = 0;
  }

  // Advance currentDayNumber to today's plan (if it exists in the track)
  if (todayDayPlan) {
    next.track.currentDayNumber = todayDayPlan.dayNumber;

    // Create fresh today if the persisted today is for a different date
    if (next.today?.date !== now) {
      next.today = createDefaultTodayV2(now, todayDayPlan.dayNumber);
      // Pull adaptation note from the day plan if it was pre-adapted
      if (todayDayPlan.adaptNote) {
        next.today.adaptationNote = todayDayPlan.adaptNote;
      }
    }
  } else {
    // today's date is beyond the track's last day — check if track is done
    const lastDay = next.track.days[next.track.days.length - 1];
    if (lastDay && now > lastDay.date) {
      const allResolved = next.track.days.every((d) => d.status !== 'pending');
      if (allResolved) next.track.status = 'complete';
    }
  }

  return { state: next, didRollover: true, missedDayNumbers: missedNums };
}

// ── Pattern Analysis ───────────────────────────────────────────────────────
//
// Returns a rich analysis object used by:
//   - deriveInsight() (Today UI chip)
//   - shouldTriggerAdaptation() (decide whether to call AI)
//   - app.js (pass to AI prompts for context)

export function analyzePatterns(history) {
  const patterns = Array.isArray(history?.failurePatterns) ? history.failurePatterns : [];
  const entries  = Array.isArray(history?.entries)         ? history.entries         : [];

  // ── Blocker category counts ──
  const categoryCounts = {};
  for (const p of patterns) {
    const cat = p.blockerCategory || 'other';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }
  const sortedCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
  const [dominantCategory, dominantCount] = sortedCategories[0] || ['other', 0];

  // ── Rescue success rate ──
  const offeredCount   = patterns.filter((p) => p.rescueOffered).length;
  const completedCount = patterns.filter((p) => p.rescueCompleted).length;
  const rescueSuccessRate = offeredCount > 0 ? Math.round((completedCount / offeredCount) * 100) : null;

  // ── Consecutive misses (most recent N entries) ──
  let consecutiveMisses = 0;
  for (const e of entries) {
    if (e.outcome === 'missed') {
      consecutiveMisses++;
    } else {
      break;
    }
  }

  // ── Repeated blocker (same category ≥ 2) ──
  const repeatedCategories = sortedCategories.filter(([, n]) => n >= 2).map(([cat]) => cat);

  // ── Best working duration: estimateMinutes for completed days ──
  // We can only estimate this from history entries; the dayPlan is not in history,
  // so we leave this as a signal flag rather than exact minutes.
  const hasCompletedWork = entries.some((e) => e.outcome === 'done' || e.outcome === 'rescued');

  // ── Proof quality: what types do they submit? ──
  const proofTypeCounts = {};
  for (const e of entries) {
    if (e.proofType) {
      proofTypeCounts[e.proofType] = (proofTypeCounts[e.proofType] || 0) + 1;
    }
  }

  // ── Task avoidance: skipped/blocked outcomes per unique taskTitle ──
  const avoidedTitles = new Set(
    patterns.filter((p) => ['motivation', 'other'].includes(p.blockerCategory)).map((p) => p.taskTitle)
  );

  // ── Total pattern count (for "enough data" guard) ──
  const totalPatternCount = patterns.length;

  return {
    dominantCategory,
    dominantCount,
    categoryCounts,
    sortedCategories,
    repeatedCategories,
    consecutiveMisses,
    rescueSuccessRate,
    hasCompletedWork,
    proofTypeCounts,
    avoidedTitles,
    totalPatternCount,
  };
}

// ── Insight Text ───────────────────────────────────────────────────────────
//
// Returns a single short insight string for the Today UI chip, or null.
// Rules:
//   - Show only with ≥ 2 failure patterns (enough data).
//   - Prefer today.adaptationNote if set (it's AI-specific and more accurate).
//   - No psychological diagnosis. No creepy claims.
//   - "Pattern found" framing only.

export function deriveInsight(history, adaptationNote) {
  // AI-set note takes priority
  if (adaptationNote && String(adaptationNote).trim()) {
    return String(adaptationNote).trim();
  }

  const analysis = analyzePatterns(history);

  // Need at least 2 data points before claiming a pattern
  if (analysis.totalPatternCount < 2) return null;

  // 3+ consecutive misses is the most urgent signal
  if (analysis.consecutiveMisses >= 3) {
    return 'Pattern found: several days in a row missed. Today starts with the smallest possible step.';
  }

  const { dominantCategory, dominantCount } = analysis;

  if (dominantCount < 2) return null;

  const CATEGORY_INSIGHTS = {
    unclear:    'Pattern: unclear starting points slow things down. Today opens with a concrete first action.',
    time:       'Pattern: time pressure has come up before. Today\'s task is scoped to fit.',
    motivation: 'Pattern: low-energy days happen. Today starts with the lightest possible entry point.',
    skill_gap:  'Pattern: skill gaps have blocked progress before. Today\'s task is more accessible.',
    no_access:  'Pattern: access issues have blocked work before. Today avoids that dependency.',
    external:   'Pattern: external blockers have come up. Today\'s task depends only on you.',
    other:      null,
  };

  return CATEGORY_INSIGHTS[dominantCategory] || null;
}

// ── Adaptation Trigger ─────────────────────────────────────────────────────
//
// Returns { should: bool, trigger: string }.
// app.js checks nextDayPlan.adaptedAt before calling AI to prevent duplicates.

export function shouldTriggerAdaptation(outcome, analysis, nextDayPlan) {
  // No next day plan provided (Day 7 or end of track)
  if (!nextDayPlan) return { should: false, trigger: '' };

  // Already adapted for this day — do not call AI again
  if (nextDayPlan.adaptedAt) return { should: false, trigger: 'already_adapted' };

  // Direct outcome triggers
  if (outcome === 'missed')  return { should: true, trigger: 'missed' };
  if (outcome === 'skipped') return { should: true, trigger: 'skipped' };
  if (outcome === 'blocked') return { should: true, trigger: 'blocked' };
  if (outcome === 'rescued') return { should: true, trigger: 'rescued' };

  // Repeated blocker pattern — even on success, adapt to prevent next occurrence
  if (analysis.repeatedCategories.length > 0) {
    return { should: true, trigger: `repeated_${analysis.dominantCategory}` };
  }

  // 3+ consecutive misses (already mid-track)
  if (analysis.consecutiveMisses >= 3) {
    return { should: true, trigger: 'consecutive_misses' };
  }

  return { should: false, trigger: '' };
}

// ── Apply Adaptation Result ────────────────────────────────────────────────
//
// Writes AI adaptation result back to track.days[nextDayNum] and stamps
// adaptedAt to prevent double-calling.
// Returns new state — does NOT save to Firestore (app.js does that).

export function applyAdaptResult(state, nextDayNum, adaptResult) {
  if (!adaptResult || !nextDayNum) return state;

  const next = deepClone(state);
  const day  = next.track.days.find((d) => d.dayNumber === nextDayNum);
  if (!day) return state;

  if (adaptResult.changed && adaptResult.title) {
    day.title = String(adaptResult.title).slice(0, 80);
    if (adaptResult.why) day.why = String(adaptResult.why).slice(0, 120);
  }

  day.adaptedAt = new Date().toISOString();
  day.adaptNote  = adaptResult.changed && adaptResult.why
    ? `Adjustment: ${String(adaptResult.why).slice(0, 120)}`
    : '';

  return next;
}

// ── Pattern Summary (for AI prompt context) ───────────────────────────────
//
// Returns a compact string summarising pattern data to pass to AI prompts.
// Mirrors what ai-v2.js does internally but is available to app.js for
// building richer context when triggering adaptations.

export function buildPatternContext(history) {
  const analysis = analyzePatterns(history);
  if (!analysis.totalPatternCount) return 'none';

  const parts = [];

  if (analysis.dominantCount >= 2) {
    parts.push(`${analysis.dominantCategory} blocker (×${analysis.dominantCount})`);
  }
  if (analysis.consecutiveMisses >= 2) {
    parts.push(`${analysis.consecutiveMisses} consecutive missed days`);
  }
  if (analysis.rescueSuccessRate !== null) {
    parts.push(`rescue success rate: ${analysis.rescueSuccessRate}%`);
  }

  return parts.join('; ') || 'none';
}

// ── Track completion check ─────────────────────────────────────────────────

export function isTrackComplete(track) {
  if (!track?.days?.length) return false;
  return track.days.every((d) =>
    ['done', 'rescued', 'missed', 'skipped', 'blocked'].includes(d.status)
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
