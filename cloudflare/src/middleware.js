// ============================================================
// cloudflare/src/middleware.js — CORS + upload auth
// ============================================================

/** Add CORS headers to any response */
export function cors(response, request, env) {
  let origin = env?.ALLOWED_ORIGIN || '*';
  
  if (request) {
    const incomingOrigin = request.headers?.get?.('Origin');
    if (incomingOrigin) {
      const allowed = env?.ALLOWED_ORIGIN || '';
      const isLocalhost = incomingOrigin.startsWith('http://localhost:') || incomingOrigin.startsWith('http://127.0.0.1:');
      const isLocalIP = incomingOrigin.match(/^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/);
      const isVercel = incomingOrigin.includes('.vercel.app');
      
      if (incomingOrigin === allowed || isLocalhost || isLocalIP || isVercel || allowed === '*' || allowed === '') {
        origin = incomingOrigin;
      }
    }
  }

  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Upload-Token, X-Album, X-Filename');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(response.body, { status: response.status, headers });
}

/**
 * Verify the X-Upload-Token header matches the UPLOAD_TOKEN secret.
 * Set the secret: npx wrangler secret put UPLOAD_TOKEN
 */
export async function authGuard(request, env) {
  const token = request.headers.get('X-Upload-Token') || '';
  if (!env.UPLOAD_TOKEN) {
    throw Object.assign(new Error('UPLOAD_TOKEN secret not configured'), { status: 500 });
  }
  if (token !== env.UPLOAD_TOKEN) {
    throw Object.assign(new Error('Unauthorized'), { status: 401 });
  }
}
