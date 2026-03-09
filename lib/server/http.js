function normalizeWarnings(warnings = []) {
  return (Array.isArray(warnings) ? warnings : [])
    .map((warning) => String(warning || '').trim())
    .filter(Boolean);
}

export function createMeta({
  schemaVersion = 1,
  fetchedAt = new Date().toISOString(),
  stale = false,
  degraded = false,
  isMock = false,
  warnings = [],
} = {}) {
  return {
    schemaVersion,
    fetchedAt,
    stale: Boolean(stale),
    degraded: Boolean(degraded),
    isMock: Boolean(isMock),
    warnings: normalizeWarnings(warnings),
  };
}

async function readRawBody(req) {
  if (!req || typeof req.on !== 'function') return '';
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString('utf8'));
    } catch {
      return {};
    }
  }

  const rawBody = await readRawBody(req);
  if (!rawBody) return {};

  try {
    return JSON.parse(rawBody);
  } catch {
    return {};
  }
}

function buildErrorObject(error, fallbackStatus = 500) {
  const nextStatusCode = Number(error?.statusCode || error?.status || fallbackStatus || 500);
  return {
    statusCode: Number.isFinite(nextStatusCode) ? nextStatusCode : 500,
    error: {
      message: error?.message || 'Unexpected error',
      code: error?.code || null,
      statusCode: Number.isFinite(nextStatusCode) ? nextStatusCode : 500,
      details: error?.details || null,
    },
  };
}

export function sendError(res, error, fallbackStatus = 500, payload = {}) {
  const { statusCode, error: errorBody } = buildErrorObject(error, fallbackStatus);
  const meta = createMeta({
    ...payload.meta,
    degraded: true,
    warnings: [errorBody.message, ...(payload.meta?.warnings || [])],
  });

  return res.status(statusCode).json({
    ...payload,
    meta,
    error: errorBody,
    message: errorBody.message,
  });
}
