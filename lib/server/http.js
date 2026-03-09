export async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

export function sendError(res, error, fallbackStatus = 500) {
  const statusCode = error.statusCode || fallbackStatus;
  return res.status(statusCode).json({
    error: error.message || 'Unexpected error',
  });
}
