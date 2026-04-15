require('dotenv').config();

const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const {
  createRequestTrace,
  logDebug,
  logError,
  logInfo,
  logWarn,
  normalizeError,
} = require('./utils/logger');

const app = express();
app.set('trust proxy', 1);
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
const GEMINI_MODEL = String(process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash';
const GEMINI_ALLOWED_RESPONSE_MIME_TYPES = new Set(['application/json', 'text/plain']);
const GEMINI_ALLOWED_CONFIG_KEYS = new Set(['maxOutputTokens', 'temperature', 'topP', 'responseMimeType']);
const AI_ACTIONS = new Set(['roadmap', 'tasks', 'task_audit', 'goals_review', 'note_process', 'chat']);
const ACTION_MAX_OUTPUT_TOKENS = {
  roadmap: 1400,
  tasks: 900,
  task_audit: 700,
  goals_review: 500,
  note_process: 700,
  chat: 900,
};
const ACTION_CONTEXT_LIMITS = {
  roadmap: { promptChars: 12000, systemChars: 2600, totalChars: 14000 },
  tasks: { promptChars: 7000, systemChars: 1800, totalChars: 8200 },
  task_audit: { promptChars: 5200, systemChars: 1700, totalChars: 6400 },
  goals_review: { promptChars: 4200, systemChars: 1500, totalChars: 5200 },
  note_process: { promptChars: 5200, systemChars: 1500, totalChars: 6200 },
  chat: { promptChars: 6000, systemChars: 1700, totalChars: 7200 },
};

function approxInputTokens(charCount) {
  return Math.max(1, Math.round(charCount / 4));
}

function trimText(value, maxChars) {
  const text = String(value || '');
  if (!maxChars || text.length <= maxChars) {
    return { text, trimmed: false };
  }
  if (maxChars < 80) {
    return { text: text.slice(0, maxChars), trimmed: true };
  }
  const headChars = Math.floor(maxChars * 0.72);
  const tailChars = Math.max(0, maxChars - headChars - 22);
  const trimmedText = `${text.slice(0, headChars)}\n...[trimmed]...\n${tailChars ? text.slice(-tailChars) : ''}`;
  return { text: trimmedText, trimmed: true };
}

function trimContextByAction(action, prompt, systemCtx) {
  const limits = ACTION_CONTEXT_LIMITS[action] || ACTION_CONTEXT_LIMITS.chat;
  const promptResult = trimText(prompt, limits.promptChars);
  const systemResult = trimText(systemCtx, limits.systemChars);
  let trimmedPrompt = promptResult.text;
  let trimmedSystem = systemResult.text;
  let trimmed = promptResult.trimmed || systemResult.trimmed;

  if (trimmedPrompt.length + trimmedSystem.length > limits.totalChars) {
    const allowedPromptChars = Math.max(200, limits.totalChars - Math.min(trimmedSystem.length, limits.systemChars));
    const reducedPrompt = trimText(trimmedPrompt, allowedPromptChars);
    trimmedPrompt = reducedPrompt.text;
    trimmed = true;
  }

  return {
    prompt: trimmedPrompt,
    systemCtx: trimmedSystem,
    trimmed,
  };
}

const TRANSIENT_RETRY_BACKOFF_MS = [900, 1800, 3600];
const roadmapInFlightByFingerprint = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyFailure({ timedOut, parseFailed, upstreamStatus, upstreamErrorCode, finishReason }) {
  const normalizedUpstreamError = String(upstreamErrorCode || '').toUpperCase();
  if (finishReason === 'MAX_TOKENS') {
    return { code: 'RESPONSE_TRUNCATED', httpStatus: 502 };
  }
  if (timedOut) {
    return { code: 'TIMEOUT', httpStatus: 504 };
  }
  if (parseFailed) {
    return { code: 'PARSE_FAIL', httpStatus: 502 };
  }
  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return { code: 'UPSTREAM_401_403', httpStatus: 502 };
  }
  if (upstreamStatus === 429) {
    return { code: 'UPSTREAM_429', httpStatus: 429 };
  }
  if (upstreamStatus === 503 || normalizedUpstreamError === 'UNAVAILABLE') {
    return { code: 'UPSTREAM_UNAVAILABLE', httpStatus: 503 };
  }
  if (upstreamStatus === 400 || normalizedUpstreamError === 'INVALID_ARGUMENT') {
    return { code: 'BAD_REQUEST', httpStatus: 400 };
  }
  if (upstreamStatus >= 500) {
    return { code: 'UPSTREAM_5XX', httpStatus: 502 };
  }
  return { code: 'UPSTREAM_400', httpStatus: 502 };
}

