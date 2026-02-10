// ============================================================
// assets/chores.js — Chores management (Supabase) (v2)
//
// Fixes in v2:
//   - Fixed dashboard filter for legacy chores missing day_of_week
// ============================================================
window.Hub = window.Hub || {};

Hub.chores = {
  familyMembers: ['Will', 'Lyla', 'Erin', 'Mark'],

  // Day mapping: category string → JS getDay() value (0=Sun, 1=Mon … 6=Sat)
  DAY_MAP: {
    'Daily': null,
    'Monday (Living Room)': 1,
    'Tuesday (Bathrooms)': 2,
    'Wednesday (Entryway)': 3,
    'Thursday (Kitchen)': 4,
    'Friday (Bedrooms)': 5,
    'Saturday (Miscellaneous)': 6,
    'Sunday (Grocery/Family)': 0
  },

  SORT_ORDER: [
    'Daily', 'Monday (Living Room)', 'Tuesday (Bathrooms)', 'Wednesday (Entryway)',
    'Thursday (Kitchen)', 'Friday (Bedrooms)', 'Saturday (Miscellaneous)', 'Sunday (Grocery/Family)'
  ],

  /** Load and render dashboard chores (today's priority) */
  async renderDashboard() {
    const el = Hub.utils.$('dashboardChores');
    if (!el) return;

    if (!Hub.state.household_id) {
      el.innerHTML = '<p class="text-gray-400 text-sm">Loading chores...</p>';
      setTimeout(() => this.renderDashboard(), 500);
      return;
    }

    try {
      const chores = await Hub.db.loadChoresWithCompleters(Hub.state.household_id);
      const today = new Date().getDay();

      // All chores for today (daily + matching weekday)
      // Supports both day_of_week column AND category string (fallback for legacy chores)
      const todayAll = chores.filter(c => {
        if (c.category === 'Daily') return true;
        // Check day_of_week column (set by new add/edit flow)
        if (c.day_of_week === today) return true;
        // Fallback: parse category string for legacy chores missing day_of_week
        if (c.day_of_week == null && c.category) {
          var mapDay = Hub.chores.DAY_MAP[c.category];
          if (mapDay === today) return true;
        }
        return false;
      });
      const todayPending = todayAll.filter(c => c.status !== 'done');
      const doneCount = todayAll.length - todayPending.length;

      if (todayAll.length === 0) {
        el.innerHTML = '<p class="text-gray-400 text-sm">No chores scheduled for today</p>';
        return;
      }

      // Progress bar
      const pct = Math.round((doneCount / todayAll.length) * 100);
      const progressColor = pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : 'bg-yellow-500';

      let html = `
        <div class="mb-3">
          <div class="flex justify-between text-xs text-gray-400 mb-1">
            <span>${doneCount} of ${todayAll.length} done</span>
            <span>${pct}%</span>
          </div>
          <div class="progress-bar" style="height:0.4rem;">
            <div class="progress-fill ${progressColor}" style="width:${pct}%"></div>
          </div>
        </div>
      `;

      if (!todayPending.length) {
        html += '<p class="text-green-400 text-sm font-semibold">✨ All done for today!</p>';
        el.innerHTML = html;
        return;
      }

      html += todayPending.slice(0, 5).map(c => `
        <div class="flex items-center justify-between py-3 border-b border-gray-700 last:border-0">
          <div class="flex-1 min-w-0 pr-3">
            <p class="text-sm font-semibold truncate">${Hub.utils.esc(c.title)}</p>
            <p class="text-xs text-gray-500">${Hub.utils.esc(c.category || 'General')}</p>
          </div>
          <button 
            onclick="Hub.chores.quickComplete('${c.id}')" 
            class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg font-semibold transition-colors flex-shrink-0"
          >
            Done
          </button>
        </div>
      `).join('');

      if (todayPending.length > 5) {
        html += `<p class="text-xs text-gray-500 mt-2 text-center">+${todayPending.length - 5} more</p>`;
      }

      el.innerHTML = html;
    } catch (e) {
      console.error('[Chores] Dashboard error:', e);
      el.innerHTML = '<p class="text-gray-400 text-sm">Error loading chores</p>';
    }
  },

  /** Quick complete from dashboard */
  async quickComplete(choreId) {
    const name = await this.askWhoDidIt();
    if (!name) return;
    await this.markDone(choreId, name);
    await this.renderDashboard();
    Hub.ui.toast(`Chore completed by ${name}!`, 'success');
  },

  /** Ask who completed the chore — returns a Promise<string|null> */
  askWhoDidIt() {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4';

      const cleanup = (value) => { modal.remove(); resolve(value); };

      modal.innerHTML = `
        <div class="bg-gray-800 rounded-xl p-8 max-w-md w-full shadow-2xl border border-gray-700">
          <h3 class="text-2xl font-bold mb-6 text-center">Who did this chore?</h3>
          <div class="space-y-3" id="_whoButtons"></div>
          <button id="_whoCancel" class="w-full mt-4 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-semibold transition-colors">
            Cancel
          </button>
        </div>
      `;
      document.body.appendChild(modal);

      const container = modal.querySelector('#_whoButtons');
      this.familyMembers.forEach(name => {
        const btn = document.createElement('button');
        btn.className = 'w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl font-bold text-lg transition-all transform hover:scale-105 shadow-lg';
        btn.textContent = name;
        btn.addEventListener('click', () => cleanup(name));
        container.appendChild(btn);
      });

      modal.querySelector('#_whoCancel').addEventListener('click', () => cleanup(null));
      modal.addEventListener('click', (e) => { if (e.target === modal) cleanup(null); });
    });
  },

  /** Load and render full chores list */
  async load() {
    const el = Hub.utils.$('choresList');
    if (!el || !Hub.state.household_id) return;

    try {
      const chores = await Hub.db.loadChoresWithCompleters(Hub.state.household_id);
      if (!chores.length) {
        el.innerHTML = '<div class="card text-center"><p class="text-gray-400">No chores yet. Click "+ Add Chore" to create one!</p></div>';
        return;
      }

      // Group by category
      const grouped = {};
      chores.forEach(c => {
        const cat = c.category || 'Other';
        (grouped[cat] = grouped[cat] || []).push(c);
      });

      const sortedCategories = Object.keys(grouped).sort((a, b) => {
        const ai = this.SORT_ORDER.indexOf(a);
        const bi = this.SORT_ORDER.indexOf(b);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });

      el.innerHTML = sortedCategories.map(category => {
        const list = grouped[category];
        const pending = list.filter(c => c.status !== 'done');
        const done = list.filter(c => c.status === 'done');

        return `
          <div class="mb-8">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-2xl font-bold">${Hub.utils.esc(category)}</h2>
              <span class="text-sm text-gray-400">${pending.length} pending / ${list.length} total</span>
            </div>
            <div class="space-y-3">
              ${[...pending, ...done].map(c => this._renderChoreCard(c)).join('')}
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.error('[Chores] Load error:', e);
      el.innerHTML = '<div class="card text-center"><p class="text-red-400">Error loading chores</p></div>';
    }
  },

  /** Render a single chore card */
  _renderChoreCard(c) {
    const isDone = c.status === 'done';
    return `
      <div class="card ${isDone ? 'opacity-60 bg-gray-800' : ''}">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-start gap-3">
              <input 
                type="checkbox" 
                ${isDone ? 'checked' : ''} 
                onchange="Hub.chores.toggleChore('${c.id}', this.checked, this)"
                class="mt-1 w-5 h-5 rounded border-gray-600 bg-gray-700 checked:bg-green-600 cursor-pointer flex-shrink-0"
              >
              <div class="flex-1">
                <h3 class="text-lg font-semibold ${isDone ? 'line-through text-gray-500' : ''}">${Hub.utils.esc(c.title)}</h3>
                ${c.description ? `<p class="text-gray-400 text-sm mt-1">${Hub.utils.esc(c.description)}</p>` : ''}
                ${isDone && c.completed_by_name ? `
                  <p class="text-sm text-green-400 mt-2">✓ Completed by ${Hub.utils.esc(c.completed_by_name)}</p>
                ` : ''}
              </div>
            </div>
          </div>
          <div class="flex gap-2 flex-shrink-0">
            <button onclick="Hub.chores.editChore('${c.id}')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-semibold transition-colors" title="Edit">✏️ Edit</button>
            <button onclick="Hub.chores.remove('${c.id}')" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg font-semibold transition-colors" title="Delete">🗑️</button>
          </div>
        </div>
      </div>
    `;
  },

  /** Toggle chore completion */
  async toggleChore(choreId, checked, checkbox) {
    if (checked) {
      const name = await this.askWhoDidIt();
      if (!name) {
        if (checkbox) checkbox.checked = false;
        return;
      }
      await this.markDone(choreId, name);
    } else {
      await Hub.db.updateChore(choreId, { status: 'pending', completed_by_name: null });
    }
    await this.load();
    await this.renderDashboard();
  },

  /** Edit chore */
  async editChore(choreId) {
    try {
      const chores = await Hub.db.loadChores(Hub.state.household_id);
      const chore = chores.find(c => c.id === choreId);
      if (!chore) return;

      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
      modal.innerHTML = `
        <div class="bg-gray-800 rounded-xl p-6 max-w-lg w-full">
          <h3 class="text-2xl font-bold mb-4">Edit Chore</h3>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-semibold mb-2">Title</label>
              <input type="text" id="editChoreTitle" value="${Hub.utils.esc(chore.title)}" class="input">
            </div>
            <div>
              <label class="block text-sm font-semibold mb-2">Description (optional)</label>
              <textarea id="editChoreDesc" class="input" rows="3">${Hub.utils.esc(chore.description || '')}</textarea>
            </div>
            <div>
              <label class="block text-sm font-semibold mb-2">Category</label>
              <select id="editChoreCategory" class="input">
                ${this.SORT_ORDER.map(cat =>
                  `<option value="${cat}" ${chore.category === cat ? 'selected' : ''}>${cat}</option>`
                ).join('')}
              </select>
            </div>
          </div>
          <div class="flex gap-3 mt-6">
            <button id="editSave" class="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold">Save Changes</button>
            <button id="editCancel" class="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold">Cancel</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.querySelector('#editSave').addEventListener('click', () => this._saveEdit(choreId, modal));
      modal.querySelector('#editCancel').addEventListener('click', () => modal.remove());
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    } catch (e) {
      console.error('[Chores] Edit error:', e);
      Hub.ui.toast('Error loading chore', 'error');
    }
  },

  /** Save chore edits */
  async _saveEdit(choreId, modal) {
    try {
      const title = document.getElementById('editChoreTitle').value.trim();
      const description = document.getElementById('editChoreDesc').value.trim();
      const category = document.getElementById('editChoreCategory').value;

      if (!title) { Hub.ui.toast('Title is required', 'error'); return; }

      await Hub.db.updateChore(choreId, {
        title,
        description: description || null,
        category,
        day_of_week: this.DAY_MAP[category] ?? null
      });

      modal.remove();
      await this.load();
      await this.renderDashboard();
      Hub.ui.toast('Chore updated!', 'success');
    } catch (e) {
      console.error('[Chores] Save edit error:', e);
      Hub.ui.toast('Error saving chore', 'error');
    }
  },

  /** Mark chore as done with person's name */
  async markDone(choreId, personName) {
    if (!Hub.state.user?.id) return;
    try {
      await Hub.db.markChoreDone(choreId, Hub.state.user.id, personName);
    } catch (e) {
      console.error('[Chores] Mark done error:', e);
      Hub.ui.toast('Failed to mark chore as done', 'error');
    }
  },

  /** Show add-chore modal */
  showAdd() { Hub.ui.openModal('addChoreModal'); },

  /** Create a new chore */
  async add() {
    const title = Hub.utils.$('choreTitle').value.trim();
    const description = Hub.utils.$('choreDescription').value.trim();
    const category = Hub.utils.$('choreCategory')?.value || 'Daily';
    if (!title) return Hub.ui.toast('Enter a title', 'error');

    try {
      await Hub.db.addChore({
        household_id: Hub.state.household_id,
        title,
        description: description || null,
        category,
        day_of_week: this.DAY_MAP[category] ?? null,
        priority: 'medium',
        created_by: Hub.state.user.id,
        recurrence: category === 'Daily' ? 'daily' : 'weekly',
        status: 'pending'
      });
      Hub.utils.$('choreTitle').value = '';
      Hub.utils.$('choreDescription').value = '';
      if (Hub.utils.$('choreCategory')) Hub.utils.$('choreCategory').value = 'Daily';
      Hub.ui.closeModal('addChoreModal');
      Hub.ui.toast('Chore created!', 'success');
      this.load();
      this.renderDashboard();
    } catch (e) {
      Hub.ui.toast('Failed: ' + e.message, 'error');
    }
  },

  /** Delete a chore */
  async remove(choreId) {
    if (!confirm('Delete this chore?')) return;
    try {
      await Hub.db.deleteChore(choreId);
      await this.load();
      await this.renderDashboard();
      Hub.ui.toast('Chore deleted', 'success');
    } catch (e) {
      console.error('[Chores] Delete error:', e);
      Hub.ui.toast('Failed to delete chore', 'error');
    }
  }
};
