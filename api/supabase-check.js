// ============================================================
// api/supabase-check.js — Server-side Supabase diagnostics
// Vercel serverless function (Node.js runtime)
//
// Usage: GET /api/supabase-check
//   Header: Authorization: Bearer <supabase_access_token>
//
// Requires Vercel env vars:
//   SUPABASE_URL            — e.g. https://cmaefwhqoykittrwiobw.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY — from Supabase → Settings → API
//   OWNER_EMAIL             — e.g. wtscott0603@gmail.com
// ============================================================

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SB_URL = process.env.SUPABASE_URL || '';
  const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const OWNER_EMAIL = process.env.OWNER_EMAIL || 'wtscott0603@gmail.com';

  const report = {
    timestamp: new Date().toISOString(),
    checks: {},
    errors: [],
    suggestions: []
  };

  // ── 1. Check env vars ──
  report.checks.env = {
    SUPABASE_URL: SB_URL ? 'set' : 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: SB_SERVICE_KEY
      ? 'set (' + SB_SERVICE_KEY.substring(0, 10) + '…)'
      : 'MISSING',
    OWNER_EMAIL: OWNER_EMAIL
  };

  if (!SB_URL || !SB_SERVICE_KEY) {
    report.errors.push('Missing required Vercel env vars');
    report.suggestions.push(
      'Go to Vercel → Project → Settings → Environment Variables and add:',
      '  SUPABASE_URL = https://cmaefwhqoykittrwiobw.supabase.co',
      '  SUPABASE_SERVICE_ROLE_KEY = (from Supabase Dashboard → Settings → API → service_role)',
      '  OWNER_EMAIL = wtscott0603@gmail.com'
    );
    return res.status(200).json(report);
  }

  // ── 2. Validate caller's access token ──
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  let callerEmail = null;
  let callerUserId = null;

  if (token && token.length > 20) {
    try {
      const userResp = await fetch(`${SB_URL}/auth/v1/user`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': SB_SERVICE_KEY
        }
      });
      if (userResp.ok) {
        const userData = await userResp.json();
        callerEmail = userData.email;
        callerUserId = userData.id;
        report.checks.caller = {
          email: callerEmail,
          user_id: callerUserId,
          provider: userData.app_metadata?.provider || '?',
          verified: true
        };
      } else {
        const errBody = await userResp.text();
        report.checks.caller = {
          error: 'Token validation failed (HTTP ' + userResp.status + ')',
          detail: errBody.substring(0, 200)
        };
      }
    } catch (e) {
      report.checks.caller = { error: 'Token validation exception: ' + e.message };
    }
  } else {
    report.checks.caller = { error: 'No valid Authorization header provided' };
  }

  // ── 3. Only show detailed output for owner ──
  const isOwner = callerEmail && callerEmail.toLowerCase() === OWNER_EMAIL.toLowerCase();
  if (!isOwner) {
    report.checks.authorization = 'Detailed diagnostics restricted to ' + OWNER_EMAIL;
    if (callerEmail) {
      report.checks.authorization += ' (you are ' + callerEmail + ')';
    }
    return res.status(200).json(report);
  }

  // ── 4. Check key tables ──
  const tables = [
    'households', 'household_members', 'allowed_emails',
    'user_settings', 'chores', 'chore_logs',
    'seen_alerts', 'system_logs'
  ];

  for (const table of tables) {
    try {
      const resp = await fetch(
        `${SB_URL}/rest/v1/${table}?select=count&limit=0`,
        {
          headers: {
            'apikey': SB_SERVICE_KEY,
            'Authorization': `Bearer ${SB_SERVICE_KEY}`,
            'Prefer': 'count=exact'
          }
        }
      );
      const countHeader = resp.headers.get('content-range');
      if (resp.ok) {
        // content-range looks like "*/5" meaning 5 total rows
        const total = countHeader ? countHeader.split('/')[1] : '?';
        report.checks['table_' + table] = { exists: true, row_count: total };
      } else {
        const body = await resp.text();
        report.checks['table_' + table] = {
          exists: false, http: resp.status,
          error: body.substring(0, 200)
        };
        report.errors.push('Table "' + table + '" query failed: HTTP ' + resp.status);
      }
    } catch (e) {
      report.checks['table_' + table] = { exists: false, error: e.message };
      report.errors.push('Table "' + table + '" exception: ' + e.message);
    }
  }

  // ── 5. Check if owner email exists in allowed_emails ──
  try {
    const resp = await fetch(
      `${SB_URL}/rest/v1/allowed_emails?email=eq.${encodeURIComponent(OWNER_EMAIL)}&select=id,email,household_id`,
      {
        headers: {
          'apikey': SB_SERVICE_KEY,
          'Authorization': `Bearer ${SB_SERVICE_KEY}`
        }
      }
    );
    const data = resp.ok ? await resp.json() : [];
    if (data.length > 0) {
      report.checks.owner_in_allowed_emails = { found: true, data: data[0] };
    } else {
      report.checks.owner_in_allowed_emails = { found: false };
      report.errors.push(OWNER_EMAIL + ' NOT in allowed_emails');
    }
  } catch (e) {
    report.checks.owner_in_allowed_emails = { error: e.message };
  }

  // ── 6. Check if owner email exists in household_members ──
  try {
    const resp = await fetch(
      `${SB_URL}/rest/v1/household_members?email=eq.${encodeURIComponent(OWNER_EMAIL)}&select=household_id,role,user_id`,
      {
        headers: {
          'apikey': SB_SERVICE_KEY,
          'Authorization': `Bearer ${SB_SERVICE_KEY}`
        }
      }
    );
    const data = resp.ok ? await resp.json() : [];
    if (data.length > 0) {
      report.checks.owner_in_household_members = { found: true, data: data[0] };
    } else {
      report.checks.owner_in_household_members = { found: false };
      report.errors.push(OWNER_EMAIL + ' NOT in household_members');
    }
  } catch (e) {
    report.checks.owner_in_household_members = { error: e.message };
  }

  // ── 7. If rows missing, suggest seed SQL ──
  if (report.errors.some(e => e.includes('NOT in'))) {
    report.suggestions.push(
      '-- Run this SQL in Supabase SQL Editor to seed your data:',
      '',
      "INSERT INTO households (id, name)",
      "  VALUES ('d49c4c5b-1ffd-42db-9b3e-bec70545bf87', 'Scott Family')",
      "  ON CONFLICT (id) DO NOTHING;",
      '',
      "INSERT INTO allowed_emails (email, household_id)",
      "  VALUES ('" + OWNER_EMAIL + "', 'd49c4c5b-1ffd-42db-9b3e-bec70545bf87')",
      "  ON CONFLICT DO NOTHING;",
      '',
      "INSERT INTO household_members (email, household_id, role, user_id)",
      "  VALUES ('" + OWNER_EMAIL + "', 'd49c4c5b-1ffd-42db-9b3e-bec70545bf87', 'admin',",
      "    '" + (callerUserId || 'YOUR_SUPABASE_USER_ID') + "')",
      "  ON CONFLICT DO NOTHING;"
    );
  }

  // ── 8. Summary ──
  report.summary = report.errors.length === 0
    ? '✓ All checks passed — auth + DB should work'
    : '✗ ' + report.errors.length + ' issue(s) found';

  return res.status(200).json(report);
}
