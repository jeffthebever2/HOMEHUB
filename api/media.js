import { getRequestContext } from '../lib/server/auth.js';
import { applyCacheProfile } from '../lib/server/cache/headers.js';
import { loadConfig } from '../lib/server/config/loadConfig.js';
import { getMediaPayload, mutateMedia } from '../lib/server/domains/media/service.js';
import { parseJsonBody, sendError } from '../lib/server/http.js';

export default async function handler(req, res) {
  try {
    const context = await getRequestContext(req, { requireAuth: true });
    const { config } = await loadConfig(context);
    if (req.method === 'POST') {
      req.body = await parseJsonBody(req);
      const result = await mutateMedia(req);
      applyCacheProfile(res, 'media');
      return res.status(200).json(result);
    }
    const payload = getMediaPayload(config, req);
    applyCacheProfile(res, 'media');
    return res.status(200).json(payload);
  } catch (error) {
    return sendError(res, error);
  }
}
