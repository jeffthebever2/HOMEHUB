# CHORES.JS UI IMPROVEMENTS

## 1. Add confetti function at the top of Hub.chores object (after familyMembers)

```javascript
  /** Lightweight confetti burst on chore completion */
  _createConfetti(x, y) {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ec4899'];
    const particles = 15;
    
    for (let i = 0; i < particles; i++) {
      const particle = document.createElement('div');
      particle.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        width: 8px;
        height: 8px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        border-radius: 50%;
        pointer-events: none;
        z-index: 9999;
      `;
      
      document.body.appendChild(particle);
      
      const angle = (Math.PI * 2 * i) / particles;
      const velocity = 3 + Math.random() * 3;
      const vx = Math.cos(angle) * velocity;
      const vy = Math.sin(angle) * velocity - 2;
      
      let posX = x;
      let posY = y;
      let gravity = 0.3;
      let velocityY = vy;
      
      const animate = () => {
        posX += vx;
        posY += velocityY;
        velocityY += gravity;
        
        particle.style.left = posX + 'px';
        particle.style.top = posY + 'px';
        particle.style.opacity = Math.max(0, 1 - (posY - y) / 200);
        
        if (posY < window.innerHeight && parseFloat(particle.style.opacity) > 0) {
          requestAnimationFrame(animate);
        } else {
          particle.remove();
        }
      };
      
      requestAnimationFrame(animate);
    }
  },

  /** Get category icon and color */
  _getCategoryIcon(category) {
    if (!category || category === 'Other') {
      return '<span class="chore-icon weekly"></span>';
    }
    
    if (category === 'Daily') {
      return '<span class="chore-icon daily"></span>';
    }
    
    // Weekly chores
    return '<span class="chore-icon weekly"></span>';
  },