function isRetryableFailureCode(code) {
  return code === 'UPSTREAM_UNAVAILABLE';
}

function normalizeErrorPayload(action, failure) {
  const code = failure?.code || 'UPSTREAM_5XX';
  if (action === 'roadmap' && code === 'UPSTREAM_UNAVAILABLE') {
    return {
      error: 'Roadmap generation is temporarily unavailable. Please try again in a moment.',
      code: 'provider_unavailable',
      retryable: true,
    };
  }
  if (code === 'UPSTREAM_UNAVAILABLE') {
    return { error: 'AI provider is temporarily unavailable. Please try again shortly.', code: 'provider_unavailable', retryable: true };
  }
  if (code === 'TIMEOUT') {
    return { error: 'AI request timed out. Please try again.', code: 'timeout', retryable: true };
  }
  if (code === 'RESPONSE_TRUNCATED') {
    return {
      error: action === 'tasks'
        ? 'Task generation response was incomplete. Please retry.'
        : 'AI response was truncated. Please retry.',
      code: 'truncated_response',
      retryable: true,
    };
  }
  if (code === 'PARSE_FAIL') {
    return { error: 'AI returned an invalid response format. Please retry.', code: 'invalid_response', retryable: true };
  }
  if (code === 'BAD_REQUEST') {
    return { error: 'Invalid AI request payload.', code: 'bad_request', retryable: false };
  }
  if (code === 'UPSTREAM_401_403') {
    return { error: 'AI provider rejected the request.', code: 'provider_auth_error', retryable: false };
  }
  if (code === 'UPSTREAM_429') {
    return { error: 'AI provider is rate-limiting requests. Please retry shortly.', code: 'provider_rate_limited', retryable: true };
  }
  return { error: 'AI request failed.', code: 'invalid_response', retryable: code !== 'BAD_REQUEST' };
}

function createRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function hashText(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function buildRoadmapFingerprint({ ip, prompt, systemCtx, requestedMaxTokens, clientRequestId }) {
  if (clientRequestId) return `client:${clientRequestId}`;
  const raw = `${ip || 'unknown'}|${requestedMaxTokens}|${prompt || ''}|${systemCtx || ''}`;
  return `fp:${hashText(raw).slice(0, 20)}`;
}

function buildGeminiPayload({ fullPrompt, generationConfig }) {
  return {
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    generationConfig,
  };
}

function safePayloadForLogs(payload) {
  const text = String(payload?.contents?.[0]?.parts?.[0]?.text || '');
  const cfg = payload?.generationConfig && typeof payload.generationConfig === 'object'
    ? payload.generationConfig
    : {};
  return {
    contentsCount: Array.isArray(payload?.contents) ? payload.contents.length : 0,
    contentRoles: Array.isArray(payload?.contents) ? payload.contents.map((item) => String(item?.role || '')) : [],
    promptChars: text.length,
    promptPreview: text.slice(0, 200),
    generationConfig: {
      maxOutputTokens: Number.isFinite(cfg.maxOutputTokens) ? cfg.maxOutputTokens : null,
      temperature: Number.isFinite(cfg.temperature) ? cfg.temperature : null,
      topP: Number.isFinite(cfg.topP) ? cfg.topP : null,
      responseMimeType: typeof cfg.responseMimeType === 'string' ? cfg.responseMimeType : '',
      schemaProvided: Boolean(cfg.responseSchema || cfg.responseJsonSchema),
      keys: Object.keys(cfg || {}),
    },
  };
}

function sanitizeGenerationConfig({ opts, action, effectiveMaxTokens }) {
  const generationConfig = {
    maxOutputTokens: effectiveMaxTokens,
  };
  const warnings = [];

  if (typeof opts.temperature === 'number' && Number.isFinite(opts.temperature)) {
    generationConfig.temperature = Math.min(2, Math.max(0, opts.temperature));
  } else {
    generationConfig.temperature = action === 'roadmap' ? 0.2 : 0.7;
  }

  if (typeof opts.topP === 'number' && Number.isFinite(opts.topP)) {
    generationConfig.topP = Math.min(1, Math.max(0, opts.topP));
  }

  if (typeof opts.responseMimeType === 'string' && opts.responseMimeType.length <= 120) {
    if (GEMINI_ALLOWED_RESPONSE_MIME_TYPES.has(opts.responseMimeType)) {
      generationConfig.responseMimeType = opts.responseMimeType;
    } else {
      warnings.push(`unsupported responseMimeType dropped: ${opts.responseMimeType}`);
    }
  }

  if (opts.responseSchema || opts.responseJsonSchema) {
    warnings.push('response schema config dropped for stability');
  }

  return { generationConfig, warnings };
}

function validateGeminiRequestPayload({ model, fullPrompt, generationConfig, action }) {
  const errors = [];
  if (typeof model !== 'string' || !model.trim()) {
    errors.push('model is required');
  }
  if (typeof fullPrompt !== 'string' || !fullPrompt.trim()) {
    errors.push('prompt must be non-empty');
  }
  if (!generationConfig || typeof generationConfig !== 'object' || Array.isArray(generationConfig)) {
    errors.push('generationConfig must be an object');
    return { valid: false, errors };
  }
  const unknownKeys = Object.keys(generationConfig).filter((key) => !GEMINI_ALLOWED_CONFIG_KEYS.has(key));
  if (unknownKeys.length) {
    errors.push(`unsupported generationConfig keys: ${unknownKeys.join(',')}`);
  }
  if (!Number.isInteger(generationConfig.maxOutputTokens)) {
    errors.push('generationConfig.maxOutputTokens must be an integer');
  } else if (generationConfig.maxOutputTokens < 1 || generationConfig.maxOutputTokens > 8192) {
    errors.push('generationConfig.maxOutputTokens out of range');
  } else if (action === 'roadmap' && (generationConfig.maxOutputTokens < 900 || generationConfig.maxOutputTokens > 1400)) {
    errors.push('roadmap maxOutputTokens must be 900-1400');
  } else if (action === 'tasks' && (generationConfig.maxOutputTokens < 600 || generationConfig.maxOutputTokens > 900)) {
    errors.push('tasks maxOutputTokens must be 600-900');
  }
  if (generationConfig.temperature !== undefined && (!Number.isFinite(generationConfig.temperature) || generationConfig.temperature < 0 || generationConfig.temperature > 2)) {
    errors.push('generationConfig.temperature must be 0-2');
  }
  if (generationConfig.topP !== undefined && (!Number.isFinite(generationConfig.topP) || generationConfig.topP < 0 || generationConfig.topP > 1)) {
    errors.push('generationConfig.topP must be 0-1');
  }
  if (generationConfig.responseMimeType !== undefined && !GEMINI_ALLOWED_RESPONSE_MIME_TYPES.has(generationConfig.responseMimeType)) {
    errors.push('generationConfig.responseMimeType is invalid');
  }
  return { valid: errors.length === 0, errors };
}

function guessLikelyInvalidField(errorMessage) {
  const msg = String(errorMessage || '').toLowerCase();
  if (!msg) return '';
  if (msg.includes('contents')) return 'contents';
  if (msg.includes('parts')) return 'contents.parts';
  if (msg.includes('role')) return 'contents.role';
  if (msg.includes('maxoutputtokens')) return 'generationConfig.maxOutputTokens';
  if (msg.includes('temperature')) return 'generationConfig.temperature';
  if (msg.includes('topp')) return 'generationConfig.topP';
  if (msg.includes('responsemimetype')) return 'generationConfig.responseMimeType';
  if (msg.includes('responseschema') || msg.includes('responsejsonschema')) return 'generationConfig.responseSchema';
  if (msg.includes('model')) return 'model';
  return '';
}

async function callGemini({ model, fullPrompt, generationConfig }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const payload = buildGeminiPayload({ fullPrompt, generationConfig });
  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }
    );

    const rawBody = await upstream.text();
    let data = {};
    let parseFailed = false;
    if (rawBody) {
      try {
        data = JSON.parse(rawBody);
      } catch (_error) {
        parseFailed = true;
      }
    }

    const candidate = data?.candidates?.[0];
    const text = (candidate?.content?.parts || []).map((part) => part.text || '').join('');
    const finishReason = candidate?.finishReason || '';
    const upstreamErrorCode = data?.error?.status || data?.error?.code || '';
    const upstreamErrorMessage = data?.error?.message || '';
    const upstreamErrorDetails = data?.error?.details || null;
    const success = upstream.ok && !data?.error && !parseFailed;

    return {
      success,
      parseFailed,
      timedOut: false,
      upstreamStatus: upstream.status,
      upstreamErrorCode: upstreamErrorCode ? String(upstreamErrorCode) : '',
      upstreamErrorMessage: upstreamErrorMessage ? String(upstreamErrorMessage) : '',
      upstreamErrorDetails,
      finishReason,
      text: text || '',
      payloadForLogs: safePayloadForLogs(payload),
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return {
        success: false,
        parseFailed: false,
        timedOut: true,
        upstreamStatus: 0,
        upstreamErrorCode: '',
        upstreamErrorMessage: '',
        upstreamErrorDetails: null,
        finishReason: '',
        text: '',
        payloadForLogs: safePayloadForLogs(payload),
      };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function logGeminiRequest(fields) {
  const payload = {
    area: 'gemini',
    module: 'backend/server.js',
    function: 'api/gemini/generate',
    ...fields,
  };
  if (fields?.logType === 'attempt' || fields?.logType === 'attempt_start') {
    if (fields?.logType === 'attempt_start') {
      logDebug(payload);
      return;
    }
    const isFailure = Boolean(fields.upstreamErrorCode || fields.finishReason === 'MAX_TOKENS');
    if (isFailure) {
      logWarn(payload);
      return;
    }
    logDebug(payload);
    return;
  }
  if (fields?.logType === 'final_failure' || fields?.logType === 'internal_error') {
    logError(payload);
    return;
  }
  if (fields?.logType === 'validation') {
    logWarn(payload);
    return;
  }
  if (fields?.logType === 'success') {
    logInfo(payload);
    return;
  }
  logInfo(payload);
}

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
  const startedAt = Date.now();
  const requestId = createRequestId();
  const sessionId = String(req.get('x-session-id') || req.get('x-strive-session-id') || '').slice(0, 120);
  const baseLog = {
    logType: 'request',
    requestId,
    sessionId,
    userId: '',
    model: GEMINI_MODEL,
    route: req.originalUrl || '/api/gemini/generate',
    clientRequestId: '',
    action: 'chat',
    promptChars: 0,
    systemChars: 0,
    totalChars: 0,
    promptPreview: '',
    approxInputTokens: 0,
    requestedMaxTokens: 0,
    effectiveMaxTokens: 0,
    trimmed: false,
    upstreamStatus: null,
    upstreamErrorCode: '',
    latencyMs: 0,
    finishReason: '',
    attempt: 0,
    chainAttempt: 0,
    retryAttempt: 0,
  };
  const reject = (httpStatus, payload, marker = 'VALIDATION') => {
    baseLog.logType = 'validation';
    baseLog.upstreamStatus = marker;
    baseLog.upstreamErrorCode = marker;
    baseLog.latencyMs = Date.now() - startedAt;
    logGeminiRequest(baseLog);
    const safePayload = { ...payload };
    safePayload.requestId = requestId;
    if (!safePayload.code && httpStatus === 400) {
      safePayload.code = 'bad_request';
    }
    return res.status(httpStatus).json(safePayload);
  };
  let roadmapFingerprint = '';
  try {
    const { prompt, systemCtx = '', maxTokens = 1000, opts = {}, action = 'chat' } = req.body || {};
    const safeAction = typeof action === 'string' ? action.trim().toLowerCase() : '';
    baseLog.action = safeAction || 'chat';
    baseLog.logType = 'request_received';
    const clientRequestId = String(opts?.clientRequestId || '').trim().slice(0, 120);
    const userId = String(opts?.userId || req.get('x-user-id') || '').trim().slice(0, 120);
    Object.assign(
      baseLog,
      createRequestTrace({
        requestId,
        sessionId,
        userId,
        route: req.originalUrl || '/api/gemini/generate',
        clientRequestId,
      })
    );
    logGeminiRequest(baseLog);

    if (typeof prompt !== 'string' || !prompt.trim()) {
      return reject(400, { error: 'Invalid request body: "prompt" must be a non-empty string.' });
    }
    if (typeof systemCtx !== 'string') {
      return reject(400, { error: 'Invalid request body: "systemCtx" must be a string.' });
    }
    if (typeof maxTokens !== 'number' || !Number.isFinite(maxTokens)) {
      return reject(400, { error: 'Invalid request body: "maxTokens" must be a number.' });
    }
    if (typeof opts !== 'object' || opts === null || Array.isArray(opts)) {
      return reject(400, { error: 'Invalid request body: "opts" must be an object.' });
    }
    if (!AI_ACTIONS.has(safeAction)) {
      return reject(400, { error: 'Invalid request body: unsupported "action".' });
    }

    if (!GEMINI_API_KEY) {
      return reject(503, { error: 'AI service is not configured.' }, 'CONFIG');
    }

    const requestedMaxTokens = Math.min(8192, Math.max(1, Math.floor(maxTokens)));
    const normalizedRequestedMaxTokens = safeAction === 'roadmap'
      ? Math.min(1400, Math.max(900, requestedMaxTokens))
      : safeAction === 'tasks'
        ? Math.min(900, Math.max(600, requestedMaxTokens))
        : requestedMaxTokens;
    const actionCap = ACTION_MAX_OUTPUT_TOKENS[safeAction] || ACTION_MAX_OUTPUT_TOKENS.chat;
    const effectiveMaxTokens = Math.min(normalizedRequestedMaxTokens, actionCap);
    const trimmedCtx = trimContextByAction(safeAction, prompt, systemCtx);
    const promptChars = trimmedCtx.prompt.length;
    const systemChars = trimmedCtx.systemCtx.length;
    const totalChars = promptChars + systemChars;

    baseLog.promptChars = promptChars;
    baseLog.systemChars = systemChars;
    baseLog.totalChars = totalChars;
    baseLog.promptPreview = trimmedCtx.prompt.slice(0, 200);
    baseLog.approxInputTokens = approxInputTokens(totalChars);
    baseLog.requestedMaxTokens = requestedMaxTokens;
    baseLog.effectiveMaxTokens = effectiveMaxTokens;
    baseLog.trimmed = trimmedCtx.trimmed;
    baseLog.logType = 'prompt_prepared';
    logGeminiRequest(baseLog);

    if (safeAction === 'roadmap') {
      roadmapFingerprint = buildRoadmapFingerprint({
        ip: req.ip,
        prompt: trimmedCtx.prompt,
        systemCtx: trimmedCtx.systemCtx,
        requestedMaxTokens,
        clientRequestId,
      });
      const alreadyInFlight = roadmapInFlightByFingerprint.get(roadmapFingerprint);
      if (alreadyInFlight) {
        baseLog.upstreamStatus = 'DUPLICATE_BLOCKED';
        baseLog.upstreamErrorCode = 'DUPLICATE_BLOCKED';
        baseLog.latencyMs = Date.now() - startedAt;
        logGeminiRequest(baseLog);
        return res.status(409).json({
          error: 'Roadmap generation is already running. Please wait for the current request to finish.',
          code: 'duplicate_request_blocked',
          retryable: true,
          requestId,
          blockedByRequestId: alreadyInFlight,
        });
      }
      roadmapInFlightByFingerprint.set(roadmapFingerprint, requestId);
    }

    if (!trimmedCtx.prompt.trim()) {
      return reject(400, { error: 'Prompt became empty after trimming.' });
    }

    const { generationConfig, warnings: configWarnings } = sanitizeGenerationConfig({
      opts,
      action: safeAction,
      effectiveMaxTokens,
    });
    if (configWarnings.length) {
      logGeminiRequest({
        ...baseLog,
        logType: 'validation',
        upstreamStatus: 'CONFIG_SANITIZED',
        upstreamErrorCode: 'CONFIG_SANITIZED',
        validationWarnings: configWarnings,
        latencyMs: Date.now() - startedAt,
      });
    }

    const attempts = [
      {
        maxTokens: effectiveMaxTokens,
        prompt: trimmedCtx.prompt,
        systemCtx: trimmedCtx.systemCtx,
      },
    ];
    const retryBackoffMs = TRANSIENT_RETRY_BACKOFF_MS;

    let lastFailure = null;
    let providerAttempt = 0;
    let lastChainAttempt = 0;
    let lastAttemptMaxTokens = effectiveMaxTokens;
    let lastRetryAttempt = 0;
    for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
      const attempt = attempts[attemptIndex];
      lastChainAttempt = attemptIndex + 1;
      lastAttemptMaxTokens = attempt.maxTokens;
      generationConfig.maxOutputTokens = attempt.maxTokens;
      baseLog.effectiveMaxTokens = attempt.maxTokens;
      const fullPrompt = attempt.systemCtx ? `${attempt.systemCtx}\n\n---\n\n${attempt.prompt}` : attempt.prompt;
      for (let retryIndex = 0; retryIndex <= retryBackoffMs.length; retryIndex += 1) {
        providerAttempt += 1;
        logGeminiRequest({
          ...baseLog,
          logType: 'attempt_start',
          attempt: providerAttempt,
          chainAttempt: attemptIndex + 1,
          retryAttempt: retryIndex,
          upstreamStatus: 'REQUEST_STARTED',
          upstreamErrorCode: '',
          finishReason: '',
          latencyMs: 0,
        });
        const attemptStartedAt = Date.now();
        const validation = validateGeminiRequestPayload({
          model: GEMINI_MODEL,
          fullPrompt,
          generationConfig,
          action: safeAction,
        });
        if (!validation.valid) {
          const failedAt = Date.now();
          logGeminiRequest({
            ...baseLog,
            logType: 'validation',
            upstreamStatus: 'VALIDATION_ERROR',
            upstreamErrorCode: 'VALIDATION_ERROR',
            error: 'Gemini request validation failed before API call.',
            validationErrors: validation.errors,
            promptPreview: fullPrompt.slice(0, 200),
            generationConfig,
            model: GEMINI_MODEL,
            attempt: providerAttempt,
            chainAttempt: attemptIndex + 1,
            retryAttempt: retryIndex,
            latencyMs: failedAt - attemptStartedAt,
          });
          lastFailure = {
            success: false,
            parseFailed: false,
            timedOut: false,
            upstreamStatus: 400,
            upstreamErrorCode: 'INVALID_ARGUMENT',
            upstreamErrorMessage: validation.errors.join('; '),
            upstreamErrorDetails: null,
            finishReason: '',
            text: '',
            code: 'BAD_REQUEST',
            httpStatus: 400,
          };
          break;
        }
        const result = await callGemini({ model: GEMINI_MODEL, fullPrompt, generationConfig });
        if (result.success && String(result.text || '').trim()) {
          baseLog.logType = 'success';
          baseLog.upstreamStatus = result.upstreamStatus;
          baseLog.upstreamErrorCode = result.upstreamErrorCode;
          baseLog.finishReason = result.finishReason;
          baseLog.latencyMs = Date.now() - startedAt;
          baseLog.attempt = providerAttempt;
          baseLog.chainAttempt = attemptIndex + 1;
          baseLog.retryAttempt = retryIndex;
          lastRetryAttempt = retryIndex;
          logGeminiRequest(baseLog);
          return res.json({
            text: result.text || '',
            finishReason: result.finishReason || '',
            requestId,
          });
        }

        const failure = classifyFailure(result);
        lastFailure = { ...result, ...failure };
        lastRetryAttempt = retryIndex;
        const likelyInvalidField =
          failure.code === 'BAD_REQUEST'
            ? guessLikelyInvalidField(result.upstreamErrorMessage)
            : '';
        logGeminiRequest({
          ...baseLog,
          logType: 'attempt',
          upstreamStatus: result.timedOut ? 'TIMEOUT' : result.upstreamStatus,
          upstreamErrorCode: result.upstreamErrorCode || failure.code,
          upstreamErrorMessage: result.upstreamErrorMessage || '',
          upstreamErrorDetails: result.upstreamErrorDetails || null,
          model: GEMINI_MODEL,
          invalidFieldHint: likelyInvalidField,
          requestPayload: failure.code === 'BAD_REQUEST' ? result.payloadForLogs : undefined,
          finishReason: result.finishReason || '',
          latencyMs: Date.now() - attemptStartedAt,
          attempt: providerAttempt,
          chainAttempt: attemptIndex + 1,
          retryAttempt: retryIndex,
          effectiveMaxTokens: attempt.maxTokens,
        });

        if (
          safeAction === 'tasks' &&
          failure.code === 'RESPONSE_TRUNCATED' &&
          attemptIndex === 0
        ) {
          break;
        }
        if (
          safeAction === 'roadmap' &&
          failure.code === 'RESPONSE_TRUNCATED' &&
          attemptIndex === 0
        ) {
          break;
        }
        if (!isRetryableFailureCode(failure.code) || retryIndex >= retryBackoffMs.length) {
          break;
        }
        await sleep(retryBackoffMs[retryIndex]);
      }

      if (lastFailure?.code === 'UPSTREAM_401_403' || lastFailure?.code === 'BAD_REQUEST') {
        break;
      }
      const firstChainWithFallback = attemptIndex === 0 && (safeAction === 'roadmap' || safeAction === 'tasks');
      if (
        firstChainWithFallback &&
        lastFailure &&
        lastFailure.code !== 'RESPONSE_TRUNCATED' &&
        lastFailure.code !== 'PARSE_FAIL'
      ) {
        break;
      }
    }

    const safeFailure = lastFailure || { code: 'UPSTREAM_5XX', httpStatus: 502, upstreamStatus: 0 };
    baseLog.logType = 'final_failure';
    baseLog.upstreamStatus = safeFailure.timedOut ? 'TIMEOUT' : safeFailure.upstreamStatus;
    baseLog.upstreamErrorCode = safeFailure.upstreamErrorCode || safeFailure.code;
    baseLog.upstreamErrorMessage = safeFailure.upstreamErrorMessage || '';
    baseLog.upstreamErrorDetails = safeFailure.upstreamErrorDetails || null;
    baseLog.invalidFieldHint = safeFailure.code === 'BAD_REQUEST'
      ? guessLikelyInvalidField(safeFailure.upstreamErrorMessage)
      : '';
    baseLog.requestPayload = safeFailure.code === 'BAD_REQUEST' ? safeFailure.payloadForLogs : undefined;
    baseLog.finishReason = safeFailure.finishReason || '';
    baseLog.latencyMs = Date.now() - startedAt;
    baseLog.attempt = providerAttempt;
    baseLog.chainAttempt = lastChainAttempt;
    baseLog.retryAttempt = lastRetryAttempt;
    baseLog.effectiveMaxTokens = lastAttemptMaxTokens;
    logGeminiRequest(baseLog);

    const payload = normalizeErrorPayload(safeAction, safeFailure);
    return res.status(safeFailure.httpStatus).json({
      error: payload.error,
      code: payload.code,
      retryable: payload.retryable,
      requestId,
    });
  } catch (error) {
    baseLog.logType = 'internal_error';
    baseLog.upstreamStatus = 'INTERNAL';
    baseLog.upstreamErrorCode = 'INTERNAL';
    baseLog.latencyMs = Date.now() - startedAt;
    const normalized = normalizeError(error);
    baseLog.errorCategory = normalized.category;
    baseLog.errorCode = normalized.code;
    baseLog.errorMessage = normalized.message;
    logGeminiRequest(baseLog);
    logError({
      area: 'backend',
      module: 'backend/server.js',
      function: 'api/gemini/generate',
      action: 'unexpected_exception',
      requestId,
      sessionId,
      userId: baseLog.userId,
      errorCategory: normalized.category,
      errorCode: normalized.code,
      errorMessage: normalized.message,
      stack: normalized.stack,
    });
    return res.status(500).json({ error: 'Internal server error', code: 'invalid_response', retryable: false, requestId });
  } finally {
    if (roadmapFingerprint) {
      const activeRequestId = roadmapInFlightByFingerprint.get(roadmapFingerprint);
      if (activeRequestId === requestId) {
        roadmapInFlightByFingerprint.delete(roadmapFingerprint);
        logDebug({
          area: 'api',
          module: 'backend/server.js',
          function: 'api/gemini/generate',
          action: 'duplicate_guard_released',
          requestId,
          sessionId,
          userId: baseLog.userId,
          route: baseLog.route,
        });
      }
    }
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
  const normalized = normalizeError(err);
  logError({
    area: 'backend',
    module: 'backend/server.js',
    function: 'express_error_handler',
    action: 'unexpected_exception',
    errorCategory: normalized.category,
    errorCode: normalized.code,
    errorMessage: normalized.message,
    stack: normalized.stack,
  });
  return res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  logInfo({
    area: 'backend',
    module: 'backend/server.js',
    function: 'app.listen',
    action: 'server_started',
    port: PORT,
    route: '/',
  });
});

