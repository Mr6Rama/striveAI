# Outstanding Phase 1 — May 2026

Goal: make the product feel alive — a coach you want to open, not a todo
app you check off. Pragmatic, no over-engineering. Branch:
`claude/outstanding-phase1`. Designed to be revertable in one PR.

## Shipped in this PR

### Feel-alive mechanics
1. **Morning Brief on /today** — 2–3 sentence contextual greeting at the
   top of the active state. Knows day number, yesterday's outcome,
   `currentProject`, delivered streak. Pure deterministic, no AI call.
   `frontend/domain/morning-brief.js`.
2. **Honest streak chip in the nav** — two numbers: days delivered
   (done/rescued) and days returned (showed up at all). No fake fire
   emojis. `frontend/domain/streak.js`.
3. **Soft Return banner** — if user missed 2+ days in a row, the brief
   is replaced with a welcome-back banner: "You don't need to catch up,
   today is sized for a real return." Removes guilt as a barrier.

### Audit bug fixes
4. **Settings → Telegram Connect** now actually calls `onTelegramLink`
   (was navigating to /today, dead button).
5. **Plan-preview** hides "Connect Telegram" CTA when Telegram is
   already connected.
6. **/confirm-track route removed** — duplicate of /plan-preview, as
   flagged in CLAUDE.md and the UX audit. Router/dispatcher/freeRoutes
   cleaned up, page module deleted.
7. **Auth error mapping** — `authErrorMessage` now maps every common
   Firebase code (`email-already-in-use`, `weak-password`,
   `network-request-failed`, `user-disabled`, …) to a human sentence.
   No more "Firebase: Error (auth/invalid-credential)" in the UI.
8. **Auth autocomplete** — switches between `current-password` and
   `new-password` depending on signin/signup mode so password managers
   offer to save new accounts.
9. **Recap auto-loads reflection** on first visit per track instead of
   gating the flagship moment behind a button. Dead `exportCopied` var
   removed.
10. **Onboarding `currentStep` persisted** in localStorage so refresh
    keeps the user where they were.
11. **Roadmap node tooltips** — each circle now has a `<title>` with
    day number, title, and status.
12. **Today: "I already did it" demoted** from a primary row button to
    a quiet underline link below the action buttons. Reduces visual
    competition with the primary Agent CTA.
13. **"I'm blocked" → "I'm stuck"** (landing preview), matching the
    softer voice used elsewhere.
14. **Landing "live preview" → "product preview"** — the mock isn't
    live, the old label set false expectations.

### What's intentionally NOT in this PR
- Day artifact / share images (needs canvas, separate effort)
- Agent Mode focus-session timer (bigger refactor)
- Plan-preview as narrative story (needs new AI prompt)
- Day 7 documentary scroll-experience (big design lift)
- Motion language / signature interaction (separate effort)
- Global navigation revamp beyond what's already in the shell nav
- Mobile media-queries pass

Those map to "Phase 2/3" in the strategy doc and should ship as
separate PRs so this one can be reverted cleanly.

## Verification
- `npm run build` → bundle 200.4kb, no errors.
- `npm run smoke` → /health 200.
- Manual checks left to the reviewer:
  - /today on Day 1 with no history → see morning brief.
  - /today after missing 2 days → see Soft Return banner instead.
  - Nav chip after completing a day → "1 done · 1 returned".
  - Settings → Connect Telegram opens link, then auto-refreshes status.
  - Auth: try wrong password → see "Wrong email or password."
  - Onboarding: refresh mid-flow → land on the same step.
  - Roadmap: hover a node → tooltip with day title.
