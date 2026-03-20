// ============================================================
// cloudflare/src/middleware.js
// CORS, auth guard, Turnstile verification
// ============================================================

/** Add CORS headers to any response */
export function cors(response, env) {
  const origin = env.ALLOWED_ORIGIN || '*';
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Upload-Token, CF-Turnstile-Token');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(response.body, { status: response.status, headers });
}

/**
 * Verify the X-Upload-Token header matches the UPLOAD_TOKEN secret.
 * Throws a 401 AuthError if missing or wrong.
 * Set the secret with: npx wrangler secret put UPLOAD_TOKEN
 */
export async function authGuard(request, env) {
  const token = request.headers.get('X-Upload-Token') || '';
  if (!env.UPLOAD_TOKEN) throw Object.assign(new Error('Server not configured for uploads'), { status: 500 });
  if (token !== env.UPLOAD_TOKEN) throw Object.assign(new Error('Unauthorized'), { status: 401 });
}

/**
 * Verify a Cloudflare Turnstile challenge token.
 * Throws 403 if verification fails.
 * Set secret with: npx wrangler secret put TURNSTILE_SECRET
 *
 * Usage: pass CF-Turnstile-Token header (or body field) from the client.
 * The client gets the token from the Turnstile widget rendered with TURNSTILE_SITE_KEY.
 */
export async function turnstileGuard(request, env) {
  if (!env.TURNSTILE_SECRET) return; // skip if not configured

  const token = request.headers.get('CF-Turnstile-Token')
    || (await request.clone().json().catch(() => ({}))).turnstileToken
    || '';

  if (!token) throw Object.assign(new Error('Turnstile token missing'), { status: 403 });

  const formData = new FormData();
  formData.append('secret', env.TURNSTILE_SECRET);
  formData.append('response', token);
  formData.append('remoteip', request.headers.get('CF-Connecting-IP') || '');

  const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body:   formData,
  });
  const result = await resp.json();

  if (!result.success) {
    throw Object.assign(
      new Error('Turnstile verification failed: ' + (result['error-codes'] || []).join(', ')),
      { status: 403 }
    );
  }
}
