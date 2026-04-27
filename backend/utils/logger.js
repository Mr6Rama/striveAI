const LEVEL_PRIORITY = Object.freeze({
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
});

const DEFAULT_LEVEL = process.env.NODE_ENV === 'production' ? 'info' : 'debug';
const ENV_LEVEL = String(process.env.STRIVE_LOG_LEVEL || process.env.LOG_LEVEL || DEFAULT_LEVEL).toLowerCase();
const ACTIVE_LEVEL = Object.prototype.hasOwnProperty.call(LEVEL_PRIORITY, ENV_LEVEL) ? ENV_LEVEL : DEFAULT_LEVEL;

function shouldLog(level) {
  const incoming = LEVEL_PRIORITY[level] || LEVEL_PRIORITY.info;
  return incoming >= LEVEL_PRIORITY[ACTIVE_LEVEL];
}

function omitUndefined(input) {
  const out = {};
  Object.keys(input || {}).forEach((key) => {
    const value = input[key];
    if (value === undefined) return;
    out[key] = value;
  });
  return out;
}

function emit(level, payload) {
  if (!shouldLog(level)) return;
  const record = omitUndefined({
    timestamp: new Date().toISOString(),
    level,
    ...payload,
  });
  const area = record.area || 'app';
  const action = record.action || 'event';
  const requestId = record.requestId || '-';
  const prefix = `[${area}] ${action} requestId=${requestId}`;
  if (level === 'error') {
    console.error(prefix, record);
    return;
  }
  if (level === 'warn') {
    console.warn(prefix, record);
    return;
  }
  if (level === 'debug') {
    console.debug(prefix, record);
    return;
  }
  console.info(prefix, record);
}

function logDebug(payload) {
  emit('debug', payload);
}

function logInfo(payload) {
  emit('info', payload);
}

function logWarn(payload) {
  emit('warn', payload);
}

function logError(payload) {
  emit('error', payload);
}

function normalizeError(error, fallbackCategory = 'unexpected_exception') {
  const rawCode = String(error?.code || '').toLowerCase();
  let category = fallbackCategory;
  if (rawCode.includes('timeout')) category = 'timeout';
  else if (rawCode.includes('unavailable')) category = 'provider_unavailable';
  else if (rawCode.includes('truncated')) category = 'truncated_response';
  else if (rawCode.includes('parse')) category = 'parse_failure';
  else if (rawCode.includes('json')) category = 'invalid_json';
  else if (rawCode.includes('unauthorized') || rawCode.includes('401')) category = 'unauthorized';
  return {
    category,
    code: String(error?.code || ''),
    message: String(error?.message || 'Unknown error'),
    stack: typeof error?.stack === 'string' ? error.stack : '',
  };
}

async function withTiming(meta, fn) {
  const startedAt = Date.now();
  logDebug({ ...meta, action: `${meta.action || 'operation'}_started` });
  try {
    const result = await fn();
    logInfo({
      ...meta,
      action: `${meta.action || 'operation'}_succeeded`,
      durationMs: Date.now() - startedAt,
      status: 'ok',
    });
    return result;
  } catch (error) {
    const normalized = normalizeError(error);
    logError({
      ...meta,
      action: `${meta.action || 'operation'}_failed`,
      durationMs: Date.now() - startedAt,
      status: 'failed',
      errorCategory: normalized.category,
      errorCode: normalized.code,
      errorMessage: normalized.message,
    });
    throw error;
  }
}

function createRequestTrace(fields = {}) {
  return omitUndefined({
    requestId: fields.requestId || '',
    sessionId: fields.sessionId || '',
    userId: fields.userId || '',
    route: fields.route || '',
    clientRequestId: fields.clientRequestId || '',
  });
}

module.exports = {
  ACTIVE_LEVEL,
  createRequestTrace,
  logDebug,
  logError,
  logInfo,
  logWarn,
  normalizeError,
  withTiming,
};

