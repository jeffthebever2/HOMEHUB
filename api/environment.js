import { getRequestContext } from '../lib/server/auth.js';
import { applyCacheProfile } from '../lib/server/cache/headers.js';
import { loadConfig } from '../lib/server/config/loadConfig.js';
import { getEnvironmentPayload } from '../lib/server/domains/environment/service.js';
import { sendError } from '../lib/server/http.js';

export default async function handler(req, res) {
  try {
    const context = await getRequestContext(req, { requireAuth: false });
    const { config } = await loadConfig(context);
    const payload = await getEnvironmentPayload(config, { mockScenario: req.headers['x-homehub-mock'] });
    applyCacheProfile(res, 'environment', {
      privateResponse: Boolean(context.user) || Boolean(req.headers['x-homehub-mock']),
      vary: ['Authorization', 'X-HomeHub-Mock'],
    });
    return res.status(200).json(payload);
  } catch (error) {
    return sendError(res, error);
  }
}
