# StriveAI MVP v2 — Telegram Integration Specification

## Purpose

Telegram is the only accountability ping channel in MVP. It sends one message per day to the user's Telegram account, containing the day number, today's action title, and a link back to the app.

Email notifications are removed. No push notifications. Telegram only.

---

## Architecture Overview

```
User's Telegram app
      ↑  ↓
Telegram Bot API (HTTPS)
      ↑  ↓
Backend server (backend/server.js)
  - POST /api/telegram/connect   (receives chat_id from frontend after /start)
  - POST /api/notify/telegram    (sends ping message)
  - POST /api/telegram/disconnect
Vercel Cron / scheduled function
  → calls POST /api/notify/telegram for each connected user at their ping hour
```

---

## Bot Setup (one-time, by developer)

1. Create a bot via `@BotFather` on Telegram.
2. Get the bot token: `TELEGRAM_BOT_TOKEN` env var.
3. The bot does not need webhook mode for MVP. It uses polling or direct API calls only.

Environment variable:
```
TELEGRAM_BOT_TOKEN=<token from BotFather>
```

Bot username is shown to users during connection (e.g., `@StriveAIBot`).

---

## Connection Flow (User Side)

### Onboarding Step 3 (optional)

Shown after goal setup. Can be skipped.

UI:
```
Connect Telegram for daily pings

1. Open Telegram and search for @StriveAIBot
2. Send /start to the bot
3. Copy the 6-digit code the bot sends you
4. Paste it here:  [ _______ ]

[Connect]   [Skip for now]
```

### How the 6-digit code works

1. When the user taps `/start` in the Telegram bot, the bot:
   - Generates a 6-digit numeric code tied to their `chat_id`.
   - Sends the code as a message: `Your StriveAI connection code: 123456 (expires in 10 minutes)`
   - Stores `{ code, chatId, expiresAt }` in server memory (or Redis if available).
2. User pastes the code into the app.
3. Frontend calls `POST /api/telegram/connect` with `{ code, userId }`.
4. Server verifies the code, retrieves `chat_id`, saves to Firestore `users/{uid}/kv/sv2_telegram`.
5. Response: `{ ok: true, username }` (bot fetches username from Telegram API using chat_id).
6. Frontend updates `sv2_telegram.connected = true`, stores `chatId`, `username`, `connectedAt`.

### Code storage on server

In-memory Map (MVP — no Redis required):
```js
const telegramConnectCodes = new Map();
// key: code (string), value: { chatId, expiresAt }
```

Cleanup: codes older than 15 minutes are pruned on each new code generation.

### Settings page reconnect/disconnect

User can:
- View connection status: "Connected as @username"
- Disconnect: calls `POST /api/telegram/disconnect`, clears `sv2_telegram`.
- Reconnect: runs the same 3-step flow again.
- Change ping hour: dropdown 6am–11pm, calls `POST /api/telegram/ping-settings`.

---

## Bot Commands (minimal)

| Command | Bot response |
|---|---|
| `/start` | Sends a 6-digit connection code. |
| `/stop` | Bot sends: "Pings paused. Reconnect any time in StriveAI settings." Does not delete user data. |
| `/help` | Brief: "I send your daily StriveAI execution ping. Use /stop to pause." |

No other commands. The bot does not respond to free-form messages.

---

## Backend Routes

### `POST /api/telegram/connect`

Request body:
```json
{
  "code": "123456",
  "userId": "firebase-uid"
}
```

Flow:
1. Validate code format (6 digits, string).
2. Look up code in `telegramConnectCodes`. If not found or expired: `400 { error: 'invalid_code' }`.
3. Retrieve `chatId` from the code record.
4. Call Telegram `getChat` API to get `username`.
5. Save to Firestore `users/{userId}/kv/sv2_telegram`: `{ connected: true, chatId, username, connectedAt }`.
6. Delete code from map.
7. Send confirmation message to user's Telegram: "✅ StriveAI connected. You'll get your daily ping at your chosen time."
8. Return `{ ok: true, username }`.

Error responses:
- `400 { error: 'invalid_code' }` — code not found or expired
- `400 { error: 'code_expired' }` — code past 10-minute TTL
- `500 { error: 'telegram_api_error' }` — Telegram API unreachable

### `POST /api/telegram/disconnect`

Request body:
```json
{ "userId": "firebase-uid" }
```

