import { getRequestContext } from '../lib/server/auth.js';
import { applyCacheProfile } from '../lib/server/cache/headers.js';
import { loadConfig } from '../lib/server/config/loadConfig.js';
import { buildStandbyPayload } from '../lib/server/domains/standby/build.js';
import { sendError } from '../lib/server/http.js';

export default async function handler(req, res) {
  try {
    const context = await getRequestContext(req, { requireAuth: true });
    const { config } = await loadConfig(context);
    const payload = await buildStandbyPayload(config, context, req);
    applyCacheProfile(res, 'standby');
    return res.status(200).json(payload);
  } catch (error) {
    return sendError(res, error);
  }
}
