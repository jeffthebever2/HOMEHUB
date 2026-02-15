// ============================================================
// assets/treats.js — Dog Treat Tracker (Firebase RTDB)
// ============================================================
window.Hub = window.Hub || {};

Hub.treats = {
  firebaseDb: null,
  dogs: {},
  selectedDogId: null,
  _listeners: [],

  /** Initialize Firebase */
  init() {
    const cfg = window.HOME_HUB_CONFIG?.firebase;
    if (!cfg?.apiKey) { console.warn('Firebase config missing'); return; }
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    this.firebaseDb = firebase.database();
  },

  /** Detach all Firebase listeners */
  cleanup() {
    this._listeners.forEach(({ ref, cb }) => { try { ref.off('value', cb); } catch (e) {} });
    this._listeners = [];
  },

  /** Load all dogs and render selectors */
  async loadDogs() {
    if (!this.firebaseDb) { this.init(); if (!this.firebaseDb) return; }

    const snapshot = await this.firebaseDb.ref('dogs').once('value');
    this.dogs = snapshot.val() || {};
    const dogIds = Object.keys(this.dogs);

    const selectorEl = Hub.utils.$('dogSelector');
    if (dogIds.length === 0) {
      selectorEl.innerHTML = '<p class="text-gray-400">No dogs yet. Add one below!</p>';
      Hub.utils.$('selectedDogName').textContent = 'Add a dog to get started';
      Hub.utils.$('calorieProgress').innerHTML = '';
      Hub.utils.$('todayTreats').innerHTML = '';
      Hub.utils.$('weekHistory').innerHTML = '';
      return;
    }

    if (!this.selectedDogId || !this.dogs[this.selectedDogId]) {
      this.selectedDogId = dogIds[0];
    }

    selectorEl.innerHTML = dogIds.map(id =>
      `<button onclick="Hub.treats.selectDog('${id}')" class="btn ${this.selectedDogId === id ? 'btn-primary' : 'btn-secondary'} mr-2 mb-2">${Hub.utils.esc(this.dogs[id].name)}</button>`
    ).join('');

    this.loadTreats(this.selectedDogId);
    this._attachRealtimeListener(this.selectedDogId);
  },

  /** Select a dog */
  selectDog(id) {
    this.cleanup();
    this.selectedDogId = id;
    this.loadDogs();
  },

  /** Load and render treats for a dog */
  async loadTreats(dogId) {
    const dog = this.dogs[dogId];
    if (!dog) return;

    Hub.utils.$('selectedDogName').textContent = dog.name;

    const snapshot = await this.firebaseDb.ref(`treats/${dogId}`).once('value');
    const allTreats = snapshot.val() || {};
    const todayStart = Hub.utils.todayStart();

    // Today's treats
    const todayTreats = Object.entries(allTreats)
      .filter(([_, t]) => t.timestamp >= todayStart)
      .sort((a, b) => b[1].timestamp - a[1].timestamp);

    const totalCal = todayTreats.reduce((s, [_, t]) => s + (t.calories || 0), 0);
    const limit = dog.dailyCalorieLimit || 1000;
    const remaining = limit - totalCal;
    const pct = Math.min((totalCal / limit) * 100, 100);
    const color = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-green-500';

    Hub.utils.$('calorieProgress').innerHTML = `
      <div class="flex justify-between mb-2">
        <span class="text-sm text-gray-400">Daily Calories</span>
        <span class="font-bold">${totalCal} / ${limit} cal</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill ${color}" style="width:${pct}%"></div>
      </div>
      <p class="text-sm mt-2 ${remaining > 0 ? 'text-green-400' : 'text-red-400'}">${remaining > 0 ? remaining + ' cal remaining' : 'Limit reached!'}</p>
    `;

    // Today treats list
    if (todayTreats.length === 0) {
      Hub.utils.$('todayTreats').innerHTML = '<p class="text-gray-400">No treats logged today</p>';
    } else {
      Hub.utils.$('todayTreats').innerHTML = '<h3 class="font-bold mb-3">Today\'s Treats</h3>' +
        todayTreats.map(([_, t]) => `
          <div class="bg-gray-700 rounded-lg p-3 mb-2 flex justify-between items-center">
            <div><p class="font-medium">${Hub.utils.esc(t.name)}</p><p class="text-sm text-gray-400">${t.calories} cal</p></div>
            <span class="text-sm text-gray-400">${Hub.utils.formatTime(t.timestamp)}</span>
          </div>
        `).join('');
    }

    // Last 7 days
    this._renderWeekHistory(allTreats, limit);
  },

  /** Render 7-day history */
  _renderWeekHistory(allTreats, limit) {
    const el = Hub.utils.$('weekHistory');
    if (!el) return;
    const entries = Object.values(allTreats);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const start = Hub.utils.daysAgo(i);
      const end = start + 86400000;
      const dayTreats = entries.filter(t => t.timestamp >= start && t.timestamp < end);
      const total = dayTreats.reduce((s, t) => s + (t.calories || 0), 0);
      const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : new Date(start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      days.push({ label, total });
    }

    el.innerHTML = '<h3 class="font-bold mb-3">Last 7 Days</h3>' +
      days.map(d => {
        const pct = Math.min((d.total / limit) * 100, 100);
        const c = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-blue-500';
        return `<div class="flex items-center gap-3 mb-2">
          <span class="text-xs text-gray-400 w-24 text-right">${Hub.utils.esc(d.label)}</span>
          <div class="flex-1 progress-bar" style="height:.5rem"><div class="progress-fill ${c}" style="width:${pct}%;height:100%"></div></div>
          <span class="text-xs text-gray-400 w-16">${d.total} cal</span>
        </div>`;
      }).join('');
  },

  /** Attach real-time listener for a dog's treats */
  _attachRealtimeListener(dogId) {
    if (!this.firebaseDb) return;
    const ref = this.firebaseDb.ref(`treats/${dogId}`);
    const cb = () => { this.loadTreats(dogId); };
    ref.on('value', cb);
    this._listeners.push({ ref, cb });
  },

  /** Add a new dog */
  async addDog() {
    const name = Hub.utils.$('dogName').value.trim();
    const cal = parseInt(Hub.utils.$('dogCalories').value) || 1000;
    if (!name) return Hub.ui.toast('Enter a dog name', 'error');

    await this.firebaseDb.ref('dogs').push({ name, dailyCalorieLimit: cal });
    Hub.utils.$('dogName').value = '';
    Hub.utils.$('dogCalories').value = '1000';
    Hub.ui.closeModal('addDogModal');
    Hub.ui.toast(name + ' added!');
    this.loadDogs();
  },

  /** Log a treat */
  async logTreat() {
    if (!this.selectedDogId) return Hub.ui.toast('Select a dog first', 'error');
    const name = Hub.utils.$('treatName').value.trim();
    const cal = parseInt(Hub.utils.$('treatCalories').value);
    if (!name || !cal) return Hub.ui.toast('Enter treat name and calories', 'error');

    await this.firebaseDb.ref(`treats/${this.selectedDogId}`).push({
      name, calories: cal, timestamp: Date.now(), dogId: this.selectedDogId
    });
    Hub.utils.$('treatName').value = '';
    Hub.utils.$('treatCalories').value = '';
    Hub.ui.closeModal('addTreatModal');
    Hub.ui.toast('Treat logged!');
    // Realtime listener will refresh
  },

  /** Show add-dog modal */
  showAddDog() { Hub.ui.openModal('addDogModal'); },

  /** Show add-treat modal */
  showAddTreat() {
    if (!this.selectedDogId) return Hub.ui.toast('Select a dog first', 'error');
    Hub.ui.openModal('addTreatModal');
  },

  /** Render dog status widget for dashboard with circular gauge */
  async renderDashboardWidget() {
    const el = Hub.utils.$('dogStatusWidget');
    if (!el) return;

    if (!this.firebaseDb) {
      this.init();
      if (!this.firebaseDb) {
        el.innerHTML = '<p class="text-gray-400 text-sm">Firebase not configured</p>';
        return;
      }
    }

    try {
      // Load Barker's data from familyData
      const snapshot = await this.firebaseDb.ref('familyData').once('value');
      const familyData = snapshot.val() || {};
      const settings = familyData.settings || {};
      const dogName = settings.dogName || 'Barker';
      const limit = Number(settings.dailyLimit || 200);
      const photoUrl = settings.dogPhotoUrl || 'https://images.unsplash.com/photo-1517849845537-4d257902454a?w=800&auto=format&fit=crop&q=60';

      // Items array (treat logs)
      const items = Array.isArray(familyData.items) ? familyData.items : [];

      // Get timestamp (supports old entries)
      const getTs = (it) => {
        if (!it) return 0;
        if (typeof it.ts === 'number') return it.ts;
        if (it.timestamp) {
          const t = Date.parse(it.timestamp);
          if (!isNaN(t)) return t;
        }
        // Old items used id = Date.now().toString()
        if (it.id && /^\d+$/.test(it.id)) return parseInt(it.id, 10);
        return 0;
      };

      // Filter to today only
      const now = new Date();
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);

      const itemsToday = items
        .map(it => ({ ...it, _ts: getTs(it) }))
        .filter(it => it._ts >= start.getTime() && it._ts <= end.getTime());

      const totalCal = itemsToday.reduce((sum, item) => sum + (Number(item.kcalPerUnit || 0) * Number(item.qty || 1)), 0);
      const pct = limit > 0 ? Math.min(100, Math.round((totalCal / limit) * 100)) : 0;
      const remaining = Math.max(0, limit - totalCal);

      const gaugeColor = pct >= 100 ? '#f87171' : pct >= 80 ? '#fbbf24' : '#34d399';

      const recent = itemsToday.slice(-5).reverse();
      const fmtTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

      const historyHtml = recent.length ? `
        <div class="mt-4 pt-4 border-t border-white/10">
          <h4 class="text-sm font-semibold mb-2 text-amber-300">🍖 Treat history (today)</h4>
          <div class="space-y-2">
            ${recent.map(it => `
              <div class="flex items-center justify-between text-sm p-2 rounded-xl border border-white/10 bg-white/5">
                <div class="min-w-0 pr-3">
                  <p class="font-semibold truncate">${Hub.utils.esc(it.label || it.name || 'Treat')}</p>
                  <p class="text-xs text-gray-400 mt-0.5">${fmtTime(it._ts)}</p>
                </div>
                <div class="text-right">
                  <p class="text-xs text-gray-400">${Number(it.qty || 1)} × ${Number(it.kcalPerUnit || 0)} kcal</p>
                  <p class="text-sm font-semibold text-amber-200">${Math.round(Number(it.qty || 1) * Number(it.kcalPerUnit || 0))} kcal</p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : `
        <div class="mt-4 pt-4 border-t border-white/10">
          <p class="text-sm text-gray-400">No treats logged today yet.</p>
        </div>
      `;

      el.innerHTML = `
        <div class="flex items-center gap-4">
          <img src="${photoUrl}" alt="${dogName}" class="w-16 h-16 rounded-2xl object-cover border border-white/10">
          <div class="flex-1 min-w-0">
            <p class="text-sm text-gray-400">Today's calories</p>
            <p class="text-2xl font-bold">${Math.round(totalCal)} <span class="text-sm text-gray-400">/ ${limit} kcal</span></p>
            <p class="text-xs text-gray-400 mt-1">${remaining} kcal remaining</p>
          </div>

          <div class="w-20 h-20 relative">
            <svg class="w-20 h-20" viewBox="0 0 36 36">
              <defs>
                <linearGradient id="hhDogGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#fb923c" />
                  <stop offset="100%" stop-color="#fbbf24" />
                </linearGradient>
              </defs>
              <path d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="rgba(255,255,255,0.12)"
                stroke-width="4"
              />
              <path d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="url(#hhDogGrad)"
                stroke-width="4"
                stroke-linecap="round"
                stroke-dasharray="${pct}, 100"
              />
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="text-center">
                <p class="text-sm font-bold" style="color:${gaugeColor};">${pct}%</p>
                ${pct >= 100 ? `<p class="text-[10px] font-bold mt-0.5" style="color:${gaugeColor};">OVER</p>` : `<p class="text-[10px] text-gray-400 mt-0.5">OK</p>`}
              </div>
            </div>
          </div>
        </div>

        <div class="mt-4">
          <button onclick="Hub.treats.showQuickAdd()" class="btn btn-primary w-full justify-center">🍖 Quick Add Treat</button>
        </div>

        ${historyHtml}
      `;

      // Celebration when hitting 100%
      if (pct === 100 && Hub.ui && Hub.ui.confettiBurst) {
        try {
          const r = el.getBoundingClientRect();
          Hub.ui.confettiBurst(r.left + r.width * 0.65, r.top + r.height * 0.35, 22);
        } catch (_) {}
      }

    } catch (e) {
      console.error('[Treats] Error rendering dashboard widget:', e);
      el.innerHTML = '<p class="text-gray-400 text-sm">Error loading dog status</p>';
    }
  },
