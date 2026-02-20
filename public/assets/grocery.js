// ============================================================
// public/assets/grocery.js — Grocery List
// Backend: Supabase grocery_items table with real-time sync
// Fallback: localStorage when no household loaded yet
// On-screen keyboard built-in (no native keyboard needed)
// ============================================================
window.Hub = window.Hub || {};

Hub.grocery = {
  _items:       [],
  _subscription: null,
  _kbTarget:    null,
  _shifted:     false,
  _loading:     false,

  init() {
    console.log('[Grocery] Init');
    // Nothing to do at init — load on page enter
  },

  async onEnter() {
    console.log('[Grocery] Page entered');
    this._loading = true;
    this._renderLoading();
    await this._load();
    this._subscribe();
  },

  onLeave() {
    this.closeKeyboard();
    this._unsubscribe();
  },

  // ── Data ─────────────────────────────────────────────────

  async _load() {
    const householdId = Hub.state?.household_id;
    if (!householdId) {
      // Fallback to localStorage if not yet in a household
      this._loadLocal();
      this.render();
      return;
    }
    try {
      this._items = await Hub.db.getGroceryItems(householdId);
    } catch (e) {
      console.error('[Grocery] Load error:', e);
      this._loadLocal(); // fallback
      Hub.ui?.toast?.('Using offline mode', 'error');
    }
    this._loading = false;
    this.render();
  },

  _loadLocal() {
    try { this._items = JSON.parse(localStorage.getItem('hub_grocery') || '[]'); }
    catch (_) { this._items = []; }
    this._loading = false;
  },

  _saveLocal() {
    localStorage.setItem('hub_grocery', JSON.stringify(this._items));
  },

  _subscribe() {
    const householdId = Hub.state?.household_id;
    if (!householdId || this._subscription) return;
    this._subscription = Hub.db.subscribeToGrocery(householdId, (payload) => {
      console.log('[Grocery] Realtime:', payload.eventType);
      // Refresh on any change from other devices
      Hub.db.getGroceryItems(householdId).then(items => {
        this._items = items;
        this.render();
      }).catch(() => {});
    });
  },

  _unsubscribe() {
    if (this._subscription) {
      Hub.sb?.removeChannel?.(this._subscription);
      this._subscription = null;
    }
  },

  get _useSupabase() {
    return !!Hub.state?.household_id && typeof Hub.db?.addGroceryItem === 'function';
  },

  // ── Render ───────────────────────────────────────────────

  _renderLoading() {
    const el = document.getElementById('groceryList');
    if (el) el.innerHTML = `
      <div class="space-y-3">
        ${[1,2,3].map(() => `<div class="skeleton" style="height:60px;border-radius:.75rem;"></div>`).join('')}
      </div>`;
  },

  render() {
    const el = document.getElementById('groceryList');
    if (!el) return;

    const pending   = this._items.filter(i => !i.done);
    const completed = this._items.filter(i =>  i.done);

    el.innerHTML = `
      <!-- Input row -->
      <div class="flex gap-2 mb-5">
        <div class="relative flex-1">
          <input id="groceryInput" type="text" placeholder="Add item…"
            class="input w-full pr-10"
            readonly
            onfocus="Hub.grocery.openKeyboard()"
            onclick="Hub.grocery.openKeyboard()"
            style="cursor:pointer;font-size:1rem;padding:.75rem 1rem;">
          <span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg pointer-events-none">⌨️</span>
        </div>
        <button onclick="Hub.grocery.addFromInput()"
          class="btn btn-primary px-6 text-base font-bold" style="min-width:80px;">+ Add</button>
      </div>

      <!-- Pending -->
      ${pending.length === 0 && completed.length === 0 ? `
        <div class="text-center text-gray-500 py-12">
          <div class="text-5xl mb-3">🛒</div>
          <p class="text-lg font-semibold">List is empty</p>
          <p class="text-sm mt-1">Tap the keyboard icon above to add items</p>
        </div>
      ` : ''}

      ${pending.length > 0 ? `
        <div class="space-y-2 mb-4">
          ${pending.map(item => this._itemHTML(item)).join('')}
        </div>
      ` : pending.length === 0 && completed.length > 0 ? `
        <div class="text-center text-green-400 py-4 mb-2">
          <p class="text-2xl mb-1">✅</p>
          <p class="font-semibold">All done!</p>
        </div>
      ` : ''}

      <!-- Completed -->
      ${completed.length > 0 ? `
        <div class="border-t border-gray-700 pt-4">
          <div class="flex items-center justify-between mb-3">
            <p class="text-sm font-semibold text-gray-400">✓ Completed (${completed.length})</p>
            <button onclick="Hub.grocery.clearCompleted()"
              class="btn btn-secondary text-xs px-3 py-1">Clear done</button>
          </div>
          <div class="space-y-2 opacity-55">
            ${completed.map(item => this._itemHTML(item)).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Bulk clear -->
      ${this._items.length > 0 ? `
        <div class="mt-6 pt-4 border-t border-gray-800 flex gap-2">
          <button onclick="Hub.grocery.clearCompleted()"
            class="btn btn-secondary text-sm flex-1">🗑 Clear Done</button>
          <button onclick="Hub.grocery.clearAll()"
            class="btn btn-secondary text-sm flex-1" style="color:#ef4444;border-color:rgba(239,68,68,.4);">
            🗑 Clear All
          </button>
        </div>
      ` : ''}
    `;
  },

  _itemHTML(item) {
    const done   = item.done;
    const textCls = done ? 'line-through text-gray-500' : 'text-white';
    const check   = done ? '✅' : '<div style="width:22px;height:22px;border:2px solid #4b5563;border-radius:4px;flex-shrink:0;"></div>';
    const who     = item.added_by_name ? `<span class="text-xs text-gray-600 ml-1">${Hub.utils.esc(item.added_by_name)}</span>` : '';
    return `
      <div class="card flex items-center gap-3 select-none active:opacity-70 transition-opacity"
           style="padding:.85rem 1rem;margin:0;cursor:pointer;"
           onclick="Hub.grocery.toggle('${item.id}')">
        <span class="text-xl flex-shrink-0" style="min-width:26px;display:flex;align-items:center;">${check}</span>
        <span class="flex-1 text-base ${textCls}">${Hub.utils.esc(item.text)}${who}</span>
        <button onclick="event.stopPropagation();Hub.grocery.remove('${item.id}')"
                class="text-gray-600 hover:text-red-400 transition-colors text-xl px-1 flex-shrink-0"
                style="background:none;border:none;cursor:pointer;line-height:1;">✕</button>
      </div>`;
  },

  // ── Actions ──────────────────────────────────────────────

  async addFromInput() {
    const input = document.getElementById('groceryInput');
    const text  = (input?.value || '').trim();
    if (!text) { Hub.ui?.toast?.('Enter an item first', 'error'); return; }

    if (input) input.value = '';
    this.closeKeyboard();

    const householdId = Hub.state?.household_id;

    if (this._useSupabase) {
      try {
        const item = await Hub.db.addGroceryItem(householdId, text);
        // Optimistically prepend; real-time will reconcile
        this._items.unshift(item);
        this.render();
      } catch (e) {
        console.error('[Grocery] Add error:', e);
        Hub.ui?.toast?.('Failed to add item', 'error');
        if (input) input.value = text; // restore
      }
    } else {
      // localStorage fallback
      this._items.unshift({ id: Date.now().toString(), text, done: false });
      this._saveLocal();
      this.render();
    }
  },

  async toggle(id) {
    const item = this._items.find(i => i.id === id);
    if (!item) return;
    const newDone = !item.done;
    item.done = newDone; // optimistic
    this.render();

    if (this._useSupabase) {
      try {
        await Hub.db.toggleGroceryItem(id, newDone);
      } catch (e) {
        item.done = !newDone; // rollback
        this.render();
        Hub.ui?.toast?.('Update failed', 'error');
      }
    } else {
      this._saveLocal();
    }
  },

  async remove(id) {
    const prev = [...this._items];
    this._items = this._items.filter(i => i.id !== id);
    this.render();

    if (this._useSupabase) {
      try {
        await Hub.db.deleteGroceryItem(id);
      } catch (e) {
        this._items = prev; // rollback
        this.render();
        Hub.ui?.toast?.('Delete failed', 'error');
      }
    } else {
      this._saveLocal();
    }
  },

  async clearCompleted() {
    const householdId = Hub.state?.household_id;
    const prev = [...this._items];
    this._items = this._items.filter(i => !i.done);
    this.render();

    if (this._useSupabase) {
      try {
        await Hub.db.clearCompletedGroceryItems(householdId);
      } catch (e) {
        this._items = prev;
        this.render();
        Hub.ui?.toast?.('Clear failed', 'error');
      }
    } else {
      this._saveLocal();
    }
  },

  async clearAll() {
    if (!confirm('Clear the entire grocery list?')) return;
    const householdId = Hub.state?.household_id;
    const prev = [...this._items];
    this._items = [];
    this.render();

    if (this._useSupabase) {
      try {
        await Hub.db.clearAllGroceryItems(householdId);
      } catch (e) {
        this._items = prev;
        this.render();
        Hub.ui?.toast?.('Clear failed', 'error');
      }
    } else {
      this._saveLocal();
    }
  },

  // ── On-screen keyboard ───────────────────────────────────

  openKeyboard(targetId) {
    this._kbTarget = targetId || 'groceryInput';

    let overlay = document.getElementById('oskOverlay');
    if (overlay) return; // already open

    overlay = document.createElement('div');
    overlay.id = 'oskOverlay';
    overlay.style.cssText = [
      'position:fixed;bottom:0;left:0;right:0;z-index:10000;',
      'background:linear-gradient(160deg,#0f172a,#151e30);',
      'border-top:1px solid rgba(255,255,255,.12);',
      'padding:10px 6px 18px;',
      'box-shadow:0 -12px 40px rgba(0,0,0,.7);',
    ].join('');
    document.body.appendChild(overlay);
    this._renderKeyboard(overlay);
  },

  _renderKeyboard(overlay) {
    const rows = [
      ['1','2','3','4','5','6','7','8','9','0'],
      ['q','w','e','r','t','y','u','i','o','p'],
      ['a','s','d','f','g','h','j','k','l'],
      ['⬆','z','x','c','v','b','n','m','⌫'],
      ['🥦','Space','.','!','?','✓'],
    ];

    const cap = (k) => {
      if (k.length !== 1) return k;
      return this._shifted ? k.toUpperCase() : k;
    };

    const keyStyle = (k) => {
      const wide    = k === 'Space' ? '140px' : k === '✓' ? '72px' : k === '⬆' ? '54px' : '42px';
      const bg      = k === '✓'  ? '#2563eb'
                    : k === '⌫'  ? '#7f1d1d'
                    : k === '⬆'  ? (this._shifted ? '#6d28d9' : '#374151')
                    : '#1e2d40';
      const border  = k === '✓' ? 'rgba(59,130,246,.5)' : 'rgba(255,255,255,.08)';
      return `min-width:${wide};height:50px;background:${bg};color:#f1f5f9;border:1px solid ${border};` +
             `border-radius:6px;font-size:${k==='Space'?'.72rem':'1rem'};font-weight:500;cursor:pointer;` +
             `flex-shrink:0;user-select:none;-webkit-user-select:none;transition:filter .08s,transform .08s;`;
    };

    overlay.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px 8px;">
        <div style="font-size:.75rem;color:#6b7280;letter-spacing:.05em;">ON-SCREEN KEYBOARD</div>
        <button onclick="Hub.grocery.closeKeyboard()"
          style="background:#374151;color:#fff;border:none;border-radius:.4rem;padding:.35rem .9rem;font-size:.8rem;cursor:pointer;">
          ✕ Close
        </button>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;">
        ${rows.map(row => `
          <div style="display:flex;gap:4px;justify-content:center;">
            ${row.map(key => `
              <button data-key="${key}" style="${keyStyle(key)}"
                onmousedown="event.preventDefault();Hub.grocery._keyTap('${key}')"
                ontouchstart="event.preventDefault();Hub.grocery._keyTap('${key}')"
                onmousedown="event.preventDefault();Hub.grocery._keyTap('${key}')"
              >${cap(key)}</button>`).join('')}
          </div>`).join('')}
      </div>`;
  },

  _keyTap(key) {
    const input = document.getElementById(this._kbTarget || 'groceryInput');
    if (!input) return;

    if (key === '✓') {
      this.addFromInput();
      return;
    }
    if (key === '⌫') {
      input.value = input.value.slice(0, -1);
      return;
    }
    if (key === '⬆') {
      this._shifted = !this._shifted;
      const overlay = document.getElementById('oskOverlay');
      if (overlay) this._renderKeyboard(overlay);
      return;
    }
    if (key === '🥦') {
      this._showEmojiPicker(input);
      return;
    }
    const char = key === 'Space' ? ' ' : (this._shifted && key.length === 1 ? key.toUpperCase() : key);
    input.value += char;
    if (this._shifted && key.length === 1) {
      this._shifted = false;
      const overlay = document.getElementById('oskOverlay');
      if (overlay) this._renderKeyboard(overlay);
    }
  },

  _showEmojiPicker(input) {
    document.getElementById('oskEmojiPicker')?.remove();
    const emojis = [
      '🥛','🥚','🍞','🧀','🥩','🍗','🐟','🥦','🥕','🧅','🧄',
      '🍅','🫐','🍓','🍎','🍌','🥑','🍋','🧃','☕','🍫','🍕',
      '🧈','🫙','🥫','🧻','🧽','🧴','🧹','🪣','🛒','🍷','🍺',
    ];
    const picker = document.createElement('div');
    picker.id = 'oskEmojiPicker';
    picker.style.cssText = [
      'position:fixed;bottom:262px;left:0;right:0;z-index:10001;',
      'background:#0f172a;border-top:1px solid rgba(255,255,255,.1);',
      'padding:10px 8px;display:flex;flex-wrap:wrap;gap:6px;justify-content:center;',
      'box-shadow:0 -4px 16px rgba(0,0,0,.5);',
    ].join('');
    picker.innerHTML = emojis.map(e => `
      <button style="font-size:1.8rem;background:none;border:none;cursor:pointer;padding:4px;line-height:1;"
        ontouchstart="event.preventDefault();document.getElementById('${this._kbTarget||'groceryInput'}').value+='${e}';document.getElementById('oskEmojiPicker').remove();"
        onclick="document.getElementById('${this._kbTarget||'groceryInput'}').value+='${e}';document.getElementById('oskEmojiPicker').remove();"
      >${e}</button>`).join('');
    document.body.appendChild(picker);
    setTimeout(() => picker?.remove?.(), 10000);
  },

  closeKeyboard() {
    document.getElementById('oskOverlay')?.remove();
    document.getElementById('oskEmojiPicker')?.remove();
    this._shifted = false;
  }
};
