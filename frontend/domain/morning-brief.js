// Morning Brief: 2–3 short sentences greeting the user with context.
// Deterministic, template-based, no AI call — runs on every Today render.
// Voice: warm coach, never cheerleader. Concrete, specific, never generic.

export function buildMorningBrief({ user, track, today, history, streaks }) {
  const dayNum    = today?.dayNumber || track?.currentDayNumber || 1;
  const isFirst   = dayNum === 1;
  const isLast    = dayNum === 7;
  const name      = String(user?.name || '').trim();
  const greeting  = pickGreeting(name);
  const prevDay   = lastEntry(history, track);
  const delivered = streaks?.delivered || 0;
  const project   = String(user?.currentProject || '').trim();

  // Day 1 — onboarding-fresh
  if (isFirst) {
    const line2 = project
      ? `Today is about getting moving on ${truncate(project, 60)} — one concrete step, nothing more.`
      : `Today is the lowest-friction start possible. One concrete step, nothing more.`;
    return [greeting, line2].join(' ');
  }

  // Day 7 — final push
  if (isLast) {
    return [
      greeting,
      `This is Day 7 — the artifact day. Make it real, ship the proof, recap is next.`,
    ].join(' ');
  }

  // Returning after a miss/skip → handled by soft-return banner instead.
  if (prevDay?.outcome === 'missed' || prevDay?.outcome === 'skipped') {
    return [
      greeting,
      `Yesterday didn’t happen — and that’s fine. Today’s task is sized for someone returning, not catching up.`,
    ].join(' ');
  }

  // Streak compliment after a real run
  if (delivered >= 3) {
    return [
      greeting,
      `${delivered} days delivered in a row. Today builds on what you shipped yesterday — keep the chain honest.`,
    ].join(' ');
  }

  // Yesterday was done/rescued — momentum line
  if (prevDay?.outcome === 'done' || prevDay?.outcome === 'rescued') {
    const yTitle = truncate(prevDay.taskTitle || '', 50);
    return [
      greeting,
      yTitle
        ? `Yesterday you shipped “${yTitle}”. Today picks up from there.`
        : `Yesterday counted. Today picks up where you left off.`,
    ].join(' ');
  }

  // Generic mid-week
  return [
    greeting,
    `Day ${dayNum} of 7. One concrete action below — start the agent and you’ll be done in one sitting.`,
  ].join(' ');
}

// ── Helpers ───────────────────────────────────────────────────────────────

function pickGreeting(name) {
  const hour = new Date().getHours();
  const period =
    hour < 5  ? 'Working late' :
    hour < 12 ? 'Good morning' :
    hour < 18 ? 'Good afternoon' :
                'Good evening';
  const safeName = name && name.length <= 20 ? `, ${name}` : '';
  return `${period}${safeName}.`;
}

function lastEntry(history, track) {
  const entries = Array.isArray(history?.entries) ? history.entries : [];
  const inTrack = entries.filter((e) => !track?.id || e.trackId === track.id);
  if (!inTrack.length) return null;
  return inTrack.reduce((latest, e) => (!latest || e.date > latest.date ? e : latest), null);
}

function truncate(s, n) {
  s = String(s || '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
