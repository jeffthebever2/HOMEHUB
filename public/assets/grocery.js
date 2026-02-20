// ============================================================
// public/assets/grocery.js — Grocery List with on-screen keyboard
// All data stored in localStorage — no DB needed
// ============================================================
window.Hub = window.Hub || {};

Hub.grocery = {
  _items: [],
  _kbTarget: null,

  init() {
    this._load();
    console.log('[Grocery] Ready');
  },

  onEnter() {
    this._load();
    this.render();
  },

  _load() {
    try {
      this._items = JSON.parse(localStorage.getItem('hub_grocery') || '[]');
    } catch (_) { this._items = []; }
  },

  _save() {
    localStorage.setItem('hub_grocery', JSON.stringify(this._items));
  },

  render() {
    const el = document.getElementById('groceryList');
    if (!el) return;

    const pending   = this._items.filter(i => !i.done);
    const completed = this._items.filter(i =>  i.done);

    el.innerHTML = `
      <!-- Add item bar -->
      <div class="flex gap-2 mb-4">
        <input id="groceryInput" type="text" placeholder="Add item…" class="input flex-1"
               readonly onfocus="Hub.grocery.openKeyboard()"
               style="cursor:pointer;caret-color:transparent;">
        <button onclick="Hub.grocery.addFromInput()" class="btn btn-primary px-5">+ Add</button>
      </div>

      <!-- Pending items -->
      ${pending.length === 0 ? `
        <div class="text-center text-gray-500 py-8">
          <div class="text-4xl mb-2">🛒</div>
          <p>Your list is empty — tap + Add to get started</p>
        </div>
      ` : `
        <div class="space-y-2 mb-6">
          ${pending.map(item => this._itemHTML(item)).join('')}
        </div>
      `}

      <!-- Completed -->
      ${completed.length > 0 ? `
        <div class="border-t border-gray-700 pt-4">
          <div class="flex items-center justify-between mb-2">
            <p class="text-sm font-semibold text-gray-400">✓ Completed (${completed.length})</p>
            <button onclick="Hub.grocery.clearCompleted()" class="text-xs text-red-400 hover:text-red-300">Clear all</button>
          </div>
          <div class="space-y-2 opacity-60">
            ${completed.map(item => this._itemHTML(item)).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Bulk actions -->
      ${this._items.length > 0 ? `
        <div class="flex gap-2 mt-6">
          <button onclick="Hub.grocery.clearCompleted()" class="btn btn-secondary text-sm flex-1">🗑 Clear Done</button>
          <button onclick="Hub.grocery.clearAll()" class="btn btn-danger text-sm flex-1">🗑 Clear All</button>
        </div>
      ` : ''}
    `;
  },

  _itemHTML(item) {
    const strikeClass = item.done ? 'line-through text-gray-500' : '';
    const checkIcon   = item.done ? '✅' : '⬜';
    return `
      <div class="card flex items-center gap-3 py-3 cursor-pointer select-none"
           style="padding:0.75rem 1rem;margin-bottom:0;"
           onclick="Hub.grocery.toggle('${item.id}')">
        <span class="text-xl flex-shrink-0">${checkIcon}</span>
        <span class="flex-1 text-base ${strikeClass}">${Hub.utils.esc(item.text)}</span>
        <button onclick="event.stopPropagation();Hub.grocery.remove('${item.id}')"
                class="text-gray-500 hover:text-red-400 text-lg px-2">✕</button>
      </div>`;
  },

  addFromInput() {
    const input = document.getElementById('groceryInput');
    const text  = (input?.value || '').trim();
    if (!text) return;
    this._items.unshift({ id: Date.now().toString(), text, done: false });
    this._save();
    if (input) input.value = '';
    this.closeKeyboard();
    this.render();
  },

  toggle(id) {
    const item = this._items.find(i => i.id === id);
    if (item) { item.done = !item.done; this._save(); this.render(); }
  },

  remove(id) {
    this._items = this._items.filter(i => i.id !== id);
    this._save();
    this.render();
  },

  clearCompleted() {
    this._items = this._items.filter(i => !i.done);
    this._save();
    this.render();
  },

  clearAll() {
    if (!confirm('Clear the entire grocery list?')) return;
    this._items = [];
    this._save();
    this.render();
  },

  // ── On-screen keyboard ──────────────────────────────────────

  openKeyboard(targetId) {
    this._kbTarget = targetId || 'groceryInput';
    let overlay = document.getElementById('oskOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'oskOverlay';
      overlay.style.cssText = `
        position:fixed;bottom:0;left:0;right:0;z-index:10000;
        background:linear-gradient(145deg,#151B2B,#1A2235);
        border-top:1px solid rgba(255,255,255,.1);
        padding:12px 8px 20px;
        box-shadow:0 -8px 32px rgba(0,0,0,.6);
      `;
      document.body.appendChild(overlay);
    }

    const rows = [
      ['1','2','3','4','5','6','7','8','9','0'],
      ['q','w','e','r','t','y','u','i','o','p'],
      ['a','s','d','f','g','h','j','k','l'],
      ['⬆','z','x','c','v','b','n','m','⌫'],
      ['🌟','Space','.',',','!','?','✓']
    ];

    let shifted = false;

    const renderKeys = () => {
      overlay.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding:0 4px;">
          <div style="font-size:.8rem;color:#6b7280;">On-Screen Keyboard</div>
          <button onclick="Hub.grocery.closeKeyboard()"
            style="background:#374151;color:#fff;border:none;border-radius:.4rem;padding:.3rem .8rem;font-size:.85rem;cursor:pointer;">✕ Close</button>
        </div>
        <div id="oskKeys" style="display:flex;flex-direction:column;gap:6px;">
          ${rows.map((row, ri) => `
            <div style="display:flex;gap:5px;justify-content:center;">
              ${row.map(key => {
                const label = (key !== '⬆' && key !== '⌫' && key !== 'Space' && key !== '🌟' && key !== '✓' && shifted && key.length === 1)
                  ? key.toUpperCase() : key;
                const wide = key === 'Space' ? '160px' : key === '✓' ? '80px' : '44px';
                const bg   = key === '✓'  ? '#3b82f6'
                           : key === '⌫'  ? '#ef4444'
                           : key === '⬆'  ? (shifted ? '#8b5cf6' : '#374151')
                           : '#1E2738';
                return `<button
                  data-key="${key}"
                  style="min-width:${wide};height:48px;background:${bg};color:#fff;border:1px solid rgba(255,255,255,.08);
                    border-radius:.4rem;font-size:${key === 'Space' ? '.7rem' : '1rem'};font-weight:500;cursor:pointer;
                    flex-shrink:0;transition:background .1s;"
                  onmousedown="Hub.grocery._keyTap('${key}')"
                  ontouchstart="event.preventDefault();Hub.grocery._keyTap('${key}')"
                >${label}</button>`;
              }).join('')}
            </div>
          `).join('')}
        </div>
      `;
    };

    this._shifted = false;
    renderKeys();

    this._keyTap = (key) => {
      const input = document.getElementById(this._kbTarget);
      if (!input) return;
      if (key === '✓') { this.addFromInput(); return; }
      if (key === '⌫') { input.value = input.value.slice(0, -1); return; }
      if (key === '⬆') { this._shifted = !this._shifted; renderKeys(); return; }
      if (key === '🌟') { this._insertEmoji(input); return; }
      const char = key === 'Space' ? ' ' : (this._shifted && key.length === 1 ? key.toUpperCase() : key);
      input.value += char;
      if (this._shifted && key.length === 1) { this._shifted = false; renderKeys(); }
    };
  },

  _insertEmoji(input) {
    const emojis = ['🥛','🥚','🍞','🧀','🥩','🍎','🍌','🥦','🥕','🧅','🧄','🍅','🫐','🍓','🍇','🥑','🍋','🧃','☕','🍫','🍕','🧈','🫙','🥫','🧻','🧽','🧴','🛒'];
    const picker = document.createElement('div');
    picker.style.cssText = `position:fixed;bottom:260px;left:0;right:0;z-index:10001;
      background:#1A2235;border-top:1px solid rgba(255,255,255,.1);padding:12px;
      display:flex;flex-wrap:wrap;gap:8px;justify-content:center;`;
    picker.innerHTML = emojis.map(e =>
      `<button style="font-size:1.8rem;background:none;border:none;cursor:pointer;padding:4px;"
        ontouchstart="event.preventDefault();document.getElementById('${this._kbTarget}').value+='${e}';this.parentElement.remove();"
        onclick="document.getElementById('${this._kbTarget}').value+='${e}';this.parentElement.remove();"
      >${e}</button>`
    ).join('');
    document.body.appendChild(picker);
    setTimeout(() => picker.remove(), 8000);
  },

  closeKeyboard() {
    document.getElementById('oskOverlay')?.remove();
    const input = document.getElementById(this._kbTarget || 'groceryInput');
    if (input) input.blur();
  },

  onLeave() {
    this.closeKeyboard();
  }
};