async showQuickAdd() {
    if (!this.firebaseDb) {
      this.init();
      if (!this.firebaseDb) {
        Hub.ui.toast('Firebase not configured', 'error');
        return;
      }
    }

    try {
      // Load catalog from Firebase
      const catalogSnap = await this.firebaseDb.ref('familyData/catalog').once('value');
      const catalog = catalogSnap.val() || [];

      if (!catalog.length) {
        Hub.ui.toast('No treats in catalog', 'error');
        return;
      }

      // Show modal with treat selection
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
      modal.innerHTML = `
        <div class="bg-gray-800 rounded-xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
          <h3 class="text-xl font-bold mb-4">Add Treat for Barker</h3>
          <div class="space-y-2 mb-4">
            ${catalog.map((treat, idx) => `
              <button 
                onclick="Hub.treats.addQuickTreat('${treat.id}', '${Hub.utils.esc(treat.name)}', ${treat.kcalPerUnit})"
                class="w-full text-left px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                <div class="font-semibold">${Hub.utils.esc(treat.name)}</div>
                <div class="text-sm text-gray-400">${treat.kcalPerUnit} cal per ${treat.unitLabel || 'unit'}</div>
              </button>
            `).join('')}
          </div>
          <button 
            onclick="this.closest('.fixed').remove()"
            class="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
          >
            Cancel
          </button>
        </div>
      `;
      document.body.appendChild(modal);
    } catch (e) {
      console.error('[Treats] Error showing quick add:', e);
      Hub.ui.toast('Error loading treats', 'error');
    }
  },

  /** Add a quick treat (default quantity 1) */
  async addQuickTreat(treatId, treatName, calories) {
    try {
      // Get current items
      const itemsSnap = await this.firebaseDb.ref('familyData/items').once('value');
      const items = itemsSnap.val() || [];

      // Find the treat in catalog for full details
      const catalogSnap = await this.firebaseDb.ref('familyData/catalog').once('value');
      const catalog = catalogSnap.val() || [];
      const treat = catalog.find(t => t.id === treatId);

      if (!treat) {
        Hub.ui.toast('Treat not found', 'error');
        return;
      }

      const now = Date.now();
      // Add new item
      const newItem = {
        id: now.toString(),
        ts: now,
        timestamp: new Date(now).toISOString(),
        catalogId: treatId,
        name: treatName,
        kcalPerUnit: calories,
        qty: 1,
        unitLabel: treat.unitLabel || 'unit',
        step: treat.step || 1,
        type: 'catalog',
        imageUrl: treat.imageUrl || ''
      };

      items.push(newItem);
      await this.firebaseDb.ref('familyData/items').set(items);

      // Close modal
      document.querySelectorAll('.fixed.inset-0').forEach(m => m.remove());

      // Refresh dashboard
      await this.renderDashboardWidget();
      
      Hub.ui.toast(`Added ${treatName} for Barker!`, 'success');
    } catch (e) {
      console.error('[Treats] Error adding treat:', e);
      Hub.ui.toast('Error adding treat', 'error');
    }
  }
};
