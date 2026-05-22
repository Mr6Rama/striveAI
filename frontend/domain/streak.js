// Honest streak: two numbers — returned (showed up) vs delivered (done/rescued).
// Pure function; counts current consecutive streak ending today, scoped to the
// active track.

export function computeStreaks(history, trackId, todayIso) {
  const entries = Array.isArray(history?.entries) ? history.entries : [];
  const inTrack = entries
    .filter((e) => !trackId || e.trackId === trackId)
    .filter((e) => e.date && e.date <= todayIso)
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first

  let returned  = 0;
  let delivered = 0;

  // Walk back day-by-day from today; break on any gap.
  let cursor = todayIso;
  for (const entry of inTrack) {
    if (entry.date !== cursor) {
      const expected = prevIsoDay(cursor);
      if (entry.date !== expected) break;
      cursor = expected;
    }
    returned += 1;
    if (entry.outcome === 'done' || entry.outcome === 'rescued') delivered += 1;
    cursor = prevIsoDay(cursor);
  }

  return { returned, delivered };
}

export function consecutiveMissedDays(history, trackId, todayIso) {
  const entries = Array.isArray(history?.entries) ? history.entries : [];
  const inTrack = entries
    .filter((e) => !trackId || e.trackId === trackId)
    .filter((e) => e.date && e.date < todayIso)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  let n = 0;
  for (const e of inTrack) {
    if (e.outcome === 'missed' || e.outcome === 'skipped') n += 1;
    else break;
  }
  return n;
}

function prevIsoDay(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
