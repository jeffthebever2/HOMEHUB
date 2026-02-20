// ============================================================
// public/assets/grocery.js — Grocery List  (v3)
//
// v3 changes:
//  - Keyboard rebuilt as single managed object (_kb)
//    → exactly ONE instance, fully destroyed on onLeave
//  - Hold-to-repeat backspace (350ms initial, 80ms repeat)
//  - Body scroll lock while keyboard is open
//  - Input scrolled into view on keyboard open
//  - Quick-chip row (configurable array) for common items
//  - Done key = close keyboard; Enter = submit item; Clear = clear input
//  - onLeave: keyboard destroyed, subscription removed, UI + state reset
//  - clearAll: replaced browser confirm() with modal (groceryClearModal)
// ============================================================
window.Hub = window.Hub || {};

Hub.grocery = {
  _items:        [],
  _subscription: null,
  _loading:      false,
  _kb:           null,   // single keyboard instance object

  _CHIPS: ['Milk','Eggs','Bread','Butter','Cheese','Chicken',
           'Apples','Bananas','Onions','Garlic','Rice','Pasta'],

  _EMOJIS: [
    '🥛','🥚','🍞','🧀','🥩','🍗','🐟','🥦','🥕','🧅','🧄',
    '🍅','🫐','🍓','🍎','🍌','🥑','🍋','🧃','☕','🍫','🍕',
    '🧈','🫙','🥫','🧻','🧽','🧴','🧹','🪣','🛒','🍷','🍺',
  ],

  init() { /* nothing — load deferred to onEnter */ },

  // ── Page lifecycle ────────────────────────────────────────

  async onEnter() {
    console.log('[Grocery] onEnter');
    this._loading = true;
    this._renderLoading();
    await this._load();
    this._subscribe();
  },

  onLeave() {
    console.log('[Grocery] onLeave — cleanup');
    this._destroyKeyboard();
    this._unsubscribe();
    this._items   = [];
    this._loading = false;
    // Clear UI so re-enter starts fresh (no stale rows visible)
    const el = document.getElementById('groceryList');
    if (el) el.innerHTML = '<p class="text-gray-400 text-center py-8">Loading…</p>';
  },

  // ── Data ─────────────────────────────────────────────────

  async _load() {
    const householdId = Hub.state && Hub.state.household_id;
    if (!householdId) { this._loadLocal(); this.render(); return; }
    try {
      this._items = await Hub.db.getGroceryItems(householdId);
    } catch (e) {
      console.error('[Grocery] Load error:', e);
      this._loadLocal();
      Hub.ui && Hub.ui.toast && Hub.ui.toast('Using offline mode', 'error');
    }
    this._loading = false;
    this.render();
  },

  _loadLocal() {
    try { this._items = JSON.parse(localStorage.getItem('hub_grocery') || '[]'); }
    catch (_) { this._items = []; }
    this._loading = false;
  },

  _saveLocal() { localStorage.setItem('hub_grocery', JSON.stringify(this._items)); },

  _subscribe() {
    const householdId = Hub.state && Hub.state.household_id;
    if (!householdId || this._subscription) return;
    this._subscription = Hub.db.subscribeToGrocery(householdId, function() {
      Hub.db.getGroceryItems(householdId).then(function(items) {
        Hub.grocery._items = items;
        Hub.grocery.render();
      }).catch(function() {});
    });
  },

  _unsubscribe() {
    if (this._subscription) {
      if (Hub.sb && Hub.sb.removeChannel) Hub.sb.removeChannel(this._subscription);
      this._subscription = null;
    }
  },

  get _useSupabase() {
    return !!(Hub.state && Hub.state.household_id && Hub.db && typeof Hub.db.addGroceryItem === 'function');
  },

  // ── Render ───────────────────────────────────────────────

  _renderLoading() {
    var el = document.getElementById('groceryList');
    if (el) el.innerHTML =
      '<div class="space-y-3">' +
      [1,2,3].map(function() { return '<div class="skeleton" style="height:60px;border-radius:.75rem;"></div>'; }).join('') +
      '</div>';
  },

  render() {
    var el = document.getElementById('groceryList');
    if (!el) return;
    var self = this;
    var pending   = this._items.filter(function(i) { return !i.done; });
    var completed = this._items.filter(function(i) { return  i.done; });

    var html = '';

    // Input row
    html += '<div class="flex gap-2 mb-5">' +
      '<div class="relative flex-1">' +
        '<input id="groceryInput" type="text" placeholder="Tap to type…"' +
        ' class="input w-full pr-10" readonly onclick="Hub.grocery.openKeyboard()"' +
        ' style="cursor:pointer;font-size:1rem;padding:.75rem 1rem;">' +
        '<span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" style="font-size:1.1rem;">&#9000;</span>' +
      '</div>' +
      '<button onclick="Hub.grocery.addFromInput()" class="btn btn-primary px-6 text-base font-bold" style="min-width:80px;">+ Add</button>' +
    '</div>';

    // Empty state
    if (pending.length === 0 && completed.length === 0) {
      html += '<div class="text-center text-gray-500 py-12">' +
        '<div class="text-5xl mb-3">🛒</div>' +
        '<p class="text-lg font-semibold">List is empty</p>' +
        '<p class="text-sm mt-1">Tap the keyboard icon to add items</p>' +
      '</div>';
    }

    // Pending
    if (pending.length > 0) {
      html += '<div class="space-y-2 mb-4">' + pending.map(function(item) { return self._itemHTML(item); }).join('') + '</div>';
    } else if (pending.length === 0 && completed.length > 0) {
      html += '<div class="text-center text-green-400 py-4 mb-2"><p class="text-2xl mb-1">✅</p><p class="font-semibold">All done!</p></div>';
    }

    // Completed
    if (completed.length > 0) {
      html += '<div class="border-t border-gray-700 pt-4">' +
        '<div class="flex items-center justify-between mb-3">' +
          '<p class="text-sm font-semibold text-gray-400">Done (' + completed.length + ')</p>' +
          '<button onclick="Hub.grocery.clearCompleted()" class="btn btn-secondary text-xs px-3 py-1">Clear done</button>' +
        '</div>' +
        '<div class="space-y-2 opacity-55">' + completed.map(function(item) { return self._itemHTML(item); }).join('') + '</div>' +
      '</div>';
    }

    // Bulk actions
    if (this._items.length > 0) {
      html += '<div class="mt-6 pt-4 border-t border-gray-800 flex gap-2">' +
        '<button onclick="Hub.grocery.clearCompleted()" class="btn btn-secondary text-sm flex-1">Clear Done</button>' +
        '<button onclick="Hub.grocery.confirmClearAll()" class="btn btn-secondary text-sm flex-1" style="color:#ef4444;border-color:rgba(239,68,68,.4);">Clear All</button>' +
      '</div>';
    }

    el.innerHTML = html;
  },

  _itemHTML(item) {
    var done    = item.done;
    var textCls = done ? 'line-through text-gray-500' : 'text-white';
    var check   = done
      ? '<span style="color:#22c55e;font-size:1.2rem;">✓</span>'
      : '<div style="width:22px;height:22px;border:2px solid #4b5563;border-radius:4px;flex-shrink:0;"></div>';
    var who = item.added_by_name
      ? '<span class="text-xs text-gray-600 ml-1">' + Hub.utils.esc(item.added_by_name) + '</span>' : '';
    return '<div class="card flex items-center gap-3 select-none active:opacity-70"' +
      ' style="padding:.85rem 1rem;margin:0;cursor:pointer;" onclick="Hub.grocery.toggle(\'' + item.id + '\')">' +
      '<span style="min-width:26px;display:flex;align-items:center;">' + check + '</span>' +
      '<span class="flex-1 text-base ' + textCls + '">' + Hub.utils.esc(item.text) + who + '</span>' +
      '<button onclick="event.stopPropagation();Hub.grocery.remove(\'' + item.id + '\')"' +
      ' class="text-gray-600 hover:text-red-400 text-xl px-1 flex-shrink-0"' +
      ' style="background:none;border:none;cursor:pointer;line-height:1;">✕</button>' +
    '</div>';
  },

  // ── Actions ──────────────────────────────────────────────

  async addFromInput() {
    var input = document.getElementById('groceryInput');
    var text  = (input && input.value || '').trim();
    if (!text) { Hub.ui && Hub.ui.toast && Hub.ui.toast('Enter an item first', 'error'); return; }
    if (input) input.value = '';
    this._destroyKeyboard();

    var householdId = Hub.state && Hub.state.household_id;
    if (this._useSupabase) {
      try {
        var item = await Hub.db.addGroceryItem(householdId, text);
        this._items.unshift(item);
        this.render();
      } catch (e) {
        Hub.ui && Hub.ui.toast && Hub.ui.toast('Failed to add item', 'error');
        if (input) input.value = text;
      }
    } else {
      this._items.unshift({ id: Date.now().toString(), text: text, done: false });
      this._saveLocal();
      this.render();
    }
  },

  async toggle(id) {
    var item = this._items.find(function(i) { return i.id === id; });
    if (!item) return;
    item.done = !item.done;
    this.render();
    if (this._useSupabase) {
      try { await Hub.db.toggleGroceryItem(id, item.done); }
      catch (e) { item.done = !item.done; this.render(); Hub.ui && Hub.ui.toast && Hub.ui.toast('Update failed', 'error'); }
    } else { this._saveLocal(); }
  },

  async remove(id) {
    var prev = this._items.slice();
    this._items = this._items.filter(function(i) { return i.id !== id; });
    this.render();
    if (this._useSupabase) {
      try { await Hub.db.deleteGroceryItem(id); }
      catch (e) { this._items = prev; this.render(); Hub.ui && Hub.ui.toast && Hub.ui.toast('Delete failed', 'error'); }
    } else { this._saveLocal(); }
  },

  async clearCompleted() {
    var prev = this._items.slice();
    this._items = this._items.filter(function(i) { return !i.done; });
    this.render();
    if (this._useSupabase) {
      try { await Hub.db.clearCompletedGroceryItems(Hub.state.household_id); }
      catch (e) { this._items = prev; this.render(); Hub.ui && Hub.ui.toast && Hub.ui.toast('Clear failed', 'error'); }
    } else { this._saveLocal(); }
  },

  confirmClearAll() {
    Hub.ui && Hub.ui.openModal && Hub.ui.openModal('groceryClearModal');
  },

  async confirmClearAllConfirmed() {
    Hub.ui && Hub.ui.closeModal && Hub.ui.closeModal('groceryClearModal');
    var prev = this._items.slice();
    this._items = [];
    this.render();
    if (this._useSupabase) {
      try {
        await Hub.db.clearAllGroceryItems(Hub.state.household_id);
        Hub.ui && Hub.ui.toast && Hub.ui.toast('Grocery list cleared', 'success');
      } catch (e) {
        this._items = prev; this.render();
        Hub.ui && Hub.ui.toast && Hub.ui.toast('Clear failed — please try again', 'error');
      }
    } else {
      this._saveLocal();
      Hub.ui && Hub.ui.toast && Hub.ui.toast('List cleared', 'success');
    }
  },

  // ── Keyboard ─────────────────────────────────────────────

  openKeyboard() {
    if (this._kb) return; // one instance only

    var root = document.createElement('div');
    root.id = 'groceryKeyboard';
    root.setAttribute('style', [
      'position:fixed;bottom:0;left:0;right:0;z-index:10000;',
      'background:linear-gradient(160deg,#0f1a2e,#111c30);',
      'border-top:1px solid rgba(255,255,255,.1);',
      'padding:8px 6px 16px;',
      'box-shadow:0 -12px 40px rgba(0,0,0,.7);',
      'user-select:none;-webkit-user-select:none;',
    ].join(''));

    this._kb = { root: root, _bsTimer: null, _bsInterval: null, _shifted: false };
    this._renderKbContent();
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(function() {
      var inp = document.getElementById('groceryInput');
      if (inp) inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  },

  _renderKbContent() {
    var kb = this._kb;
    if (!kb) return;
    var self    = this;
    var shifted = kb._shifted;

    var cap = function(k) { return (k.length === 1 && shifted) ? k.toUpperCase() : k; };

    var keyStyle = function(k) {
      var w   = k === 'Space' ? '110px' : k === 'Enter' ? '80px' : k === 'Bksp' ? '68px'
              : k === 'Shift' ? '58px'  : k === 'Done'  ? '68px' : k === 'Clear' ? '56px' : '38px';
      var bg  = k === 'Enter' ? '#1d4ed8'
              : k === 'Bksp'  ? '#7f1d1d'
              : k === 'Shift' ? (shifted ? '#6d28d9' : '#334155')
              : k === 'Done'  ? '#065f46'
              : k === 'Clear' ? '#374151'
              : '#1e2d40';
      var bdr = k === 'Enter' ? 'rgba(59,130,246,.4)' : 'rgba(255,255,255,.07)';
      return 'min-width:' + w + ';height:52px;background:' + bg + ';color:#f1f5f9;' +
             'border:1px solid ' + bdr + ';border-radius:7px;font-size:.9rem;font-weight:500;cursor:pointer;' +
             'flex-shrink:0;transition:filter .07s;';
    };

    var rows = [
      ['1','2','3','4','5','6','7','8','9','0'],
      ['q','w','e','r','t','y','u','i','o','p'],
      ['a','s','d','f','g','h','j','k','l'],
      ['Shift','z','x','c','v','b','n','m','Bksp'],
      ['Clear','Space','.','!','?','Emoji','Enter'],
    ];

    var chipRow = '<div style="display:flex;gap:5px;overflow-x:auto;padding:0 2px 7px;scrollbar-width:none;">' +
      this._CHIPS.map(function(c) {
        return '<button style="height:34px;padding:0 12px;background:#1e2d40;color:#94a3b8;border:1px solid rgba(255,255,255,.08);' +
          'border-radius:999px;font-size:.78rem;white-space:nowrap;flex-shrink:0;cursor:pointer;"' +
          ' onmousedown="event.preventDefault();Hub.grocery._kbChip(\'' + Hub.utils.esc(c) + '\')"' +
          ' ontouchstart="event.preventDefault();Hub.grocery._kbChip(\'' + Hub.utils.esc(c) + '\')">' +
          Hub.utils.esc(c) + '</button>';
      }).join('') +
    '</div>';

    var previewRow = '<div style="display:flex;align-items:center;gap:6px;padding:0 4px 8px;">' +
      '<div id="kbPreview" style="flex:1;min-height:40px;background:#0f172a;border:1px solid rgba(255,255,255,.12);' +
      'border-radius:8px;padding:8px 12px;font-size:1rem;color:#f1f5f9;word-break:break-word;"></div>' +
      '<button onmousedown="event.preventDefault();Hub.grocery._destroyKeyboard()"' +
      ' ontouchstart="event.preventDefault();Hub.grocery._destroyKeyboard()"' +
      ' style="background:#1e293b;color:#9ca3af;border:1px solid rgba(255,255,255,.1);' +
      'border-radius:.5rem;padding:.4rem .85rem;font-size:.82rem;cursor:pointer;">Done</button>' +
    '</div>';

    var kbHtml = rows.map(function(row) {
      return '<div style="display:flex;gap:4px;justify-content:center;margin-bottom:4px;">' +
        row.map(function(key) {
          var label = key === 'Bksp'  ? '&#x232B;'
                    : key === 'Shift' ? (shifted ? '&#9650;' : '&#9650;')
                    : key === 'Enter' ? '&#8629; Add'
                    : key === 'Clear' ? 'Clr'
                    : key === 'Space' ? 'Space'
                    : key === 'Emoji' ? ':)'
                    : cap(key);

          if (key === 'Bksp') {
            return '<button data-key="Bksp" style="' + keyStyle(key) + '"' +
              ' onmousedown="event.preventDefault();Hub.grocery._kbBsDown()"' +
              ' onmouseup="Hub.grocery._kbBsUp()"' +
              ' onmouseleave="Hub.grocery._kbBsUp()"' +
              ' ontouchstart="event.preventDefault();Hub.grocery._kbBsDown()"' +
              ' ontouchend="Hub.grocery._kbBsUp()"' +
              ' ontouchcancel="Hub.grocery._kbBsUp()">' + label + '</button>';
          }
          return '<button data-key="' + key + '" style="' + keyStyle(key) + '"' +
            ' onmousedown="event.preventDefault();Hub.grocery._kbTap(\'' + key + '\')"' +
            ' ontouchstart="event.preventDefault();Hub.grocery._kbTap(\'' + key + '\')">' +
            label + '</button>';
        }).join('') +
      '</div>';
    }).join('');

    kb.root.innerHTML = previewRow + chipRow + '<div style="padding:0 2px;">' + kbHtml + '</div>';
    this._kbSyncPreview();
  },

  _kbSyncPreview() {
    var input   = document.getElementById('groceryInput');
    var preview = document.getElementById('kbPreview');
    if (preview && input) preview.textContent = input.value || '';
  },

  _kbTap(key) {
    var input = document.getElementById('groceryInput');
    if (!input) return;
    var kb = this._kb;

    if (key === 'Enter') { this.addFromInput(); return; }
    if (key === 'Done')  { this._destroyKeyboard(); return; }
    if (key === 'Clear') { input.value = ''; this._kbSyncPreview(); return; }
    if (key === 'Shift') {
      if (kb) { kb._shifted = !kb._shifted; this._renderKbContent(); }
      return;
    }
    if (key === 'Emoji') { this._kbShowEmoji(input); return; }
    if (key === 'Space') { input.value += ' '; this._kbSyncPreview(); return; }

    var char = (kb && kb._shifted && key.length === 1) ? key.toUpperCase() : key;
    input.value += char;
    if (kb && kb._shifted && key.length === 1) {
      kb._shifted = false;
      this._renderKbContent();
    } else {
      this._kbSyncPreview();
    }
  },

  _kbChip(word) {
    var input = document.getElementById('groceryInput');
    if (!input) return;
    input.value = word;
    this._kbSyncPreview();
  },

  _kbBsDown() {
    var input = document.getElementById('groceryInput');
    if (!input || !this._kb) return;
    var del = function() {
      input.value = input.value.slice(0, -1);
      Hub.grocery._kbSyncPreview();
    };
    del();
    this._kb._bsTimer = setTimeout(function() {
      Hub.grocery._kb && (Hub.grocery._kb._bsInterval = setInterval(del, 80));
    }, 350);
  },

  _kbBsUp() {
    if (!this._kb) return;
    clearTimeout(this._kb._bsTimer);
    clearInterval(this._kb._bsInterval);
    this._kb._bsTimer = null;
    this._kb._bsInterval = null;
  },

  _kbShowEmoji(input) {
    document.getElementById('groceryEmojiPicker') && document.getElementById('groceryEmojiPicker').remove();
    var picker = document.createElement('div');
    picker.id = 'groceryEmojiPicker';
    picker.setAttribute('style', [
      'position:fixed;bottom:260px;left:0;right:0;z-index:10001;',
      'background:#0f172a;border-top:1px solid rgba(255,255,255,.1);',
      'padding:10px 8px;display:flex;flex-wrap:wrap;gap:6px;justify-content:center;',
    ].join(''));
    picker.innerHTML = this._EMOJIS.map(function(e) {
      return '<button style="font-size:1.8rem;background:none;border:none;cursor:pointer;padding:4px;"' +
        ' onmousedown="event.preventDefault();' +
          'document.getElementById(\'groceryInput\').value+=\'' + e + '\';' +
          'Hub.grocery._kbSyncPreview();' +
          'var p=document.getElementById(\'groceryEmojiPicker\');p&&p.remove();"' +
        ' ontouchstart="event.preventDefault();' +
          'document.getElementById(\'groceryInput\').value+=\'' + e + '\';' +
          'Hub.grocery._kbSyncPreview();' +
          'var p=document.getElementById(\'groceryEmojiPicker\');p&&p.remove();">' +
        e + '</button>';
    }).join('');
    document.body.appendChild(picker);
    setTimeout(function() { var p = document.getElementById('groceryEmojiPicker'); if (p) p.remove(); }, 12000);
  },

  _destroyKeyboard() {
    if (!this._kb) return;
    clearTimeout(this._kb._bsTimer);
    clearInterval(this._kb._bsInterval);
    if (this._kb.root && this._kb.root.parentNode) this._kb.root.parentNode.removeChild(this._kb.root);
    var ep = document.getElementById('groceryEmojiPicker');
    if (ep) ep.remove();
    this._kb = null;
    document.body.style.overflow = '';
  },

  closeKeyboard() { this._destroyKeyboard(); }
};