Flow:
1. Clear `sv2_telegram` in Firestore for user.
2. Return `{ ok: true }`.
3. Do NOT call Telegram API (user can still talk to the bot; bot just won't ping them).

### `POST /api/telegram/ping-settings`

Request body:
```json
{
  "userId": "firebase-uid",
  "pingHour": 9,
  "pingEnabled": true
}
```

Validation: `pingHour` must be 6–22 (6am–10pm). `pingEnabled` boolean.

Updates `sv2_telegram.pingHour` and `pingEnabled` in Firestore.

### `POST /api/notify/telegram`

Called by the Vercel Cron function (not by the client).

Request body (per user batch or single):
```json
{
  "userId": "firebase-uid",
  "chatId": "telegram-chat-id",
  "dayNumber": 3,
  "taskTitle": "Write 3 cold DM scripts and send to 3 founders",
  "goal": "Validate my SaaS idea with 10 paying customers",
  "appUrl": "https://striveai.app"
}
```

Flow:
1. Validate required fields.
2. Check rate limit: 1 ping per `chatId` per calendar day (server-side Map, same pattern as email reminder).
3. If already sent today: return `{ ok: true, sent: false, reason: 'already_sent_today' }`.
4. Call Telegram `sendMessage` API.
5. Update `sv2_telegram.lastPingSentAt` and `lastPingStatus` in Firestore.
6. Return `{ ok: true, sent: true }`.

Error: if Telegram API fails, log error, set `lastPingStatus = 'failed'`, return `{ ok: false, reason: 'telegram_api_error' }`.

---

## Ping Message Format

```
StriveAI · Day {dayNumber}/7

Today: {taskTitle}

Your goal: {goal}

→ Open app: {appUrl}
```

Character limit: Telegram messages max 4096 chars. All fields trimmed to fit well within that.

Rules:
- No emojis in task title (keep exactly as generated).
- No markdown formatting (send as plain text to avoid rendering issues on all Telegram clients).
- Single blank line between sections.
- App URL is the main app URL, not a deep link (deep links are a later scope item).

Example:
```
StriveAI · Day 3/7

Today: Write 3 cold DM scripts and send to 3 founders

Your goal: Validate my SaaS idea with 10 paying customers

→ Open app: https://striveai.app
```

---

## Cron / Scheduling

### Vercel Cron (MVP approach)

Current `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/telegram-pings",
      "schedule": "0 9 * * *"
    }
  ]
}
```

This runs once per day at 09:00 UTC. The Vercel Hobby plan only allows
one cron job per project, so per-hour scheduling is not available without
upgrading. All connected users receive their daily ping at the same UTC
hour — per-user timezone is a known limitation (see below).

### `GET /api/cron/telegram-pings`

This route is called by Vercel Cron. It must be protected so only Vercel can call it.

Protection: check `Authorization: Bearer {CRON_SECRET}` header. `CRON_SECRET` is an env var.

Flow:
1. Determine current UTC hour.
2. Query Firestore for all users where `sv2_telegram.connected = true`, `sv2_telegram.pingEnabled = true`, and `sv2_telegram.pingHour == currentUTCHour`.

   **Note**: MVP does not handle user timezone. Ping hour is UTC. This is a known limitation. Timezone support is a later scope item.

3. For each matching user, fetch their `sv2_track` and `sv2_today` state.
4. If track is active and today has a pending action:
   - Call `POST /api/notify/telegram` internally (or inline the logic).
5. Log results.

### Firestore query index required

Composite index on `users` collection or subcollection:
- Field 1: `telegram.connected` (== true)
- Field 2: `telegram.pingEnabled` (== true)
- Field 3: `telegram.pingHour` (== currentHour)

At MVP scale this can also be a full collection scan with client-side filter if Firestore index setup is complex. Document the tradeoff.

---

## Telegram API Calls (server-side)

All calls use HTTPS to `https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/`.

### Send connection code to user (on /start)

This requires the bot to receive the `/start` command. At MVP, use long polling from the server:

```
GET https://api.telegram.org/bot{TOKEN}/getUpdates?timeout=30&offset={offset}
```

Run this in a background process or a separate lightweight cron (e.g., every 30 seconds).

On receiving `/start` from a `chat_id`:
1. Generate 6-digit code.
2. Store `{ code, chatId, expiresAt: now + 10min }` in `telegramConnectCodes`.
3. Call `sendMessage`:
```json
{
  "chat_id": "{chatId}",
  "text": "Your StriveAI connection code: {code}\n\nPaste it into the app. Valid for 10 minutes."
}
```

### Send daily ping

```
POST https://api.telegram.org/bot{TOKEN}/sendMessage
Content-Type: application/json

{
  "chat_id": "{chatId}",
  "text": "{ping message text}"
}
```

### Get username from chat_id (after connect)

```
GET https://api.telegram.org/bot{TOKEN}/getChat?chat_id={chatId}
```

Response includes `username` field (may be absent if user has no username set — use `first_name` as fallback).

---

## Environment Variables

```
TELEGRAM_BOT_TOKEN=       # Required for any Telegram feature to work
CRON_SECRET=              # Required to protect /api/cron/telegram-pings
```

If `TELEGRAM_BOT_TOKEN` is not set:
- All Telegram routes return `{ ok: false, reason: 'telegram_not_configured' }`.
- Onboarding Step 3 shows: "Telegram not configured on this server."
- No crash.

---

## Known Limitations (MVP)

| Limitation | Impact | Later fix |
|---|---|---|
| Ping hour is UTC, not user local time | User sets "9am" but gets ping at 9am UTC | Store user timezone offset and compute UTC hour |
| Long polling only (no webhook) | Slight delay receiving /start; polling process must be running | Set up Telegram webhook pointing to a server endpoint |
| No deep link in ping | User opens the app root, not today's specific action | Add `/day/{n}` route and encode it in ping URL |
| No delivery confirmation | Cannot know if ping was read | Telegram read receipts are not available via API |
| Firestore full scan for cron (if no index) | Slow at scale | Add composite Firestore index |
| Code TTL stored in memory | Codes lost on server restart | Move to Redis or Firestore with TTL |
