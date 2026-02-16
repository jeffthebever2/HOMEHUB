# TREATS.JS UPDATES - Timestamp Support & Recent History

## 1. Add timestamp when adding treats (around line 397)

FIND:
```javascript
      // Add new item
      const newItem = {
        id: Date.now().toString(),
        catalogId: treatId,
        name: treatName,
        kcalPerUnit: calories,
        qty: 1,
        unitLabel: treat.unitLabel || 'unit',
        step: treat.step || 1,
        type: 'catalog',
        imageUrl: treat.imageUrl || ''
      };
```

REPLACE with:
```javascript
      // Add new item with timestamp
      const newItem = {
        id: Date.now().toString(),
        catalogId: treatId,
        name: treatName,
        kcalPerUnit: calories,
        qty: 1,
        unitLabel: treat.unitLabel || 'unit',
        step: treat.step || 1,
        type: 'catalog',
        imageUrl: treat.imageUrl || '',
        ts: Date.now()  // ADD TIMESTAMP
      };
```

## 2. Update renderDashboardWidget to filter by timestamp and show recent history (around line 220)

FIND:
```javascript
      // Calculate treats from items (these should be automatically added by recurring treats)
      const items = familyData.items || [];
      const treatCalories = items.reduce((sum, item) => {
        const calories = (item.kcalPerUnit || 0) * (item.qty || 0);
        return sum + calories;
      }, 0);
```

REPLACE with:
```javascript
      // Calculate treats from items - only count TODAY's treats
      const items = familyData.items || [];
      const todayStart = new Date().setHours(0, 0, 0, 0);
      
      // Filter to today's treats using timestamp
      const todayItems = items.filter(item => {
        // If item has timestamp, use it
        if (item.ts) {
          return item.ts >= todayStart;
        }
        // Fallback: try to infer from numeric ID (if ID is timestamp-based)
        if (item.id && !isNaN(item.id)) {
          return parseInt(item.id) >= todayStart;
        }
        // Old items without timestamp - exclude to be safe
        return false;
      });
      
      const treatCalories = todayItems.reduce((sum, item) => {
        const calories = (item.kcalPerUnit || 0) * (item.qty || 0);
        return sum + calories;
      }, 0);
```

## 3. Add recent treats history to dashboard widget (around line 318, before closing div)

FIND:
```javascript
            </div>
          </div>
        </div>
      `;
```

REPLACE with:
```javascript
            </div>
          </div>
          
          <!-- Recent Treats History -->
          ${todayItems.length > 0 ? `
            <div class="mt-4 pt-4 border-t border-gray-700">
              <h4 class="font-semibold text-sm mb-2">Recent Treats</h4>
              <div class="space-y-2">
                ${todayItems.slice(-5).reverse().map(item => {
                  const time = item.ts ? new Date(item.ts).toLocaleTimeString('en-US', { 
                    hour: 'numeric',
                    minute: '2-digit'
                  }) : 'Unknown time';
                  const calories = Math.round((item.kcalPerUnit || 0) * (item.qty || 1));
                  
                  return `
                    <div class="flex items-center justify-between text-xs">
                      <div class="flex items-center gap-2 flex-1 min-w-0">
                        <span class="text-gray-500">${time}</span>
                        <span class="font-medium truncate">${Hub.utils.esc(item.name)}</span>
                      </div>
                      <span class="text-gray-400 flex-shrink-0">${calories} cal</span>
                    </div>
                  `;
                }).join('')}
              </div>
              <a href="#/treats" class="text-blue-400 hover:text-blue-300 text-xs mt-2 inline-block">
                View full history →
              </a>
            </div>
          ` : ''}
        </div>
      `;
```

## 4. Add helper method for getting time ago (optional enhancement)

Add this method to Hub.treats object:

```javascript
  /** Format timestamp to relative time */
  _formatTimeAgo(timestamp) {
    if (!timestamp) return 'Unknown time';
    
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleTimeString('en-US', { 
      hour: 'numeric',
      minute: '2-digit'
    });
  },
```

Then you can use it in the history display:
```javascript
const time = this._formatTimeAgo(item.ts);
```

## 5. Optional: Add 7-day sparkline for calorie tracking

Add this after the recent treats section:

```javascript
          <!-- 7-Day Calorie Sparkline -->
          <div class="mt-4 pt-4 border-t border-gray-700">
            <h4 class="font-semibold text-sm mb-2">Past Week</h4>
            <div class="flex items-end gap-1 h-12">
              ${this._renderWeekSparkline(items, limit)}
            </div>
          </div>
```

And add the sparkline rendering method:

```javascript
  /** Render 7-day calorie sparkline */
  _renderWeekSparkline(items, limit) {
    const days = [];
    const now = new Date();
    
    // Get last 7 days
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(now.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      
      // Calculate calories for this day
      const dayItems = items.filter(item => {
        const ts = item.ts || (item.id && !isNaN(item.id) ? parseInt(item.id) : 0);
        return ts >= dayStart.getTime() && ts <= dayEnd.getTime();
      });
      
      const calories = dayItems.reduce((sum, item) => 
        sum + ((item.kcalPerUnit || 0) * (item.qty || 1)), 0
      );
      
      days.push({
        day: dayStart.toLocaleDateString('en-US', { weekday: 'short' }).substring(0, 1),
        calories,
        percent: Math.min((calories / limit) * 100, 100)
      });
    }
    
    return days.map(d => {
      const color = d.percent >= 100 ? '#ef4444' : 
                    d.percent >= 80 ? '#f59e0b' : 
                    d.percent >= 50 ? '#84cc16' : '#22c55e';
      
      return `
        <div class="flex-1 flex flex-col items-center gap-1">
          <div class="w-full bg-gray-700 rounded" style="height: ${Math.max(d.percent, 5)}%; background: ${color};"></div>
          <span class="text-xs text-gray-500">${d.day}</span>
        </div>
      `;
    }).join('');
  },
```

These changes will:
1. Add timestamp to all new treats
2. Only count today's treats in calorie calculations (using timestamp)
3. Show last 5 treats in dashboard widget with time
4. Add optional 7-day calorie sparkline
5. Provide backward compatibility for old treats without timestamps
