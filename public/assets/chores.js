// ============================================================
// assets/chores.js — Chores management (Supabase)
// ============================================================
window.Hub = window.Hub || {};

Hub.chores = {
  /** Load and render chores list */
  async load() {
    const el = Hub.utils.$('choresList');
    if (!el || !Hub.state.household_id) return;

    try {
      const chores = await Hub.db.loadChoresWithCompleters(Hub.state.household_id);
      if (!chores.length) {
        el.innerHTML = '<div class="card text-center"><p class="text-gray-400">No chores yet. Click "+ Add Chore" to create one!</p></div>';
        return;
      }

      el.innerHTML = chores.map(c => {
        const prioClass = c.priority === 'high' ? 'bg-red-600' : c.priority === 'medium' ? 'bg-yellow-600' : 'bg-gray-600';
        const isDone = c.status === 'done';
        
        // Get completer first name
        let completerText = '';
        if (isDone && c.completer_email) {
          const firstName = c.completer_email.split('@')[0];
          completerText = `<p class="text-sm text-green-400 mt-2">✓ Completed by ${Hub.utils.esc(firstName)}</p>`;
        }
        
        return `
          <div class="card flex items-start justify-between ${isDone ? 'opacity-60' : ''}">
            <div class="flex-1">
              <h3 class="text-xl font-bold ${isDone ? 'line-through' : ''}">${Hub.utils.esc(c.title)}</h3>
              ${c.description ? `<p class="text-gray-400 mt-1">${Hub.utils.esc(c.description)}</p>` : ''}
              <div class="flex gap-2 mt-2">
                <span class="inline-block px-2 py-1 rounded text-xs ${prioClass}">${Hub.utils.esc(c.priority)}</span>
                ${c.due_date ? `<span class="inline-block px-2 py-1 rounded text-xs bg-gray-600">${c.due_date}</span>` : ''}
                <span class="inline-block px-2 py-1 rounded text-xs bg-gray-700">${Hub.utils.esc(c.status)}</span>
              </div>
              ${completerText}
            </div>
            <div class="flex gap-2 ml-4 flex-shrink-0">
              ${!isDone ? `<button onclick="Hub.chores.markDone('${c.id}')" class="btn btn-success text-sm">Done</button>` : ''}
              <button onclick="Hub.chores.remove('${c.id}')" class="btn btn-danger text-sm">Delete</button>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.error('Chores load error:', e);
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
