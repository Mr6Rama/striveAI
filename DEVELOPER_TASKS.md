# Strive Developer Tasks

## Purpose

Improve the product functionality so Strive feels useful every day, not just visually polished.

This file is the main task brief for the next developer.

## Project Areas

- Frontend app: `frontend/index.html`, `frontend/script.js`, `frontend/style.css`
- Backend/API: `backend/`
- Auth/database config: Firebase files and `.env`
- Payments: Billing/PayPal flow in frontend and backend config

## Priority 1 - Core User Flow

### Task 1: Stabilize onboarding and roadmap generation

Build:
- Validate required onboarding fields before allowing roadmap generation.
- Show a clear loading state while AI is generating.
- Save the exact onboarding context used for generation.
- Add retry when AI generation fails.
- Let the user edit context and regenerate without restarting onboarding.

Acceptance criteria:
- New user can complete onboarding and receive a roadmap or a clear recoverable error.
- Failed generation never leaves the app in an empty/broken state.
- Regeneration uses the previous context by default.

### Task 2: Make roadmap milestones always actionable

Build:
- Each milestone must have 3-7 concrete tasks.
- Each task must include title, reason, estimate, difficulty, due date, and success criteria.
- Add actions: regenerate task, make task easier, mark task irrelevant.
- Prevent empty task preview blocks.

Acceptance criteria:
- Opening any milestone shows useful next actions.
- No placeholder/empty task content appears in milestone detail panels.

### Task 3: Fix the daily execution loop

Build:
- Today tab always shows one primary next task.
- Task states: not started, in progress, blocked, done.
- Starting a session locks selected tasks for that session.
- Completing a task updates roadmap progress immediately.
- Blocking a task asks for a reason and suggests a smaller next step.

Acceptance criteria:
- User can start a session, complete or block tasks, and see progress update without leaving Today.

## Priority 2 - AI Usefulness

### Task 4: Make AI chat context-aware

Build:
- Chat should know current goal, roadmap, active milestone, today task, recent blockers, and plan status.
- Add quick prompts: "What should I do next?", "Make this easier", "Rewrite as checklist", "Explain why this matters".
- Allow AI output to create or update a task after user confirmation.

Acceptance criteria:
- AI chat can answer based on the user's real current roadmap and task state.
- No AI-generated task change is applied without user confirmation.

### Task 5: Add adaptive check-ins

Build:
- Daily check-in asks what shipped, what blocked progress, and what changed.
- AI adapts upcoming tasks based on check-in answers.
- Show a short explanation: "Roadmap changed because..."
- Keep check-in history readable.

Acceptance criteria:
- User can see what changed in the roadmap and why.

## Priority 3 - Data, Auth, Reliability

### Task 6: Make database sync reliable

Build:
- Define one source of truth for user, roadmap, tasks, sessions, billing, and notes.
- Sync after every meaningful action.
- Add migration/default handling for old local data.
- Prevent duplicate task IDs and broken references.

Acceptance criteria:
- Refreshing the page does not lose roadmap, tasks, progress, billing status, or notes.

### Task 7: Improve error handling

Build:
- Replace silent failures with readable user messages.
- Add specific messages for missing OpenAI key, Firebase failure, auth failure, payment failure, and AI timeout.
- Add a small admin/debug error log.

Acceptance criteria:
- User understands what went wrong and what action to take next.

## Priority 4 - Billing And Admin

### Task 8: Improve Billing conversion

Build:
- Keep the `FREE` plan chip opening Billing in one click.
- Add upgrade prompts after value moments: roadmap generated, task completed, AI limit hit.
- Show clear plan differences.
- Add usage counters for free limits.

Acceptance criteria:
- Billing is reachable in one click.
- User sees why Pro matters before hitting a hard limit.

### Task 9: Build admin dashboard basics

Build:
- Admin role can view users, plan status, roadmap count, last active date.
- Add search by email/name/project.
- Show metrics: signups, active users, generated roadmaps, completed sessions.

Acceptance criteria:
- Admin can understand product usage without opening Firebase manually.

## Priority 5 - Quality Of Life

### Task 10: Add editing and recovery

Build:
- Edit milestone title, task title, due date, and success criteria.
- Add undo for completed/blocked task state.
- Archive instead of hard delete.

Acceptance criteria:
- User mistakes are recoverable.

### Task 11: Add export

Build:
- Export roadmap as Markdown.
- Export Today tasks as checklist.
- Copy milestone summary to clipboard.

Acceptance criteria:
- User can move Strive output into another tool in one click.

## Recommended Build Order

1. Onboarding and roadmap generation reliability.
2. Milestone task quality.
3. Today/session execution loop.
4. Database sync and error handling.
5. AI chat context and adaptive check-ins.
6. Billing conversion and limits.
7. Admin dashboard.
8. Editing, undo, archive, export.

## Definition Of Done

- Core flow works after page refresh.
- No empty roadmap/task panels.
- User always has a clear next action.
- AI failures are recoverable.
- Billing is visible and reachable.
- Admin can inspect basic usage.
- No secrets are committed.
