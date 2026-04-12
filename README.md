# striveAI

Minimal MVP stack:
- Frontend: plain HTML/CSS/JS in `frontend/`
- Backend: Node.js + Express in `backend/server.js`
- Auth/Data: Firebase Auth + Firestore (client-side)
- AI: Gemini proxy endpoint in backend

## Run locally
1. Install dependencies:
   - `npm install`
2. Set environment variables (see `.env.example`).
3. Start server:
   - `npm start`
4. Open:
   - `http://localhost:3000`

## Key endpoints
- `GET /health`
- `GET /api/config`
- `POST /api/gemini/generate`