```

## 2. Update renderDashboard method - add category icons (around line 88)

FIND:
```javascript
      html += todayPending.slice(0, 5).map(function (c) {
        return '<div class="flex items-center justify-between py-3 border-b border-gray-700 last:border-0">' +
          '<div class="flex-1 min-w-0 pr-3">' +
            '<p class="text-sm font-semibold truncate">' + Hub.utils.esc(c.title) + '</p>' +
            '<p class="text-xs text-gray-500">' + Hub.utils.esc(c.category || c.priority || 'General') + '</p>' +
```

REPLACE with:
```javascript
      html += todayPending.slice(0, 5).map(function (c) {
        var icon = Hub.chores._getCategoryIcon(c.category);
        return '<div class="flex items-center justify-between py-3 border-b border-gray-700 last:border-0">' +
          '<div class="flex-1 min-w-0 pr-3">' +
            '<p class="text-sm font-semibold truncate">' + icon + Hub.utils.esc(c.title) + '</p>' +
            '<p class="text-xs text-gray-500">' + Hub.utils.esc(c.category || c.priority || 'General') + '</p>' +
```

## 3. Update load method - add progress bars per category (around line 187)

FIND:
```javascript
      el.innerHTML = sortedCategories.map(function (category) {
        var list = grouped[category];
        var pending = list.filter(function (c) { return c.status !== 'done'; });
        var done = list.filter(function (c) { return c.status === 'done'; });

        return '<div class="mb-8">' +
          '<div class="flex items-center justify-between mb-4">' +
            '<h2 class="text-2xl font-bold">' + Hub.utils.esc(category) + '</h2>' +
            '<span class="text-sm text-gray-400">' + pending.length + ' pending / ' + list.length + ' total</span>' +
          '</div>' +
```

REPLACE with:
```javascript
      el.innerHTML = sortedCategories.map(function (category) {
        var list = grouped[category];
        var pending = list.filter(function (c) { return c.status !== 'done'; });
        var done = list.filter(function (c) { return c.status === 'done'; });
        var pct = list.length > 0 ? Math.round((done.length / list.length) * 100) : 0;
        var progressColor = pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : 'bg-yellow-500';

        return '<div class="mb-8">' +
          '<div class="flex items-center justify-between mb-2">' +
            '<h2 class="text-2xl font-bold">' + Hub.chores._getCategoryIcon(category) + Hub.utils.esc(category) + '</h2>' +
            '<span class="text-sm text-gray-400">' + done.length + '/' + list.length + ' done</span>' +
          '</div>' +
          '<div class="progress-bar mb-4" style="height:0.5rem;">' +
            '<div class="progress-fill ' + progressColor + '" style="width:' + pct + '%"></div>' +
          '</div>' +
```

## 4. Update _renderChoreCard method - custom checkbox with animation (around line 217)

FIND:
```javascript
          '<div class="flex items-start justify-between gap-4">' +
            '<div class="flex-1 min-w-0">' +
              '<div class="flex items-start gap-3">' +
                '<input type="checkbox" ' + (isDone ? 'checked' : '') +
                  ' onchange="Hub.chores.toggleChore(\'' + c.id + '\', this.checked, this)"' +
                  ' class="mt-1 w-5 h-5 rounded border-gray-600 bg-gray-700 checked:bg-green-600 cursor-pointer flex-shrink-0">' +
```

REPLACE with:
```javascript
          '<div class="flex items-start justify-between gap-4">' +
            '<div class="flex-1 min-w-0">' +
              '<div class="flex items-start gap-3">' +
                '<div class="chore-checkbox ' + (isDone ? 'checked' : '') + ' mt-1 flex-shrink-0" ' +
                  'onclick="Hub.chores.toggleChore(\'' + c.id + '\', !' + isDone + ', this)" ' +
                  'role="checkbox" aria-checked="' + isDone + '" tabindex="0"></div>' +
```

## 5. Update _renderChoreCard - hover-reveal edit/delete buttons (around line 231)

FIND:
```javascript
        '<div class="flex gap-2 flex-shrink-0">' +
          '<button onclick="Hub.chores.editChore(\'' + c.id + '\')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-semibold transition-colors" title="Edit">✏️</button>' +
          '<button onclick="Hub.chores.remove(\'' + c.id + '\')" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg font-semibold transition-colors" title="Delete">🗑️</button>' +
        '</div>' +
```

REPLACE with:
```javascript
        '<div class="flex gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style="opacity: 1;">' +
          '<button onclick="Hub.chores.editChore(\'' + c.id + '\')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-semibold transition-all hover:scale-105" title="Edit">✏️</button>' +
          '<button onclick="Hub.chores.remove(\'' + c.id + '\')" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg font-semibold transition-all hover:scale-105" title="Delete">🗑️</button>' +
        '</div>' +
```

And update the card wrapper div:
```javascript
    return '<div class="card group ' + (isDone ? 'opacity-60 bg-gray-800' : '') + '">' +
```

## 6. Update toggleChore method - add confetti on completion (around line 240)

FIND:
```javascript
  async toggleChore(choreId, checked, checkbox) {
    if (checked) {
      var name = await this.askWhoDidIt();
      if (!name) {
        if (checkbox) checkbox.checked = false;
        return;
      }
      await this.markDone(choreId, name);
```

REPLACE with:
```javascript
  async toggleChore(choreId, checked, element) {
    if (checked) {
      var name = await this.askWhoDidIt();
      if (!name) {
        if (element && element.classList) {
          element.classList.remove('checked');
          element.setAttribute('aria-checked', 'false');
        }
        return;
      }
      
      // Add confetti burst
      if (element) {
        var rect = element.getBoundingClientRect();
        this._createConfetti(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2
        );
      }
      
      await this.markDone(choreId, name);
```

AND update the unchecking part:
```javascript
    } else {
      await Hub.db.updateChore(choreId, { status: 'pending', completed_by_name: null });
```

## 7. Add CSS for group hover in index.html (if not already present)

The `.group-hover:opacity-100` utility needs the parent to have `.group` class, which we added above.

These changes will:
1. Add lightweight confetti animation on chore completion
2. Show category icons with color dots
3. Add progress bars for each category
4. Use custom animated checkboxes
5. Make edit/delete buttons hover-reveal (with fallback for mobile)
6. Improve overall visual polish and micro-interactions
