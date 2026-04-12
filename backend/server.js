require('dotenv').config();

const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const frontendDir = path.join(__dirname, '..', 'frontend');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || 'YOUR_PAYPAL_CLIENT_ID_HERE';
const PLAN_PRO = process.env.PAYPAL_PLAN_PRO || 'YOUR_PAYPAL_PLAN_ID_PRO_HERE';
const PLAN_TEAM = process.env.PAYPAL_PLAN_TEAM || 'YOUR_PAYPAL_PLAN_ID_TEAM_HERE';
const PAYPAL_SDK_URL = process.env.PAYPAL_SDK_URL || 'https://www.paypal.com/sdk/js';
const FIREBASE_WEB_CONFIG = {
  apiKey: process.env.FIREBASE_API_KEY || '',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.FIREBASE_APP_ID || '',
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || '',
};
const FIREBASE_REQUIRED_FIELDS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
const FIREBASE_CONFIGURED = FIREBASE_REQUIRED_FIELDS.every((field) => Boolean(FIREBASE_WEB_CONFIG[field]));

const geminiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

app.use(express.json({ limit: '100kb' }));
app.use(express.static(frontendDir));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/config', (_req, res) => {
  res.json({
    geminiConfigured: Boolean(GEMINI_API_KEY),
    paypalClientId: PAYPAL_CLIENT_ID,
    planPro: PLAN_PRO,
    planTeam: PLAN_TEAM,
    paypalSdkUrl: PAYPAL_SDK_URL,
    firebaseConfigured: FIREBASE_CONFIGURED,
    firebaseConfig: FIREBASE_CONFIGURED ? FIREBASE_WEB_CONFIG : null,
  });
});

app.post('/api/gemini/generate', geminiLimiter, async (req, res) => {
  try {
    const { prompt, systemCtx = '', maxTokens = 1000, opts = {} } = req.body || {};

    if (typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Invalid request body: "prompt" must be a non-empty string.' });
    }
    if (prompt.length > 20000) {
      return res.status(413).json({ error: 'Prompt is too large.' });
    }
    if (typeof systemCtx !== 'string') {
      return res.status(400).json({ error: 'Invalid request body: "systemCtx" must be a string.' });
    }
    if (systemCtx.length > 20000) {
      return res.status(413).json({ error: 'System context is too large.' });
    }
    if (typeof maxTokens !== 'number' || !Number.isFinite(maxTokens)) {
      return res.status(400).json({ error: 'Invalid request body: "maxTokens" must be a number.' });
    }
    if (typeof opts !== 'object' || opts === null || Array.isArray(opts)) {
      return res.status(400).json({ error: 'Invalid request body: "opts" must be an object.' });
    }

    if (!GEMINI_API_KEY) {
      return res.status(503).json({ error: 'AI service is not configured.' });
    }

    const safeMaxTokens = Math.min(8192, Math.max(1, Math.floor(maxTokens)));
    const safeTemperature =
      typeof opts.temperature === 'number' && Number.isFinite(opts.temperature)
        ? Math.min(2, Math.max(0, opts.temperature))
        : 0.7;

    const generationConfig = {
      maxOutputTokens: safeMaxTokens,
      temperature: safeTemperature,
    };

    if (typeof opts.responseMimeType === 'string' && opts.responseMimeType.length <= 120) {
      generationConfig.responseMimeType = opts.responseMimeType;
    }
    if (opts.responseSchema && typeof opts.responseSchema === 'object' && !Array.isArray(opts.responseSchema)) {
      generationConfig.responseSchema = opts.responseSchema;
    }
    if (
      opts.responseJsonSchema &&
      typeof opts.responseJsonSchema === 'object' &&
      !Array.isArray(opts.responseJsonSchema)
    ) {
      generationConfig.responseJsonSchema = opts.responseJsonSchema;
    }

    const fullPrompt = systemCtx ? `${systemCtx}\n\n---\n\n${prompt}` : prompt;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    let upstream;
    try {
      upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
            generationConfig,
          }),
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok || data.error) {
      return res.status(502).json({ error: 'AI upstream error.' });
    }

    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts || []).map((part) => part.text || '').join('');
    return res.json({
      text: text || '',
      finishReason: candidate?.finishReason || '',
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large' });
  }
  if (err instanceof SyntaxError && Object.prototype.hasOwnProperty.call(err, 'body')) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`StriveAI server running at http://localhost:${PORT}`);
});
