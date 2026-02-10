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
      // Load dogs
      const snapshot = await this.firebaseDb.ref('dogs').once('value');
      this.dogs = snapshot.val() || {};
      const dogIds = Object.keys(this.dogs);

      if (dogIds.length === 0) {
        el.innerHTML = '<p class="text-gray-400 text-sm">No dogs tracked yet</p>';
        return;
      }

      // Get status for each dog
      const statuses = await Promise.all(dogIds.map(async (dogId) => {
        const dog = this.dogs[dogId];
        const treatsSnapshot = await this.firebaseDb.ref(`treats/${dogId}`).once('value');
        const allTreats = treatsSnapshot.val() || {};
        const todayStart = Hub.utils.todayStart();

        // Calculate today's calories
        const todayTreats = Object.entries(allTreats)
          .filter(([_, t]) => t.timestamp >= todayStart);
        const totalCal = todayTreats.reduce((s, [_, t]) => s + (t.calories || 0), 0);
        const limit = dog.dailyCalorieLimit || 1000;
        const percent = Math.round((totalCal / limit) * 100);
        const isOnTrack = percent <= 100;

        return { dog, totalCal, limit, percent, isOnTrack };
      }));

      // Render circular gauges for all dogs
      el.innerHTML = statuses.map(({ dog, totalCal, limit, percent, isOnTrack }) => {
        // Color changes: green -> yellow -> orange -> red
        let gaugeColor, statusText, statusIcon;
        if (percent <= 50) {
          gaugeColor = '#22c55e'; // Green
          statusText = 'Great!';
          statusIcon = '✓';
        } else if (percent <= 75) {
          gaugeColor = '#84cc16'; // Light green
          statusText = 'Good';
          statusIcon = '✓';
        } else if (percent <= 90) {
          gaugeColor = '#f59e0b'; // Orange
          statusText = 'Getting Close';
          statusIcon = '⚠';
        } else if (percent <= 100) {
          gaugeColor = '#fb923c'; // Dark orange
          statusText = 'Almost There';
          statusIcon = '⚠';
        } else {
          gaugeColor = '#ef4444'; // Red
          statusText = 'Over Limit!';
          statusIcon = '✗';
        }

        // Calculate arc for circular gauge
        const radius = 45;
        const circumference = 2 * Math.PI * radius;
        const strokeDashoffset = circumference - (Math.min(percent, 100) / 100) * circumference;

        return `
          <div class="mb-4 last:mb-0">
            <!-- Dog name and status -->
            <div class="flex items-center justify-between mb-3">
              <span class="font-semibold text-base">${Hub.utils.esc(dog.name)}</span>
              <span class="text-xs font-bold" style="color: ${gaugeColor};">${statusIcon} ${statusText}</span>
            </div>
            
            <!-- Circular gauge -->
            <div class="flex items-center gap-4">
              <!-- SVG Gauge -->
              <svg class="transform -rotate-90" width="120" height="120" viewBox="0 0 120 120">
                <!-- Background circle -->
                <circle
                  cx="60"
                  cy="60"
                  r="${radius}"
                  stroke="#374151"
                  stroke-width="10"
                  fill="none"
                />
                <!-- Progress arc -->
                <circle
                  cx="60"
                  cy="60"
                  r="${radius}"
                  stroke="${gaugeColor}"
                  stroke-width="10"
                  fill="none"
                  stroke-linecap="round"
                  style="
                    stroke-dasharray: ${circumference};
                    stroke-dashoffset: ${strokeDashoffset};
                    transition: stroke-dashoffset 0.5s ease, stroke 0.5s ease;
                  "
                />
                <!-- Center text -->
                <text
                  x="60"
                  y="60"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  class="transform rotate-90"
                  style="
                    font-size: 24px;
                    font-weight: 700;
                    fill: ${gaugeColor};
                    transform-origin: 60px 60px;
                  "
                >${percent}%</text>
              </svg>
              
              <!-- Stats -->
              <div class="flex-1">
                <p class="text-sm font-semibold mb-1">${totalCal} / ${limit} cal</p>
                <p class="text-xs text-gray-400">Daily limit</p>
                ${percent > 100 ? `<p class="text-xs font-bold mt-1" style="color: ${gaugeColor};">+${totalCal - limit} over!</p>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');

    } catch (e) {
      console.error('[Treats] Error rendering dashboard widget:', e);
      el.innerHTML = '<p class="text-gray-400 text-sm">Error loading dog status</p>';
    }
  }
};
