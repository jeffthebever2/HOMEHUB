import { getRequestContext, requireAdmin } from '../lib/server/auth.js';
import { applyCacheProfile } from '../lib/server/cache/headers.js';
import { loadConfig } from '../lib/server/config/loadConfig.js';
import { buildAdminDiagnostics, runAdminAction } from '../lib/server/domains/admin/diagnostics.js';
import { createMeta, parseJsonBody, sendError } from '../lib/server/http.js';

function adminReadErrorPayload() {
  return {
    meta: createMeta({
      degraded: true,
      warnings: ['Admin payload is unavailable.'],
    }),
    system: {},
    recentActions: [],
    availableActions: [],
    mockSupport: [],
  };
}

function adminMutationErrorPayload() {
  return {
    meta: createMeta({
      degraded: true,
      warnings: ['Admin action failed.'],
    }),
    success: false,
    message: 'Admin action failed.',
  };
}

export default async function handler(req, res) {
  try {
    const context = await getRequestContext(req, { requireAuth: true });
    requireAdmin(context, req);
    const { config } = await loadConfig(context);
    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const result = await runAdminAction(body.action);
      applyCacheProfile(res, 'admin');
      return res.status(200).json(result);
    }
    const payload = await buildAdminDiagnostics(config, context, req);
    applyCacheProfile(res, 'admin');
    return res.status(200).json(payload);
  } catch (error) {
    return sendError(res, error, 500, req.method === 'POST' ? adminMutationErrorPayload() : adminReadErrorPayload());
  }
}
