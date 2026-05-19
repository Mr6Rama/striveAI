# Frontend Canonical Directory

## Decision

**`frontend/`** is the one and only frontend source directory.

There is no `public/` directory. Do not create one.

## How it works

```
frontend/          ← source of truth for all HTML, CSS, JS modules
backend/server.js  ← Express serves frontend/ as static files
                     (express.static + SPA fallback to index.html)
```

`backend/server.js` line 20:
```js
const frontendDir = path.join(__dirname, '..', 'frontend');
```

Both local dev (`npm run dev`) and Vercel production serve this same directory through the
same Express process. There are no duplicate copies.

## Vercel deployment

`vercel.json` routes all traffic to `backend/server.js` via `@vercel/node`.
The build config includes `frontend/**` so the static assets are bundled with the function.

```
Request → Vercel edge → backend/server.js (serverless) → express.static(frontend/)
                                                        → /api/* routes
```

`module.exports = app` at the bottom of `server.js` is required for `@vercel/node` to
use Express as the request handler. The `app.listen()` call below it is ignored in
serverless context and works normally for local dev.

## Firebase Hosting — unsupported for this MVP

`firebase.json` exists and points `"public": "frontend"`, which is consistent.
However, **Firebase Hosting is not used or supported for StriveAI MVP v2**.

Reasons:
- Vercel is the deployment target (see CLAUDE.md and `vercel.json`).
- Firebase Hosting cannot proxy to the Express backend without Firebase Functions,
  which are not in scope for this MVP.
- Serving static files via Firebase Hosting while the API lives on a separate host
  introduces CORS complexity and split deployments.

`firebase.json` is kept only as a record. Do not deploy to Firebase Hosting until
backend Cloud Functions are added. If Firebase Hosting is added in the future,
update this document.
