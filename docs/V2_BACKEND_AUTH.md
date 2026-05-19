# V2 Backend Auth — Firebase Admin Setup

## Overview

Authenticated v2 API routes (Telegram linking, ping scheduling) use Firebase Admin SDK
to verify Firebase ID tokens supplied by the client.  The server reads the token from the
`Authorization: Bearer <id_token>` header and verifies it server-side so the backend never
trusts a raw `uid` value from the request body.

## Environment variable

Set `FIREBASE_SERVICE_ACCOUNT_JSON` to the **full JSON content** of a Firebase service
account key (the file you download from Firebase Console → Project Settings → Service
accounts → Generate new private key).

```
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"..."}
```

The value must be a single line.  Literal `\n` sequences inside `private_key` are
automatically restored to real newlines before parsing, so values copied from most secret
managers (Vercel, Railway, Render) work without modification.

**Do not commit this value.  It lives in `.env` (gitignored) or in your hosting
provider's secrets panel.**

## What happens when the variable is missing

- The server boots normally.
- `getFirebaseAdmin()` returns `null` and logs a startup warning.
- Any route protected with `requireFirebaseUser` returns `503` with:
  ```json
  { "error": "Firebase Admin is not configured on this server", "detail": "..." }
  ```
- All other routes (`/health`, `/api/config`, `/api/openai/generate`) are unaffected.

## Helper API

Three helpers are exported for use in route handlers inside `backend/server.js`:

| Symbol | Type | Purpose |
|---|---|---|
| `getFirebaseAdmin()` | function → `app \| null` | Returns the initialised `firebase-admin` app, or `null` if credentials are missing. |
| `verifyFirebaseIdToken(req)` | async function → `DecodedIdToken` | Reads the `Authorization` header, verifies the token, returns the decoded payload. Throws with `.status 401` if the token is missing/invalid, or `.status 503` if Admin is not configured. |
| `requireFirebaseUser` | Express middleware | Calls `verifyFirebaseIdToken` and sets `req.firebaseUser`.  Responds with `401` or `503` on failure. |

## Using the middleware

```js
app.post('/api/v2/telegram/link', requireFirebaseUser, async (req, res) => {
  const uid = req.firebaseUser.uid;   // verified server-side
  // ... write to Firestore using uid
});
```

## Local development

Add to your `.env`:

```
FIREBASE_SERVICE_ACCOUNT_JSON=<paste full JSON on one line>
```

To test without real credentials, omit the variable.  Routes that need it will return
`503`.  Routes that do not need it (AI proxy, health check) will work normally.

## Security notes

- Never log or print the service account JSON or any token value.
- The `private_key` field is sensitive; treat it like a password.
- Token verification rejects expired tokens automatically (Firebase default TTL is 1 hour).
- The server never forwards the ID token to any third-party service.
