import { getRequestContext } from '../lib/server/auth.js';
import { applyCacheProfile } from '../lib/server/cache/headers.js';
import { loadConfig } from '../lib/server/config/loadConfig.js';
import { getHouseholdPayload, mutateHousehold } from '../lib/server/domains/household/service.js';
import { parseJsonBody, sendError } from '../lib/server/http.js';

export default async function handler(req, res) {
  try {
    const context = await getRequestContext(req, { requireAuth: true });
    const { config } = await loadConfig(context);
    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const result = await mutateHousehold(config, context, body);
      applyCacheProfile(res, 'household');
      return res.status(200).json(result);
    }
    const payload = await getHouseholdPayload(config, context);
    applyCacheProfile(res, 'household');
    return res.status(200).json(payload);
  } catch (error) {
    return sendError(res, error);
  }
}
