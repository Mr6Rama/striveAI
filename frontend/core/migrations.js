// v2 does not migrate v1 STEM data. This stub exists so stale imports don't crash.
// v2 persistence reads from sv2_* keys directly and starts fresh when empty.
export function migrateFromLegacy(_localRead) {
  return null;
}
