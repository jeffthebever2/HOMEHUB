// ============================================================
// assets/standby.js — Standby / Ambient Mode
//
// Brightness modes:
//   bright  — normal photo-frame mode (outside quiet hours)
//   dim     — quiet hours ambient (5% brightness, just the clock)
//   deep    — quiet hours after 30s no tap (near-black, 2% brightness)
//   peek    — tap during dim/deep temporarily brightens for 30s
//
// Quiet hours: read from Hub.state.settings.quiet_hours_start / _end
// The _checkDim() function runs every 60s and transitions modes cleanly.
// ============================================================
window.Hub = window.Hub || {};

Hub.standby = {
  _clockInterval:  null,
  _dataInterval:   null,
  _dimInterval:    null,   // checks brightness mode every 60s
  _peekTimer:      null,   // re-dims after tap during quiet hours
  _wake:           null,
  _mode:           'bright',  // 'bright' | 'dim' | 'deep' | 'peek'

  // Brightness values per mode (CSS filter on standbyPage)
  _BRIGHTNESS: {
    bright: 1.0,
    dim:    0.06,   // quiet hours ambient — just enough to see clock
    deep:   0.02,   // deep sleep after 30s idle during quiet hours
    peek:   1.0,    // full brightness briefly after tap during quiet hours
  },

  // ── Lifecycle ─────────────────────────────────────────────

  start() {
    console.log('[Standby] start()');
    this.stop();

    this._updateClock();
    this._clockInterval = setInterval(() => this._updateClock(), 1000);

    this._loadWeather();
    this._loadCalendar();
    this._loadChores();
    this._dataInterval = setInterval(() => {
      this._loadWeather();
      this._loadCalendar();
      this._loadChores();
    }, 5 * 60 * 1000);

    // Check and apply correct brightness immediately, then every 60s
    this._checkDim();
    this._dimInterval = setInterval(() => this._checkDim(), 60 * 1000);

    Hub.photos.startStandbySlideshow();

    // Wake on tap
    this._wake = (e) => this._handleTap(e);
    const content = Hub.utils.$('standbyContent');
    if (content) content.addEventListener('click', this._wake);
  },

  stop() {
    console.log('[Standby] stop()');
    clearInterval(this._clockInterval);
    clearInterval(this._dataInterval);
    clearInterval(this._dimInterval);
    clearTimeout(this._peekTimer);

    this._clockInterval = null;
    this._dataInterval  = null;
    this._dimInterval   = null;
    this._peekTimer     = null;

    // Remove tap listener
    const content = Hub.utils.$('standbyContent');
    if (content && this._wake) content.removeEventListener('click', this._wake);
    this._wake = null;

    // Restore brightness before leaving so dashboard doesn't inherit dim state
    this._applyBrightness('bright', 0);

    Hub.photos.stopStandbySlideshow();
  },

  onLeave() { this.stop(); },

  // ── Brightness / quiet hours ───────────────────────────────

  /** Returns true if current time is within quiet hours */
  _isQuietHours() {
    const s = Hub.state?.settings || {};
    const start = s.quiet_hours_start || '22:00';
    const end   = s.quiet_hours_end   || '07:00';

    const now   = new Date();
    const hhmm  = (h, m) => h * 60 + m;
    const cur   = hhmm(now.getHours(), now.getMinutes());

    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const startMin = hhmm(sh, sm);
    const endMin   = hhmm(eh, em);

    // Handles overnight ranges (e.g. 22:00 → 07:00)
    if (startMin > endMin) {
      return cur >= startMin || cur < endMin;
    }
    return cur >= startMin && cur < endMin;
  },

  /** Called every 60s — transitions to correct mode */
  _checkDim() {
    const quiet = this._isQuietHours();

    if (!quiet) {
      // Daytime — always bright
      if (this._mode !== 'bright') {
        this._clearPeekTimer();
        this._setMode('bright');
      }
      return;
    }

    // Quiet hours — transition to dim if we're currently bright
    if (this._mode === 'bright') {
      this._setMode('dim');
      // Schedule deep-sleep after 30s of no tap
      this._schedulePeekToDeep(30 * 1000);
    }

    // Already in dim/deep/peek — let _schedulePeekToDeep handle progression
  },

  /** Set brightness mode with smooth CSS transition */
  _setMode(mode) {
    this._mode = mode;
    this._applyBrightness(mode);
    this._updateContentVisibility(mode);
  },

  _applyBrightness(mode, durationMs = 2000) {
    const page = Hub.utils.$('standbyPage');
    if (!page) return;
    const brightness = this._BRIGHTNESS[mode] ?? 1.0;
    page.style.transition = durationMs > 0 ? `filter ${durationMs}ms ease` : 'none';
    page.style.filter = `brightness(${brightness})`;
  },

  /** During dim/deep: hide info cards, only show clock. During bright/peek: show everything */
  _updateContentVisibility(mode) {
    const cards  = Hub.utils.$('standbyInfoCards');
    const hint   = Hub.utils.$('standbyWakeHint');
    const quiet  = this._isQuietHours();

    if (!cards) return;

    if (mode === 'dim' || mode === 'deep') {
      // Just the clock, maximally large, centered
      cards.style.opacity  = '0';
      cards.style.transition = 'opacity 1.5s ease';
      if (hint) { hint.textContent = 'Tap to wake'; hint.style.opacity = '0.3'; }
      // Move clock to center of screen during deep quiet mode
      const clockBlock = Hub.utils.$('standbyClockBlock');
      if (clockBlock) {
        clockBlock.style.transition = 'all 2s ease';
        clockBlock.style.position   = 'absolute';
        clockBlock.style.top        = '50%';
        clockBlock.style.left       = '50%';
        clockBlock.style.transform  = 'translate(-50%, -50%)';
        clockBlock.style.marginBottom = '0';
      }
    } else {
      // bright / peek — full content
      cards.style.opacity = '1';
      cards.style.transition = 'opacity 1.5s ease';
      if (hint) { hint.textContent = 'Tap anywhere to wake'; hint.style.opacity = '1'; }
      const clockBlock = Hub.utils.$('standbyClockBlock');
      if (clockBlock) {
        clockBlock.style.transition = 'all 1.5s ease';
        clockBlock.style.position   = '';
        clockBlock.style.top        = '';
        clockBlock.style.left       = '';
        clockBlock.style.transform  = '';
        clockBlock.style.marginBottom = '';
      }
    }
  },

  /** Schedule transition from dim/peek → deep after a delay */
  _schedulePeekToDeep(delayMs = 30000) {
    clearTimeout(this._peekTimer);
    this._peekTimer = setTimeout(() => {
      if (this._isQuietHours() && Hub.router?.current === 'standby') {
        this._setMode('deep');
      }
    }, delayMs);
  },

  _clearPeekTimer() {
    clearTimeout(this._peekTimer);
    this._peekTimer = null;
  },

  // ── Tap handling ───────────────────────────────────────────

  _handleTap(e) {
    const quiet = this._isQuietHours();

    if (quiet && (this._mode === 'dim' || this._mode === 'deep')) {
      // First tap during quiet hours: peek for 30s, then re-dim
      this._setMode('peek');
      this._schedulePeekToDeep(30 * 1000);
      return; // don't wake dashboard
    }

    // Not quiet, or already peeking → wake the dashboard
    this._clearPeekTimer();
    this.stop();
    Hub.router.go('dashboard');
  },

  // ── Clock ──────────────────────────────────────────────────

  _updateClock() {
    const now     = new Date();
    const clockEl = Hub.utils.$('standbyClock');
    const dateEl  = Hub.utils.$('standbyDate');

    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit'
      });
    }
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric'
      });
    }

    // On the hour: re-check dim state (catches quiet hours boundary crossing)
    if (now.getMinutes() === 0 && now.getSeconds() < 2) {
      this._checkDim();
    }
  },

  // ── Data loaders ───────────────────────────────────────────

  async _loadWeather() {
    const el         = Hub.utils.$('standbyWeather');
    const tomorrowEl = document.getElementById('standbyTomorrow');
    const alertEl    = document.getElementById('standbyAlertStrip');
    if (!el) return;

    try {
      const agg = await Hub.weather.fetchAggregate();
      const [ai, liveAlerts] = await Promise.all([
        Hub.ai.getSummary(agg),
        Hub.weather.fetchAlerts()
      ]);

      if (ai && ai.today) {
        el.innerHTML =
          '<div class="flex items-center gap-2">' +
            '<span class="text-2xl">' + this._getWeatherIcon(ai.headline) + '</span>' +
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

      // Alert strip
      if (alertEl) {
        if (liveAlerts.length > 0) {
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
          const ticker = names.join('  ·  ') + '  ·  ' + names.join('  ·  ');

          alertEl.style.background = style.bg;
          alertEl.style.display    = 'flex';
          alertEl.style.alignItems = 'center';
          alertEl.style.overflow   = 'hidden';
          alertEl.innerHTML =
            '<span style="margin-right:.5rem;flex-shrink:0;">' + style.icon + '</span>' +
            '<span class="marquee-text">' + Hub.utils.esc(ticker) + '</span>' +
            (liveAlerts.length > 1
              ? '<span style="margin-left:.75rem;opacity:.7;flex-shrink:0;font-size:.7rem;">+' +
                (liveAlerts.length - 1) + ' more</span>'
              : '');
          alertEl.classList.remove('hidden');
        } else {
          alertEl.classList.add('hidden');
        }
      }
    } catch (e) {
      console.warn('[Standby] Weather error:', e.message);
      el.innerHTML = '<p class="text-gray-500 text-sm">Weather unavailable</p>';
    }
  },

  async _loadCalendar() {
    const el = Hub.utils.$('standbyCalendar');
    if (!el) return;
    try {
      const events = await Hub.calendar.getUpcomingEvents(5);
      if (events.error || !events?.length) {
        el.innerHTML = '<p class="text-gray-500">No upcoming events</p>';
        return;
      }
      el.innerHTML = events.slice(0, 3).map(event => {
        const start     = event.start.dateTime || event.start.date;
        const startDate = new Date(start);
        const isToday   = Hub.calendar._isToday(startDate);
        const isTomorrow = Hub.calendar._isTomorrow(startDate);
        const dateLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow'
          : startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const timeLabel = event.start.dateTime
          ? startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
          : 'All day';
        return `<div class="flex items-start gap-2">
          <span class="text-blue-400 text-xs font-medium flex-shrink-0">${Hub.utils.esc(timeLabel)}</span>
          <div class="flex-1 min-w-0">
            <p class="font-medium truncate">${Hub.utils.esc(event.summary || 'Untitled')}</p>
            <p class="text-xs text-gray-500">${Hub.utils.esc(dateLabel)}</p>
          </div>
        </div>`;
      }).join('');
    } catch (e) {
      el.innerHTML = '<p class="text-gray-500">Loading…</p>';
    }
  },

  async _loadChores() {
    const el = Hub.utils.$('standbyChores');
    if (!el) return;
    try {
      const chores  = await Hub.db.loadChoresWithCompleters(Hub.state.household_id);
      const today   = new Date().getDay();
      const pending = chores.filter(c => {
        if (c.status !== 'pending') return false;
        if (c.category === 'Daily') return true;
        if (typeof c.day_of_week === 'number' && c.day_of_week === today) return true;
        if (c.day_of_week == null && c.category && Hub.chores?.DAY_MAP?.[c.category] === today) return true;
        return false;
      });

      if (!pending.length) {
        el.innerHTML = '<p class="text-gray-500">All caught up! 🎉</p>';
        return;
      }

      el.innerHTML = pending.slice(0, 4).map(c => {
        const color = { high: 'text-red-400', medium: 'text-yellow-400', low: 'text-gray-400' }[c.priority] || 'text-gray-400';
        return `<div class="flex items-center gap-2">
          <span class="${color}">•</span>
          <p class="flex-1 truncate">${Hub.utils.esc(c.title)}</p>
        </div>`;
      }).join('');

      if (pending.length > 4) {
        el.innerHTML += `<p class="text-xs text-gray-500 mt-1">+${pending.length - 4} more</p>`;
      }
    } catch (e) {
      console.warn('[Standby] Chores error:', e.message);
      el.innerHTML = '<p class="text-gray-500">Loading…</p>';
    }
  },

  _getWeatherIcon(description) {
    const d = (description || '').toLowerCase();
    if (d.includes('rain') || d.includes('shower')) return '🌧️';
    if (d.includes('snow'))  return '❄️';
    if (d.includes('cloud')) return '☁️';
    if (d.includes('sun') || d.includes('clear')) return '☀️';
    if (d.includes('storm') || d.includes('thunder')) return '⛈️';
    if (d.includes('fog'))   return '🌫️';
    return '🌤️';
  },
};
