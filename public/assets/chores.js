// ============================================================
// assets/chores.js — Chores management (Supabase) — FIXED
//
// Fixes:
//   - Removed duplicate/garbage code that crashed the script
//   - showAdd() and add() now properly inside Hub.chores
//   - Dashboard filter works with and without category/day_of_week columns
//   - Category selector on add modal
//   - markDone uses Hub.state.user.id (not Hub.state.user_id)
// ============================================================
window.Hub = window.Hub || {};

Hub.chores = {
  familyMembers: ['Will', 'Lyla', 'Erin', 'Mark'],


  _createConfetti(x, y) {
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
    for (let i = 0; i < 15; i++) {
      const particle = document.createElement('div');
      particle.style.cssText = `
        position: fixed; left: ${x}px; top: ${y}px;
        width: 8px; height: 8px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        border-radius: 50%; pointer-events: none; z-index: 10000;
        transition: all 0.8s ease-out;
      `;
      const tx = (Math.random() - 0.5) * 200;
      const ty = Math.random() * -200 - 50;
      setTimeout(() => {
        particle.style.transform = `translate(${tx}px, ${ty}px)`;
        particle.style.opacity = '0';
      }, 10);
      document.body.appendChild(particle);
      setTimeout(() => particle.remove(), 900);
    }
  },


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
    var el = Hub.utils.$('dashboardChores');
    if (!el) return;

    if (!Hub.state.household_id) {
      el.innerHTML = '<p class="text-gray-400 text-sm">Loading chores...</p>';
      setTimeout(function () { Hub.chores.renderDashboard(); }, 500);
      return;
    }

    try {
      var chores = await Hub.db.loadChores(Hub.state.household_id);
      var today = new Date().getDay();

      // Filter today's chores — supports both old schema (no category) and new schema
      var todayAll = chores.filter(function (c) {
        // New schema: has category column
        if (c.category === 'Daily') return true;
        if (typeof c.day_of_week === 'number' && c.day_of_week === today) return true;
        // Fallback: parse category string for day_of_week
        if (c.day_of_week == null && c.category && Hub.chores.DAY_MAP[c.category] === today) return true;
        // Old schema: no category at all — show all pending chores
        if (c.category == null && c.day_of_week == null) return true;
        return false;
      });

      var todayPending = todayAll.filter(function (c) { return c.status !== 'done'; });
      var doneCount = todayAll.length - todayPending.length;

      if (todayAll.length === 0) {
        el.innerHTML = '<p class="text-gray-400 text-sm">No chores yet — add some from the Chores page!</p>';
        return;
      }

      // Progress bar
      var pct = Math.round((doneCount / todayAll.length) * 100);
      var progressColor = pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : 'bg-yellow-500';

      var html = '<div class="mb-3">' +
        '<div class="flex justify-between text-xs text-gray-400 mb-1">' +
          '<span>' + doneCount + ' of ' + todayAll.length + ' done</span>' +
          '<span>' + pct + '%</span>' +
        '</div>' +
        '<div class="progress-bar" style="height:0.4rem;">' +
          '<div class="progress-fill ' + progressColor + '" style="width:' + pct + '%"></div>' +
        '</div>' +
      '</div>';

      if (!todayPending.length) {
        html += '<p class="text-green-400 text-sm font-semibold">✨ All done for today!</p>';
        el.innerHTML = html;
        return;
      }

      html += todayPending.slice(0, 5).map(function (c) {
        return '<div class="flex items-center justify-between py-3 border-b border-gray-700 last:border-0">' +
          '<div class="flex-1 min-w-0 pr-3">' +
            '<p class="text-sm font-semibold truncate">' + Hub.utils.esc(c.title) + '</p>' +
            '<p class="text-xs text-gray-500">' + Hub.utils.esc(c.category || c.priority || 'General') + '</p>' +
          '</div>' +
          '<button onclick="Hub.chores.quickComplete(\'' + c.id + '\')" ' +
            'class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg font-semibold transition-colors flex-shrink-0">' +
            'Done' +
          '</button>' +
        '</div>';
      }).join('');

      if (todayPending.length > 5) {
        html += '<p class="text-xs text-gray-500 mt-2 text-center">+' + (todayPending.length - 5) + ' more</p>';
      }

      el.innerHTML = html;
    } catch (e) {
      console.error('[Chores] Dashboard error:', e);
      el.innerHTML = '<p class="text-gray-400 text-sm">Error loading chores</p>';
    }
  },

  /** Quick complete from dashboard — asks who did it */
  async quickComplete(choreId) {
    var name = await this.askWhoDidIt();
    if (!name) return;
    await this.markDone(choreId, name);
    await this.renderDashboard();
    Hub.ui.toast('Chore completed by ' + name + '!', 'success');
  },

  /** Ask who completed the chore — returns a Promise<string|null> */
  askWhoDidIt() {
    var self = this;
    return new Promise(function (resolve) {
      var modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4';

      var cleanup = function (value) { modal.remove(); resolve(value); };

      modal.innerHTML =
        '<div class="bg-gray-800 rounded-xl p-8 max-w-md w-full shadow-2xl border border-gray-700">' +
          '<h3 class="text-2xl font-bold mb-6 text-center">Who did this chore?</h3>' +
          '<div class="space-y-3" id="_whoButtons"></div>' +
          '<button id="_whoCancel" class="w-full mt-4 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-semibold transition-colors">Cancel</button>' +
        '</div>';
      document.body.appendChild(modal);

      var container = modal.querySelector('#_whoButtons');
      self.familyMembers.forEach(function (name) {
        var btn = document.createElement('button');
        btn.className = 'w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl font-bold text-lg transition-all transform hover:scale-105 shadow-lg';
        btn.textContent = name;
        btn.addEventListener('click', function () { cleanup(name); });
        container.appendChild(btn);
      });

      modal.querySelector('#_whoCancel').addEventListener('click', function () { cleanup(null); });
      modal.addEventListener('click', function (e) { if (e.target === modal) cleanup(null); });
    });
  },

  /** Load and render full chores list (sorted by category/day) */
  async load() {
    var el = Hub.utils.$('choresList');
    if (!el || !Hub.state.household_id) return;

    try {
      var chores = await Hub.db.loadChoresWithCompleters(Hub.state.household_id);
      if (!chores.length) {
        el.innerHTML = '<div class="card text-center"><p class="text-gray-400">No chores yet. Click "+ Add Chore" to create one!</p></div>';
        return;
      }

      // Group by category (or 'Other' for old schema chores without category)
      var grouped = {};
      chores.forEach(function (c) {
        var cat = c.category || 'Other';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(c);
      });

      var self = this;
      var sortedCategories = Object.keys(grouped).sort(function (a, b) {
        var ai = self.SORT_ORDER.indexOf(a);
        var bi = self.SORT_ORDER.indexOf(b);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });

      el.innerHTML = sortedCategories.map(function (category) {
        var list = grouped[category];
        var pending = list.filter(function (c) { return c.status !== 'done'; });
        var done = list.filter(function (c) { return c.status === 'done'; });

        return '<div class="mb-8">' +
          '<div class="flex items-center justify-between mb-4">' +
            '<h2 class="text-2xl font-bold">' + Hub.utils.esc(category) + '</h2>' +
            '<span class="text-sm text-gray-400">' + pending.length + ' pending / ' + list.length + ' total</span>' +
          '</div>' +
          '<div class="space-y-3">' +
            [].concat(pending, done).map(function (c) { return self._renderChoreCard(c); }).join('') +
          '</div>' +
        '</div>';
      }).join('');
    } catch (e) {
      console.error('[Chores] Load error:', e);
      el.innerHTML = '<div class="card text-center"><p class="text-red-400">Error loading chores</p></div>';
    }
  },

  /** Render a single chore card */
  _renderChoreCard(c) {
    var isDone = c.status === 'done';
    var completerHtml = '';
    if (isDone && c.completed_by_name) {
      completerHtml = '<p class="text-sm text-green-400 mt-2">✓ Completed by ' + Hub.utils.esc(c.completed_by_name) + '</p>';
    } else if (isDone && c.completer_email) {
      completerHtml = '<p class="text-sm text-green-400 mt-2">✓ Completed by ' + Hub.utils.esc(c.completer_email) + '</p>';
    }

    return '<div class="card ' + (isDone ? 'opacity-60 bg-gray-800' : '') + '">' +
      '<div class="flex items-start justify-between gap-4">' +
        '<div class="flex-1 min-w-0">' +
          '<div class="flex items-start gap-3">' +
            '<input type="checkbox" ' + (isDone ? 'checked' : '') +
              ' onchange="Hub.chores.toggleChore(\'' + c.id + '\', this.checked, this)"' +
              ' class="mt-1 w-5 h-5 rounded border-gray-600 bg-gray-700 checked:bg-green-600 cursor-pointer flex-shrink-0">' +
            '<div class="flex-1">' +
              '<h3 class="text-lg font-semibold ' + (isDone ? 'line-through text-gray-500' : '') + '">' + Hub.utils.esc(c.title) + '</h3>' +
              (c.description ? '<p class="text-gray-400 text-sm mt-1">' + Hub.utils.esc(c.description) + '</p>' : '') +
              '<div class="flex gap-2 mt-2">' +
                (c.recurrence ? '<span class="inline-block px-2 py-1 rounded text-xs bg-blue-600">' + Hub.utils.esc(c.recurrence) + '</span>' : '') +
                (c.priority ? '<span class="inline-block px-2 py-1 rounded text-xs bg-gray-600">' + Hub.utils.esc(c.priority) + '</span>' : '') +
              '</div>' +
              completerHtml +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="flex gap-2 flex-shrink-0">' +
          '<button onclick="Hub.chores.editChore(\'' + c.id + '\')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-semibold transition-colors" title="Edit">✏️</button>' +
          '<button onclick="Hub.chores.remove(\'' + c.id + '\')" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg font-semibold transition-colors" title="Delete">🗑️</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  },

  /** Toggle chore completion via checkbox */
  async toggleChore(choreId, checked, checkbox) {
    if (checked) {
      var name = await this.askWhoDidIt();
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
      var chores = await Hub.db.loadChores(Hub.state.household_id);
      var chore = chores.find(function (c) { return c.id === choreId; });
      if (!chore) return;

      var self = this;
      var modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
      modal.innerHTML =
        '<div class="bg-gray-800 rounded-xl p-6 max-w-lg w-full">' +
          '<h3 class="text-2xl font-bold mb-4">Edit Chore</h3>' +
          '<div class="space-y-4">' +
            '<div><label class="block text-sm font-semibold mb-2">Title</label>' +
              '<input type="text" id="editChoreTitle" value="' + Hub.utils.esc(chore.title) + '" class="input"></div>' +
            '<div><label class="block text-sm font-semibold mb-2">Description</label>' +
              '<textarea id="editChoreDesc" class="input" rows="3">' + Hub.utils.esc(chore.description || '') + '</textarea></div>' +
            '<div><label class="block text-sm font-semibold mb-2">Category</label>' +
              '<select id="editChoreCategory" class="input">' +
                self.SORT_ORDER.map(function (cat) {
                  return '<option value="' + cat + '" ' + (chore.category === cat ? 'selected' : '') + '>' + cat + '</option>';
                }).join('') +
              '</select></div>' +
          '</div>' +
          '<div class="flex gap-3 mt-6">' +
            '<button id="editSave" class="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold">Save</button>' +
            '<button id="editCancel" class="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold">Cancel</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);

      modal.querySelector('#editSave').addEventListener('click', function () {
        self._saveEdit(choreId, modal);
      });
      modal.querySelector('#editCancel').addEventListener('click', function () { modal.remove(); });
      modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
    } catch (e) {
      console.error('[Chores] Edit error:', e);
      Hub.ui.toast('Error loading chore', 'error');
    }
  },

  /** Save chore edits */
  async _saveEdit(choreId, modal) {
    try {
      var title = document.getElementById('editChoreTitle').value.trim();
      var description = document.getElementById('editChoreDesc').value.trim();
      var category = document.getElementById('editChoreCategory').value;

      if (!title) { Hub.ui.toast('Title is required', 'error'); return; }

      var dayVal = this.DAY_MAP[category];
      var updates = {
        title: title,
        description: description || null,
        category: category,
        day_of_week: dayVal != null ? dayVal : null
      };

      await Hub.db.updateChore(choreId, updates);
      modal.remove();
      await this.load();
      await this.renderDashboard();
      Hub.ui.toast('Chore updated!', 'success');
    } catch (e) {
      console.error('[Chores] Save edit error:', e);
      Hub.ui.toast('Error saving: ' + e.message, 'error');
    }
  },

  /** Mark chore as done with person's name */
  async markDone(choreId, personName) {
    // Use Hub.state.user.id (NOT Hub.state.user_id which doesn't exist in this version)
    if (!Hub.state.user || !Hub.state.user.id) return;
    try {
      await Hub.db.markChoreDone(choreId, Hub.state.user.id, personName);
    } catch (e) {
      console.error('[Chores] Mark done error:', e);
      Hub.ui.toast('Failed to mark chore as done', 'error');
    }
  },

  /** Show add-chore modal */
  showAdd() {
    Hub.ui.openModal('addChoreModal');
  },

  /** Create a new chore */
  async add() {
    var title = Hub.utils.$('choreTitle').value.trim();
    var description = Hub.utils.$('choreDescription').value.trim();
    var category = Hub.utils.$('choreCategory') ? Hub.utils.$('choreCategory').value : 'Daily';
    var priority = Hub.utils.$('chorePriority') ? Hub.utils.$('chorePriority').value : 'medium';
    if (!title) return Hub.ui.toast('Enter a title', 'error');

    var dayVal = this.DAY_MAP[category];

    try {
      await Hub.db.addChore({
        household_id: Hub.state.household_id,
        title: title,
        description: description || null,
        category: category,
        day_of_week: dayVal != null ? dayVal : null,
        priority: priority,
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
