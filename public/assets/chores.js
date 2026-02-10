// ============================================================
// assets/chores.js — Chores management (Supabase)
// ============================================================
window.Hub = window.Hub || {};

Hub.chores = {
  familyMembers: ['Will', 'Lyla', 'Erin', 'Mark'],

  /** Load and render dashboard chores (today's priority) */
  async renderDashboard() {
    const el = Hub.utils.$('dashboardChores');
    if (!el) {
      console.warn('[Chores] Dashboard element not found');
      return;
    }

    // Wait for household_id if not ready
    if (!Hub.state.household_id) {
      console.warn('[Chores] Waiting for household_id...');
      el.innerHTML = '<p class="text-gray-400 text-sm">Loading chores...</p>';
      setTimeout(() => this.renderDashboard(), 500);
      return;
    }

    try {
      console.log('[Chores] Loading dashboard chores for household:', Hub.state.household_id);
      const chores = await Hub.db.loadChoresWithCompleters(Hub.state.household_id);
      console.log('[Chores] Loaded', chores.length, 'total chores');
      
      const today = new Date().getDay(); // 0=Sunday, 1=Monday, etc
      console.log('[Chores] Today is day:', today);
      
      // Get today's daily chores + this weekday's chores
      const todayChores = chores.filter(c => {
        if (c.status === 'done') return false;
        if (c.category === 'Daily') return true;
        if (c.day_of_week === today) return true;
        return false;
      }).slice(0, 5); // Show first 5

      console.log('[Chores] Found', todayChores.length, 'pending chores for today');

      if (!todayChores.length) {
        el.innerHTML = '<p class="text-gray-400 text-sm">No pending chores</p>';
        return;
      }

      el.innerHTML = todayChores.map(c => `
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
    } catch (e) {
      console.error('[Chores] Dashboard error:', e);
      el.innerHTML = '<p class="text-gray-400 text-sm">Error loading chores</p>';
    }
  },

  /** Quick complete from dashboard - asks who did it */
  async quickComplete(choreId) {
    const name = await this.askWhoDidIt();
    if (!name) return;
    
    await this.markDone(choreId, name);
    await this.renderDashboard(); // Refresh dashboard
    Hub.ui.toast(`Chore completed by ${name}!`, 'success');
  },

  /** Ask who completed the chore */
  async askWhoDidIt() {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50';
      modal.innerHTML = `
        <div class="bg-gray-800 rounded-xl p-6 max-w-sm w-full mx-4">
          <h3 class="text-xl font-bold mb-4">Who did this chore?</h3>
          <div class="space-y-2">
            ${this.familyMembers.map(name => `
              <button 
                onclick="Hub.chores.selectPerson('${name}')"
                class="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
              >
                ${name}
              </button>
            `).join('')}
          </div>
          <button 
            onclick="Hub.chores.cancelPersonSelect()"
            class="w-full mt-3 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
          >
            Cancel
          </button>
        </div>
      `;
      document.body.appendChild(modal);
      
      this._personSelectResolve = resolve;
      this._personSelectModal = modal;
    });
  },

  selectPerson(name) {
    if (this._personSelectResolve) this._personSelectResolve(name);
    if (this._personSelectModal) this._personSelectModal.remove();
  },

  cancelPersonSelect() {
    if (this._personSelectResolve) this._personSelectResolve(null);
    if (this._personSelectModal) this._personSelectModal.remove();
  },

  /** Load and render full chores list (sorted by day) */
  async load() {
    const el = Hub.utils.$('choresList');
    if (!el || !Hub.state.household_id) return;

    try {
      const chores = await Hub.db.loadChoresWithCompleters(Hub.state.household_id);
      if (!chores.length) {
        el.innerHTML = '<div class="card text-center"><p class="text-gray-400">No chores yet. Click "+ Add Chore" to create one!</p></div>';
        return;
      }

      // Group by category and sort by day_of_week
      const grouped = {};
      chores.forEach(c => {
        const cat = c.category || 'Other';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(c);
      });

      // Sort categories by day
      const sortOrder = ['Daily', 'Monday (Living Room)', 'Tuesday (Bathrooms)', 'Wednesday (Entryway)', 
                         'Thursday (Kitchen)', 'Friday (Bedrooms)', 'Saturday (Miscellaneous)', 'Sunday (Grocery/Family)'];
      
      const sortedCategories = Object.keys(grouped).sort((a, b) => {
        const aIdx = sortOrder.indexOf(a);
        const bIdx = sortOrder.indexOf(b);
        if (aIdx === -1 && bIdx === -1) return 0;
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
      });

      el.innerHTML = sortedCategories.map(category => {
        const categoryChores = grouped[category];
        const pending = categoryChores.filter(c => c.status !== 'done');
        const done = categoryChores.filter(c => c.status === 'done');

        return `
          <div class="mb-6">
            <h2 class="text-xl font-bold mb-3">${Hub.utils.esc(category)} (${pending.length}/${categoryChores.length})</h2>
            <div class="space-y-2">
              ${[...pending, ...done].map(c => {
                const isDone = c.status === 'done';
                
                // Get completer name
                let completerText = '';
                if (isDone && c.completed_by_name) {
                  completerText = `<p class="text-sm text-green-400 mt-2">✓ Completed by ${Hub.utils.esc(c.completed_by_name)}</p>`;
                }
                
                return `
                  <div class="card flex items-start justify-between ${isDone ? 'opacity-50' : ''}">
                    <div class="flex-1">
                      <h3 class="text-lg font-semibold ${isDone ? 'line-through' : ''}">${Hub.utils.esc(c.title)}</h3>
                      ${c.description ? `<p class="text-gray-400 text-sm mt-1">${Hub.utils.esc(c.description)}</p>` : ''}
                      <div class="flex gap-2 mt-2">
                        ${c.recurrence ? `<span class="inline-block px-2 py-1 rounded text-xs bg-blue-600">${Hub.utils.esc(c.recurrence)}</span>` : ''}
                        ${c.due_date ? `<span class="inline-block px-2 py-1 rounded text-xs bg-gray-600">${c.due_date}</span>` : ''}
                      </div>
                      ${completerText}
                    </div>
                    <div class="flex gap-2 ml-4 flex-shrink-0">
                      ${!isDone ? `<button onclick="Hub.chores.completeWithName('${c.id}')" class="btn btn-success text-sm">✓ Done</button>` : ''}
                      <button onclick="Hub.chores.remove('${c.id}')" class="btn btn-danger text-sm">Delete</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.error('Chores load error:', e);
      el.innerHTML = '<div class="card text-center"><p class="text-red-400">Error loading chores</p></div>';
    }
  },

  /** Complete chore with name selection */
  async completeWithName(choreId) {
    const name = await this.askWhoDidIt();
    if (!name) return;
    
    await this.markDone(choreId, name);
    await this.load();
    Hub.ui.toast(`Chore completed by ${name}!`, 'success');
  },

  /** Mark chore as done with person's name */
  async markDone(choreId, personName) {
    if (!Hub.state.user_id) return;
    try {
      await Hub.db.markChoreDone(choreId, Hub.state.user_id, personName);
    } catch (e) {
      console.error('Mark done error:', e);
      Hub.ui.toast('Failed to mark chore as done', 'error');
    }
  },

  /** Remove a chore */
  async remove(choreId) {
    if (!confirm('Delete this chore?')) return;
    try {
      await Hub.db.deleteChore(choreId);
      await this.load();
      await this.renderDashboard();
      Hub.ui.toast('Chore deleted', 'success');
    } catch (e) {
      console.error('Delete error:', e);
      Hub.ui.toast('Failed to delete chore', 'error');
    }
  }
};
      el.innerHTML = '<div class="card"><p class="text-yellow-400">Error loading chores</p></div>';
    }
  },

  /** Load mini chores for dashboard */
  async loadDashboard() {
    const el = Hub.utils.$('dashboardChores');
    if (!el || !Hub.state.household_id) return;

    try {
      const chores = await Hub.db.loadChores(Hub.state.household_id);
      const pending = chores.filter(c => c.status === 'pending').slice(0, 5);
      if (pending.length === 0) {
        el.innerHTML = '<p class="text-gray-400 text-sm">No pending chores</p>';
      } else {
        el.innerHTML = pending.map(c => {
          const dot = c.priority === 'high' ? '🔴' : c.priority === 'medium' ? '🟡' : '🟢';
          return `<p class="text-sm mb-1">${dot} ${Hub.utils.esc(c.title)}</p>`;
        }).join('');
      }
    } catch {
      el.innerHTML = '<p class="text-sm text-gray-400">Unable to load chores</p>';
    }
  },

  /** Show add-chore modal */
  showAdd() { Hub.ui.openModal('addChoreModal'); },

  /** Create a new chore */
  async add() {
    const title = Hub.utils.$('choreTitle').value.trim();
    const description = Hub.utils.$('choreDescription').value.trim();
    const priority = Hub.utils.$('chorePriority').value;
    if (!title) return Hub.ui.toast('Enter a title', 'error');

    try {
      await Hub.db.addChore({
        household_id: Hub.state.household_id,
        title,
        description: description || null,
        priority,
        created_by: Hub.state.user.id,
        recurrence: 'once',
        status: 'pending'
      });
      Hub.utils.$('choreTitle').value = '';
      Hub.utils.$('choreDescription').value = '';
      Hub.ui.closeModal('addChoreModal');
      Hub.ui.toast('Chore created!');
      this.load();
    } catch (e) {
      Hub.ui.toast('Failed: ' + e.message, 'error');
    }
  },

  /** Mark chore as done */
  async markDone(id) {
    try {
      await Hub.db.updateChore(id, { status: 'done' });
      await Hub.db.logChoreCompletion(id, Hub.state.household_id, Hub.state.user.id);
      Hub.ui.toast('Chore completed!');
      this.load();
    } catch (e) {
      Hub.ui.toast('Failed: ' + e.message, 'error');
    }
  },

  /** Delete a chore */
  async remove(id) {
    if (!confirm('Delete this chore?')) return;
    try {
      await Hub.db.deleteChore(id);
      Hub.ui.toast('Chore deleted');
      this.load();
    } catch (e) {
      Hub.ui.toast('Failed: ' + e.message, 'error');
    }
  }
};
