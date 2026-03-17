// ============================================================
// assets/standby.js — Standby / Ambient Mode
// ============================================================
window.Hub = window.Hub || {};

Hub.standby = {
  _clockInterval: null,
  _dataInterval:  null,
  _wake:          null,   // stored ref so stop() can clear onclick

  /** Start standby mode — idempotent: stops any previous run first */
  start() {
    console.log('[Standby] start()');
    // Guard: stop any running instance before starting fresh
    // (prevents stacked intervals if start() is ever called twice)
    this.stop();

    // Clock — update immediately then every second
    this._updateClock();
    this._clockInterval = setInterval(() => this._updateClock(), 1000);

    // Data — load immediately then refresh every 5 minutes
    this._loadWeather();
    this._loadCalendar();
    this._loadChores();
    this._dataInterval = setInterval(() => {
      this._loadWeather();
      this._loadCalendar();
      this._loadChores();
    }, 300000);

    // Photo slideshow (unified: Google Photos / Imgur / Immich per settings)
    Hub.photos.startStandbySlideshow();

    // Wake on tap — store ref so stop() can clear it cleanly
    this._wake = () => {
      this.stop();
      Hub.router.go('dashboard');
    };
    const content = Hub.utils.$('standbyContent');
    if (content) content.onclick = this._wake;
  },

  /** Stop standby mode — safe to call multiple times */
  stop() {
    console.log('[Standby] stop()');

    clearInterval(this._clockInterval);
    clearInterval(this._dataInterval);
    this._clockInterval = null;
    this._dataInterval  = null;

    // Remove wake listener
    const content = Hub.utils.$('standbyContent');
    if (content && this._wake) content.onclick = null;
    this._wake = null;

    // Stop slideshow (RAF + visibilitychange handler)
    Hub.photos.stopStandbySlideshow();
  },

  /** Called by router when leaving the standby page */
  onLeave() { this.stop(); },

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
    const el         = Hub.utils.$('standbyWeather');
    const tomorrowEl = document.getElementById('standbyTomorrow');
    const alertEl    = document.getElementById('standbyAlertStrip');
    if (!el) return;

    try {
      // Load AI summary + live alerts in parallel
      const agg = await Hub.weather.fetchAggregate();
      const [ai, liveAlerts] = await Promise.all([
        Hub.ai.getSummary(agg),
        Hub.weather.fetchAlerts()   // already filters expired alerts
      ]);

      if (ai && ai.today) {
        el.innerHTML =
          '<div class="flex items-center gap-2">' +
            '<span class="weather-icon-animated text-2xl">' + this._getWeatherIcon(ai.headline) + '</span>' +
            '<div>' +
              '<p class="font-semibold">' + (ai.today.high_f ?? '--') + '° / ' + (ai.today.low_f ?? '--') + '°</p>' +
              '<p class="text-xs text-gray-400">' + Hub.utils.esc(ai.headline) + '</p>' +
            '</div>' +
          '</div>';

        if (tomorrowEl && ai.tomorrow) {
          tomorrowEl.textContent = 'Tomorrow: ' + (ai.tomorrow.high_f ?? '--') + '° / ' + (ai.tomorrow.low_f ?? '--') + '°';
          tomorrowEl.classList.remove('hidden');
        }
      } else {
        el.innerHTML = '<p class="text-gray-500 text-sm">Weather unavailable</p>';
      }

      // Alert strip — severity-aware colour + icon
      if (alertEl) {
        if (liveAlerts.length > 0) {
          // Sort by severity so worst alert drives the colour
          const sevOrder = { extreme: 0, severe: 1, moderate: 2, minor: 3, unknown: 4 };
          const sorted = [...liveAlerts].sort((a, b) =>
            (sevOrder[(a.severity||'').toLowerCase()] ?? 4) -
            (sevOrder[(b.severity||'').toLowerCase()] ?? 4)
          );
          const worst = sorted[0];
          const SEV_STYLE = {
            Extreme:  { bg: 'rgba(185,28,28,.92)',  icon: '🚨' },
            Severe:   { bg: 'rgba(194,65,12,.92)',  icon: '⚠️' },
            Moderate: { bg: 'rgba(180,83,9,.88)',   icon: '🌦️' },
            Minor:    { bg: 'rgba(29,78,216,.85)',  icon: 'ℹ️' },
            Unknown:  { bg: 'rgba(75,85,99,.85)',   icon: '📢' },
          };
          const style = SEV_STYLE[worst.severity] || SEV_STYLE.Unknown;

          const names = [...new Set(liveAlerts.map(a => a.event || a.headline).filter(Boolean))];
          const label = names.join('  ·  ');
          // Duplicate for seamless CSS scroll loop
          const ticker = label + '  ·  ' + label;

          alertEl.style.background = style.bg;
          alertEl.innerHTML =
            '<span style="margin-right:.5rem;flex-shrink:0;">' + style.icon + '</span>' +
            '<span class="marquee-text">' + Hub.utils.esc(ticker) + '</span>' +
            (liveAlerts.length > 1
              ? '<span style="margin-left:.75rem;opacity:.7;flex-shrink:0;font-size:.7rem;">+' +
                (liveAlerts.length - 1) + ' more</span>'
              : '');
          alertEl.style.display = 'flex';
          alertEl.style.alignItems = 'center';
          alertEl.style.overflow = 'hidden';
          alertEl.classList.remove('hidden');
        } else {
          alertEl.classList.add('hidden');
        }
      }
    } catch (e) {
      console.warn('[Standby] Weather load error:', e.message);
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
