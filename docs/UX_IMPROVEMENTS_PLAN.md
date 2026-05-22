# UX Improvements Plan — May 2026

Source: user feedback session on /today, /agent, /progress, /settings screenshots.
Branch: `claude/ux-improvements-roadmap-reset`

## Goals

1. Clean up mission card chips typography (no monospace caps).
2. Make Agent Mode purpose obvious on entry.
3. Add visual 7-day roadmap (SVG curve) to `/today` and `/progress`.
4. Add Reset Progress button in Settings (keep account, wipe track/today/history).
5. Deepen onboarding signal (current project, concrete 7-day goal, why it matters, what tried) without bloating UX.

---

## Step-by-step execution

### Step 1 — Mission card chips (today.js + style.css)
- Current: `<span class="mission-card__chip">30 MIN</span>` rendered as monospace uppercase capsules.
- Change: render as `30 min · write` in plain sans-serif, muted grey, no border. Single inline element joined by `·`.
- Files: `frontend/ui/pages/today.js`, `frontend/style.css`.
- Acceptance: visually matches body text style, lowercase, not monospace.

### Step 2 — Roadmap SVG component (new file)
- New: `frontend/ui/components/roadmap.js` exporting `renderRoadmap({ days, currentDay, variant })`.
- SVG: smooth cubic Bezier curve from left to right, 7 nodes equally distributed along the curve.
- Node states (colors via existing CSS vars):
  - `done` — solid filled accent
  - `missed` — red outline
  - `skipped` — grey outline dashed
  - `rescued` — amber
  - `today` — bold accent ring + pulse
  - `pending` — light grey
- `variant: "compact"` (no labels, ~80px tall) for `/today`.
- `variant: "full"` (labels under each node with day number + short title) for `/progress`.
- Pure function returning HTML string; no event handlers required initially.

### Step 3 — Wire roadmap into pages
- `frontend/ui/pages/today.js`: insert compact roadmap above the mission card.
- `frontend/ui/pages/progress.js`: insert full roadmap below the headline, above stats grid.
- Build day data from `sv2_track.days` + `sv2_history`.
- Add CSS for `.roadmap`, `.roadmap__node`, `.roadmap__label`.

### Step 4 — Reset Progress button (settings.js)
- New section "Danger zone" below Account.
- Button: "Reset progress" (red secondary style).
- On click: confirm modal "This will erase your current 7-day track and all progress. Your account stays. Continue?"
- On confirm: clear `sv2_track`, `sv2_today`, `sv2_history` from store + localStorage + Firestore (best-effort delete for `users/{uid}/kv/sv2_track|sv2_today|sv2_history`). Keep `sv2_user`.
- Redirect to `/onboarding`.
- Files: `frontend/ui/pages/settings.js`, `frontend/services/persistence.js` (add `clearProgressData()`).

### Step 5 — Agent Mode light UX upgrade (agent.js + style.css)
- Add sticky hint banner at top of agent page:
  > "Agent walks you through N short steps. Do each one in your own tools, then mark it done — that's how today's task gets finished."
- Stepper: keep the 1/2/3 circles, add short caption under each (verb tag from step content: `open` / `write` / `review` / `ship` derived from first verb of step title).
- Rename buttons:
  - "Complete Step →" → "Done, next step" (or "Finish today's task" on last step).
  - Add tooltip text on "I'm stuck": "Get a hint for this step".

### Step 6 — Deeper onboarding (onboarding.js + state-model.js + ai-v2.js)
- Extend `sv2_user` schema with optional fields:
  - `currentProject` (string, 1 sentence about what they're doing now)
  - `weekGoal` (string, concrete outcome by day 7)
  - `whyItMatters` (string, motivation; skippable)
  - `triedBefore` (string, what they've already tried; skippable)
- Onboarding step changes (do not add more screens than necessary):
  - Replace/augment the "goal" step with two compact inputs: "What you're working on" + "By day 7, you want to have…" with placeholder examples.
  - Add one more compact step "Why it matters" with skip link.
  - Add one optional step "What you've already tried" with skip link.
- Pass new fields into the `track_generate` payload in `frontend/services/ai-v2.js` so the LLM produces a track tailored to the user's actual project.
- Acceptance: a freshly onboarded user sees a track whose Day 1 title references their `currentProject` or `weekGoal` keywords (verified manually).

### Step 7 — Smoke + build
- `npm run build` — frontend bundle reflects all changes.
- `npm run smoke` — server starts, `/health` responds 200.
- Manual sanity check via reading rendered HTML output (no browser available in env).

### Step 8 — Commit & push & PR
- One commit per logical step where reasonable; squash if all touch the same areas tightly.
- Push branch `claude/ux-improvements-roadmap-reset`.
- Open PR with summary of all 6 user-facing changes and screenshots reference.

---

## Out of scope
- Animated transitions for agent steps.
- Full agent layout redesign (two-column).
- Reset that also deletes the Firebase Auth user.
- Email/Telegram notification changes.
