// ============================================================
// assets/standby.js — Standby / Ambient Mode
// ============================================================
window.Hub = window.Hub || {};

Hub.standby = {
  _clockInterval: null,
  _weatherInterval: null,
  _dataInterval: null,

  /** Start standby mode */
  start() {
    console.log('[Standby] Starting standby mode');
    
    // Update clock immediately and every second
    this._updateClock();
    this._clockInterval = setInterval(() => this._updateClock(), 1000);

    // Load initial data
    this._loadWeather();
    this._loadCalendar();
    this._loadChores();

    // Refresh data every 5 minutes
    this._dataInterval = setInterval(() => {
      this._loadWeather();
      this._loadCalendar();
      this._loadChores();
    }, 300000);

    // Start photo slideshow (unified provider — picks Google / Imgur / Immich per settings)
    Hub.photos.startStandbySlideshow();

    // Wake on interaction
    const wake = () => {
      this.stop();
      Hub.router.go('dashboard');
    };
    Hub.utils.$('standbyContent').onclick = wake;
  },

  /** Stop standby mode */
  stop() {
    console.log('[Standby] Stopping standby mode');
    clearInterval(this._clockInterval);
    clearInterval(this._dataInterval);
    this._clockInterval = null;
    this._dataInterval = null;
    
    // Stop photo slideshow
    Hub.photos.stopStandbySlideshow();
  },

  /** Update clock display */
  _updateClock() {
    const now = new Date();
    const clockEl = Hub.utils.$('standbyClock');
    const dateEl = Hub.utils.$('standbyDate');
    
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit'
      });
    }
    
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric'
      });
    }
  },

  /** Load weather for standby */
  async _loadWeather() {
    const el = Hub.utils.$('standbyWeather');
    const tomorrowEl = document.getElementById('standbyTomorrow');
    const alertEl    = document.getElementById('standbyAlertStrip');
    if (!el) return;

    try {
      const agg = await Hub.weather.fetchAggregate();
      const ai = await Hub.ai.getSummary(agg);

      if (ai && ai.today) {
        el.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="weather-icon-animated text-2xl">${this._getWeatherIcon(ai.headline)}</span>
            <div>
              <p class="font-semibold">${ai.today.high_f}° / ${ai.today.low_f}°</p>
              <p class="text-xs text-gray-400">${Hub.utils.esc(ai.headline)}</p>
            </div>
          </div>
        `;

        // Tomorrow weather (smaller)
        if (tomorrowEl && ai.tomorrow) {
          tomorrowEl.textContent = `Tomorrow: ${ai.tomorrow.high_f}° / ${ai.tomorrow.low_f}°`;
          tomorrowEl.classList.remove('hidden');
        }

        // Alert strip
        if (alertEl) {
          if (ai.hazards?.length) {
            const text = ai.hazards.join(' — ');
            alertEl.innerHTML = `<span class="marquee-text">⚠️ ${Hub.utils.esc(text)} &nbsp;&nbsp;&nbsp; ⚠️ ${Hub.utils.esc(text)}</span>`;
            alertEl.classList.remove('hidden');
          } else {
            alertEl.classList.add('hidden');
          }
        }
      } else {
        el.innerHTML = '<p class="text-gray-500 text-sm">Weather unavailable</p>';
      }
    } catch (e) {
      el.innerHTML = '<p class="text-gray-500 text-sm">Weather unavailable</p>';
    }
  },

  /** Load upcoming calendar events */
  async _loadCalendar() {
    const el = Hub.utils.$('standbyCalendar');
    if (!el) return;

    try {
      const events = await Hub.calendar.getUpcomingEvents(5);
      
      if (events.error || !events || events.length === 0) {
        el.innerHTML = '<p class="text-gray-500">No upcoming events</p>';
        return;
      }

      // Show next 3 events
      const limitedEvents = events.slice(0, 3);
      el.innerHTML = limitedEvents.map(event => {
        const start = event.start.dateTime || event.start.date;
        const startDate = new Date(start);
        const isToday = Hub.calendar._isToday(startDate);
        const isTomorrow = Hub.calendar._isTomorrow(startDate);
        
        let dateLabel;
        if (isToday) dateLabel = 'Today';
        else if (isTomorrow) dateLabel = 'Tomorrow';
        else dateLabel = startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

        const timeLabel = event.start.dateTime 
          ? startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
          : 'All day';

        return `
          <div class="flex items-start gap-2">
            <span class="text-blue-400 text-xs font-medium">${Hub.utils.esc(timeLabel)}</span>
            <div class="flex-1 min-w-0">
              <p class="font-medium truncate">${Hub.utils.esc(event.summary || 'Untitled')}</p>
              <p class="text-xs text-gray-500">${Hub.utils.esc(dateLabel)}</p>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      el.innerHTML = '<p class="text-gray-500">Loading...</p>';
    }
  },

  /** Load due chores (today's only) */
  async _loadChores() {
    const el = Hub.utils.$('standbyChores');
    if (!el) return;

    try {
      const chores = await Hub.db.loadChoresWithCompleters(Hub.state.household_id);
      const today = new Date().getDay(); // 0=Sun, 1=Mon, etc.
      
      // Filter: only today's chores (Daily + current weekday)
      const todayChores = chores.filter(c => {
        // Skip done chores
        if (c.status !== 'pending') return false;
        
        // Daily chores always show
        if (c.category === 'Daily') return true;
        
        // Weekly chores for today's day
        if (typeof c.day_of_week === 'number' && c.day_of_week === today) return true;
        
        // Fallback: parse category for day
        if (c.day_of_week == null && c.category && Hub.chores?.DAY_MAP?.[c.category] === today) return true;
        
        return false;
      });
      
      if (todayChores.length === 0) {
        el.innerHTML = '<p class="text-gray-500">All caught up! 🎉</p>';
        return;
      }

      // Show first 4 pending chores for today
      const limited = todayChores.slice(0, 4);
      el.innerHTML = limited.map(chore => {
        const priorityColor = {
          high: 'text-red-400',
          medium: 'text-yellow-400',
          low: 'text-gray-400'
        }[chore.priority] || 'text-gray-400';

        return `
          <div class="flex items-center gap-2">
            <span class="${priorityColor}">•</span>
            <p class="flex-1 truncate">${Hub.utils.esc(chore.title)}</p>
          </div>
        `;
      }).join('');

      if (todayChores.length > 4) {
        el.innerHTML += `<p class="text-xs text-gray-500 mt-1">+${todayChores.length - 4} more</p>`;
      }
    } catch (e) {
      console.warn('[Standby] Chores load error:', e.message);
      el.innerHTML = '<p class="text-gray-500">Loading...</p>';
    }
  },

  /** Get weather icon based on description */
  _getWeatherIcon(description) {
    const desc = (description || '').toLowerCase();
    if (desc.includes('rain') || desc.includes('shower')) return '🌧️';
    if (desc.includes('snow')) return '❄️';
    if (desc.includes('cloud')) return '☁️';
    if (desc.includes('sun') || desc.includes('clear')) return '☀️';
    if (desc.includes('storm') || desc.includes('thunder')) return '⛈️';
    if (desc.includes('fog')) return '🌫️';
    return '🌤️';
  }
};
