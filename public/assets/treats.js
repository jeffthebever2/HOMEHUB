// ============================================================
// assets/treats.js — Barker's daily calorie tracker (Firebase RTDB)
//
// Data model: /familyData in Firebase
//   settings: { dogName, goalKcal, cups, kcalPerCup }
//   catalog:  [ { id, name, kcalPerUnit, unitLabel, step, imageUrl } ]
//   items:    [ { id, catalogId, name, kcalPerUnit, qty, unitLabel, type } ]
//
// The old /dogs and /treats paths are no longer used.
// ============================================================
window.Hub = window.Hub || {};

Hub.treats = {
  _db:       null,
  _listener: null,  // active Firebase ref for real-time updates

  // ── Firebase init ─────────────────────────────────────────

  _ensureDb() {
    if (this._db) return true;
    const cfg = window.HOME_HUB_CONFIG?.firebase;
    if (!cfg?.apiKey) { console.warn('[Treats] Firebase config missing'); return false; }
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    this._db = firebase.database();
    return true;
  },

  // ── Lifecycle ─────────────────────────────────────────────

  /** Called when entering the treats page */
  async loadDogs() {
    // "loadDogs" name kept for backward compat with app.js onPageEnter call
    await this._renderPage();
    this._attachListener();
  },

  cleanup() {
    if (this._listener) {
      try { this._listener.ref.off('value', this._listener.cb); } catch (_) {}
      this._listener = null;
    }
  },

  // ── Page renderer ─────────────────────────────────────────

  async _renderPage() {
    if (!this._ensureDb()) {
      this._setPageError('Firebase not configured');
      return;
    }
    try {
      const snap = await this._db.ref('familyData').once('value');
      this._renderFromData(snap.val(), 'page');
    } catch (e) {
      console.error('[Treats] Page load error:', e);
      this._setPageError('Error loading data');
    }
  },

  _renderFromData(data, target) {
    if (!data?.settings) {
      if (target === 'page') this._setPageError('No dog data in Firebase. Set up familyData/settings first.');
      return;
    }

    const { dogName = 'Barker', goalKcal = 1800, cups = 0, kcalPerCup = 0 } = data.settings;
    const items        = Array.isArray(data.items) ? data.items : [];
    const foodCal      = cups * kcalPerCup;
    const treatCal     = items.reduce((s, it) => s + (it.kcalPerUnit || 0) * (it.qty || 0), 0);
    const totalCal     = foodCal + treatCal;
    const pct          = Math.min(Math.round((totalCal / goalKcal) * 100), 100);
    const remaining    = goalKcal - totalCal;

    // Colour ramp: green → amber → red
    const ringColor = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : pct >= 60 ? '#fb923c' : '#22c55e';
    const r = 52, circ = +(2 * Math.PI * r).toFixed(3);

    // ── Calorie ring ────────────────────────────────────────
    const ringHtml = `
      <div class="flex items-center gap-6">
        <div class="relative flex-shrink-0" style="width:128px;height:128px;">
          <svg width="128" height="128" style="transform:rotate(-90deg);">
            <circle cx="64" cy="64" r="${r}" fill="none" stroke="#1e2d3d" stroke-width="12"/>
            <circle id="calorieRingArc" cx="64" cy="64" r="${r}" fill="none"
              stroke="${ringColor}" stroke-width="12" stroke-linecap="round"
              stroke-dasharray="${circ}" stroke-dashoffset="${circ}"
              style="transition:stroke-dashoffset 1.4s cubic-bezier(0.34,1.1,0.64,1);"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;">
            <span id="calorieRingPct" class="text-2xl font-bold leading-none" style="color:${ringColor};">0%</span>
            <span class="text-xs text-gray-400">of limit</span>
          </div>
        </div>
        <div class="flex-1 space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-400">Food</span>
            <span class="font-semibold">${Math.round(foodCal)} cal</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Treats</span>
            <span class="font-semibold">${Math.round(treatCal)} cal</span>
          </div>
          <div class="flex justify-between border-t border-gray-700 pt-2">
            <span class="text-gray-400">Total</span>
            <span class="font-bold" style="color:${ringColor};">${Math.round(totalCal)} / ${goalKcal}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Remaining</span>
            <span class="font-semibold ${remaining > 0 ? 'text-green-400' : 'text-red-400'}">
              ${remaining > 0 ? Math.round(remaining) + ' cal' : '⚠️ Limit reached'}
            </span>
          </div>
        </div>
      </div>`;

    // ── Today's treat items ─────────────────────────────────
    const todayItems = items.filter(it => it.qty > 0);
    const todayHtml  = `
      <h3 class="font-bold mb-3 text-lg">Today's Treats</h3>
      ${todayItems.length === 0
        ? '<p class="text-gray-400 text-sm">No treats logged yet today.</p>'
        : todayItems.map(it => `
            <div class="flex items-center justify-between py-2.5 border-b border-gray-700 last:border-0">
              <div class="flex-1 min-w-0">
                <p class="font-medium text-sm">${Hub.utils.esc(it.name)}</p>
                <p class="text-xs text-gray-400">${it.qty} × ${it.kcalPerUnit} cal = ${it.qty * it.kcalPerUnit} cal</p>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <button onclick="Hub.treats._adjustQty('${it.id}', -1)"
                  class="w-7 h-7 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg leading-none">−</button>
                <span class="text-sm font-semibold w-5 text-center">${it.qty}</span>
                <button onclick="Hub.treats._adjustQty('${it.id}', 1)"
                  class="w-7 h-7 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg leading-none">+</button>
              </div>
            </div>`).join('')}`;

    // 7-day history (page only)
    const histHtml = this._buildWeekHistory(data, goalKcal);

    if (target === 'page') {
      const prog = document.getElementById('calorieProgress');
      if (prog) prog.innerHTML = ringHtml;
      const today = document.getElementById('todayTreats');
      if (today) today.innerHTML = todayHtml;
      const hist = document.getElementById('weekHistory');
      if (hist) hist.innerHTML = histHtml;
    } else {
      // dashboard widget
      const el = Hub.utils.$('dogStatusWidget');
      if (el) {
        const statusLabel = pct >= 100 ? '⚠ Over limit' : pct >= 80 ? 'Getting close' : '✓ Good';
        el.innerHTML = `
          <div class="flex items-center gap-4">
            <div class="relative flex-shrink-0" style="width:80px;height:80px;">
              <svg width="80" height="80" style="transform:rotate(-90deg);">
                <circle cx="40" cy="40" r="32" fill="none" stroke="#1e2d3d" stroke-width="8"/>
                <circle cx="40" cy="40" r="32" fill="none" stroke="${ringColor}" stroke-width="8"
                  stroke-linecap="round"
                  stroke-dasharray="${+(2*Math.PI*32).toFixed(3)}"
                  stroke-dashoffset="${+(2*Math.PI*32*(1-pct/100)).toFixed(3)}"
                  style="transition:stroke-dashoffset .8s ease;"/>
              </svg>
              <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
                <span style="font-size:.9rem;font-weight:700;color:${ringColor};">${pct}%</span>
              </div>
            </div>
            <div class="flex-1 text-sm">
              <p class="font-semibold mb-0.5">${Math.round(totalCal)} / ${goalKcal} cal</p>
              <p class="text-xs text-gray-400">${Math.round(foodCal)} food · ${Math.round(treatCal)} treats</p>
              <p class="text-xs font-semibold mt-1" style="color:${ringColor};">${statusLabel}</p>
            </div>
          </div>`;
      }
    }

    // Animate ring
    requestAnimationFrame(() => {
      const arc   = document.getElementById('calorieRingArc');
      const numEl = document.getElementById('calorieRingPct');
      if (!arc || !numEl) return;
      arc.style.strokeDashoffset = String(circ - circ * pct / 100);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) { numEl.textContent = pct + '%'; return; }
      const dur = 1400, start = performance.now();
      const tick = now => {
        const t    = Math.min((now - start) / dur, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        numEl.textContent = Math.round(ease * pct) + '%';
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  },

  _buildWeekHistory(data, goalKcal) {
    // Build 7-day bar chart from Firebase items history
    // Firebase doesn't store history by day — items array is today's snapshot only.
    // Show a simple "Today" summary as a single bar until daily archiving is added.
    const items   = Array.isArray(data?.items) ? data.items : [];
    const treatCal = items.reduce((s, it) => s + (it.kcalPerUnit || 0) * (it.qty || 0), 0);
    const cups    = data?.settings?.cups || 0;
    const kcalPerCup = data?.settings?.kcalPerCup || 0;
    const total   = Math.round(treatCal + cups * kcalPerCup);
    const pct     = goalKcal > 0 ? Math.min(Math.round((total / goalKcal) * 100), 100) : 0;
    const barColor = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-blue-500';

    return `
      <h3 class="font-bold mb-3 text-lg">Today's Summary</h3>
      <div class="flex items-center gap-3">
        <span class="text-xs text-gray-400 w-16 text-right">Today</span>
        <div class="flex-1 rounded-full overflow-hidden" style="height:.5rem;background:#1e2d3d;">
          <div class="${barColor} rounded-full" style="width:${pct}%;height:100%;transition:width .6s ease;"></div>
        </div>
        <span class="text-xs text-gray-400 w-20">${total} / ${goalKcal} cal</span>
      </div>
      <p class="text-xs text-gray-600 mt-3">Per-day history available once daily archiving is enabled.</p>`;
  },

  _setPageError(msg) {
    const ids = ['calorieProgress', 'todayTreats', 'weekHistory'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<p class="text-gray-400 text-sm">${Hub.utils.esc(msg)}</p>`;
    });
  },

  // ── Real-time listener ────────────────────────────────────

  _attachListener() {
    this.cleanup();
    if (!this._ensureDb()) return;
    const ref = this._db.ref('familyData');
    const cb  = snap => this._renderFromData(snap.val(), 'page');
    ref.on('value', cb);
    this._listener = { ref, cb };
  },

  // ── Treat quantity adjustment ─────────────────────────────

  async _adjustQty(itemId, delta) {
    if (!this._ensureDb()) return;
    try {
      const snap  = await this._db.ref('familyData/items').once('value');
      const items = snap.val() || [];
      const idx   = items.findIndex(it => it.id === itemId);
      if (idx < 0) return;
      const newQty = Math.max(0, (items[idx].qty || 0) + delta);
      if (newQty === 0) {
        items.splice(idx, 1); // remove item when quantity hits 0
      } else {
        items[idx] = { ...items[idx], qty: newQty };
      }
      await this._db.ref('familyData/items').set(items);
    } catch (e) {
      Hub.ui?.toast?.('Failed to update — check connection', 'error');
    }
  },

  // ── Quick-add treat from catalog ─────────────────────────

  async showQuickAdd() {
    if (!this._ensureDb()) { Hub.ui?.toast?.('Firebase not configured', 'error'); return; }
    try {
      const snap    = await this._db.ref('familyData/catalog').once('value');
      const catalog = snap.val() || [];
      if (!catalog.length) { Hub.ui?.toast?.('No treats in catalog yet', 'error'); return; }

      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
      modal.innerHTML = `
        <div class="bg-gray-800 rounded-xl p-6 max-w-sm w-full max-h-[80vh] overflow-y-auto">
          <h3 class="text-xl font-bold mb-4">Add Treat for Barker</h3>
          <div class="space-y-2 mb-4">
            ${catalog.map(treat => `
              <button onclick="Hub.treats._quickAdd('${treat.id}')"
                class="w-full text-left px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">
                <div class="font-semibold">${Hub.utils.esc(treat.name)}</div>
                <div class="text-xs text-gray-400">${treat.kcalPerUnit} cal / ${treat.unitLabel || 'unit'}</div>
              </button>`).join('')}
          </div>
          <button onclick="this.closest('.fixed').remove()"
            class="w-full btn btn-secondary">Cancel</button>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    } catch (e) {
      console.error('[Treats] showQuickAdd error:', e);
      Hub.ui?.toast?.('Error loading catalog', 'error');
    }
  },

  async _quickAdd(treatId) {
    document.querySelectorAll('.fixed.inset-0').forEach(m => m.remove());
    if (!this._ensureDb()) return;
    try {
      const [catalogSnap, itemsSnap] = await Promise.all([
        this._db.ref('familyData/catalog').once('value'),
        this._db.ref('familyData/items').once('value'),
      ]);
      const catalog = catalogSnap.val() || [];
      const items   = itemsSnap.val()   || [];
      const treat   = catalog.find(t => t.id === treatId);
      if (!treat) { Hub.ui?.toast?.('Treat not found', 'error'); return; }

      // If already in today's items, increment qty instead of adding duplicate
      const existing = items.find(it => it.catalogId === treatId);
      if (existing) {
        existing.qty = (existing.qty || 0) + (treat.step || 1);
      } else {
        items.push({
          id:         Date.now().toString(),
          catalogId:  treatId,
          name:       treat.name,
          kcalPerUnit: treat.kcalPerUnit,
          qty:        treat.step || 1,
          unitLabel:  treat.unitLabel || 'unit',
          type:       'catalog',
        });
      }
      await this._db.ref('familyData/items').set(items);
      Hub.ui?.toast?.(`Added ${treat.name}! 🐕`, 'success');
    } catch (e) {
      console.error('[Treats] _quickAdd error:', e);
      Hub.ui?.toast?.('Failed to add treat', 'error');
    }
  },

  // ── Dashboard widget ──────────────────────────────────────

  async renderDashboardWidget() {
    const el = Hub.utils.$('dogStatusWidget');
    if (!el) return;
    if (!this._ensureDb()) {
      el.innerHTML = '<p class="text-gray-400 text-sm">Firebase not configured</p>';
      return;
    }
    try {
      const snap = await this._db.ref('familyData').once('value');
      this._renderFromData(snap.val(), 'dashboard');
    } catch (e) {
      console.error('[Treats] Dashboard widget error:', e);
      el.innerHTML = '<p class="text-gray-400 text-sm">Error loading dog status</p>';
    }
  },

  // ── Compatibility stubs ───────────────────────────────────
  // Kept so any old onPageEnter/button wiring doesn't throw

  init()        { this._ensureDb(); },
  showAddTreat(){ this.showQuickAdd(); },
  showAddDog()  {},
  logTreat()    {},
  addDog()      {},
};
