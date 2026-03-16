// ============================================================
// public/assets/siteControl.js — Site Control Center
// Allows admins to set a remote banner + maintenance mode
// for an external site that polls this Supabase table.
//
// Supabase table: site_controls
//   id, household_id, site_name (PK-ish), base_url, maintenance (bool),
//   banner_message, banner_severity, disabled_paths (text), public_read (bool),
//   updated_at
//
// If the table doesn't exist yet, run: migration-site-control.sql
// ============================================================
window.Hub = window.Hub || {};

Hub.siteControl = {

  // ── Page lifecycle ────────────────────────────────────────

  load() {
    console.log('[SiteControl] load()');

    // Admin gate
    if (Hub.state?.userRole !== 'admin') {
      const gate    = document.getElementById('controlAdminGate');
      const content = document.getElementById('controlContent');
      if (gate)    gate.classList.remove('hidden');
      if (content) content.style.display = 'none';
      return;
    }

    // Ensure content visible
    const content = document.getElementById('controlContent');
    if (content) content.style.display = '';

    // Wire buttons (idempotent — use onclick so no listener stacking)
    const btnLoad = document.getElementById('btnControlLoad');
    const btnSave = document.getElementById('btnControlSave');
    const btnCopy = document.getElementById('btnControlCopyJson');

    if (btnLoad) btnLoad.onclick = () => this._loadConfig();
    if (btnSave) btnSave.onclick = () => this._saveConfig();
    if (btnCopy) btnCopy.onclick = () => this._copyJson();

    // Load current config
    this._loadConfig();
  },

  onLeave() {
    // Nothing to clean up — all state is in the DOM form
  },

  // ── Load from Supabase ────────────────────────────────────

  async _loadConfig() {
    const siteName = this._siteName();
    this._setStatus('Loading…', 'text-gray-400');

    try {
      const { data, error } = await Hub.sb
        .from('site_controls')
        .select('*')
        .eq('household_id', Hub.state.household_id)
        .eq('site_name', siteName)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = 0 rows — not an error
        if (error.code === '42P01') {
          // Table doesn't exist
          this._setStatus('⚠ Table "site_controls" not found — run migration-site-control.sql first', 'text-yellow-400');
          this._renderSnippet(siteName);
          return;
        }
        throw error;
      }

      if (data) {
        this._populateForm(data);
        this._setStatus(`Loaded (last updated ${data.updated_at ? new Date(data.updated_at).toLocaleString() : 'never'})`, 'text-green-400');
      } else {
        this._setStatus('No config saved yet — fill in and click Save', 'text-gray-400');
      }

      this._renderPreview();
      this._renderSnippet(siteName);
    } catch (e) {
      console.error('[SiteControl] load error:', e);
      this._setStatus('Error: ' + e.message, 'text-red-400');
    }
  },

  // ── Save to Supabase ──────────────────────────────────────

  async _saveConfig() {
    this._setStatus('Saving…', 'text-gray-400');

    const siteName = this._siteName();
    const payload  = this._readForm(siteName);

    try {
      const { error } = await Hub.sb
        .from('site_controls')
        .upsert(payload, { onConflict: 'household_id,site_name' });

      if (error) {
        if (error.code === '42P01') {
          this._setStatus('⚠ Table missing — run migration-site-control.sql', 'text-yellow-400');
          return;
        }
        throw error;
      }

      this._setStatus('Saved ✓ ' + new Date().toLocaleTimeString(), 'text-green-400');
      this._renderPreview();
      Hub.ui?.toast?.('Site control config saved', 'success');
    } catch (e) {
      console.error('[SiteControl] save error:', e);
      this._setStatus('Save failed: ' + e.message, 'text-red-400');
      Hub.ui?.toast?.('Save failed: ' + e.message, 'error');
    }
  },

  // ── Helpers ───────────────────────────────────────────────

  _siteName() {
    return (document.getElementById('controlSiteName')?.value?.trim() || 'main');
  },

  _readForm(siteName) {
    const disabledRaw = document.getElementById('controlDisabledPaths')?.value || '';
    const disabled    = disabledRaw.split('\n').map(s => s.trim()).filter(Boolean);
    return {
      household_id:      Hub.state.household_id,
      site_name:         siteName,
      base_url:          document.getElementById('controlBaseUrl')?.value?.trim()    || null,
      maintenance:       document.getElementById('controlMaintenance')?.checked      ?? false,
      banner_message:    document.getElementById('controlBannerMessage')?.value?.trim() || null,
      banner_severity:   document.getElementById('controlBannerSeverity')?.value    || 'info',
      disabled_paths:    disabled.join('\n') || null,
      public_read:       document.getElementById('controlPublicRead')?.checked       ?? false,
      updated_at:        new Date().toISOString()
    };
  },

  _populateForm(data) {
    const $ = id => document.getElementById(id);
    if ($('controlSiteName'))      $('controlSiteName').value        = data.site_name        || 'main';
    if ($('controlBaseUrl'))       $('controlBaseUrl').value         = data.base_url          || '';
    if ($('controlMaintenance'))   $('controlMaintenance').checked   = !!data.maintenance;
    if ($('controlBannerMessage')) $('controlBannerMessage').value   = data.banner_message    || '';
    if ($('controlBannerSeverity'))$('controlBannerSeverity').value  = data.banner_severity   || 'info';
    if ($('controlDisabledPaths')) $('controlDisabledPaths').value   = (data.disabled_paths   || '').replace(/,/g, '\n');
    if ($('controlPublicRead'))    $('controlPublicRead').checked    = !!data.public_read;
  },

  _renderPreview() {
    const el = document.getElementById('controlJsonPreview');
    if (!el) return;
    const data = this._readForm(this._siteName());
    el.textContent = JSON.stringify({
      site_name:      data.site_name,
      maintenance:    data.maintenance,
      banner_message: data.banner_message,
      banner_severity: data.banner_severity,
      disabled_paths: data.disabled_paths ? data.disabled_paths.split('\n') : [],
      public_read:    data.public_read,
      updated_at:     data.updated_at
    }, null, 2);
  },

  _renderSnippet(siteName) {
    const el = document.getElementById('controlSnippet');
    if (!el) return;
    const url = Hub.state?.settings?.supabase_url || 'YOUR_SUPABASE_URL';
    const key = '(your-anon-key)';
    el.textContent =
`// Paste into your other site to read this config:
async function fetchSiteControl() {
  const url = '${url}/rest/v1/site_controls'
            + '?site_name=eq.${siteName}&public_read=eq.true&limit=1';
  const res  = await fetch(url, { headers: { apikey: '${key}', Accept: 'application/json' } });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}
// Then use: config.maintenance, config.banner_message, config.disabled_paths, etc.`;
  },

  _copyJson() {
    const el = document.getElementById('controlJsonPreview');
    if (!el) return;
    navigator.clipboard?.writeText(el.textContent)
      .then(() => Hub.ui?.toast?.('JSON copied', 'success'))
      .catch(() => Hub.ui?.toast?.('Copy failed — select and copy manually', 'error'));
  },

  _setStatus(msg, cls) {
    const el = document.getElementById('controlStatus');
    if (!el) return;
    el.textContent = msg;
    el.className   = 'text-xs mt-2 ' + (cls || 'text-gray-400');
  }
};
