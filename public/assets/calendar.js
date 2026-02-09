// ============================================================
// assets/calendar.js — Google Calendar Integration
// Uses Google Calendar API via Supabase OAuth provider token
// ============================================================
window.Hub = window.Hub || {};

Hub.calendar = {
  _cache: null,
  _cacheTime: 0,
  CACHE_TTL: 5 * 60 * 1000, // 5 minutes

  /**
   * Fetch upcoming events from user's primary calendar
   * @param {number} maxResults - Maximum number of events to fetch
   * @returns {Array|Object} Array of events or error object
   */
  /**
   * Get list of user's calendars
   * @returns {Array|Object} Array of calendars or error object
   */
  async getCalendarList() {
    try {
      console.log('[Calendar] Getting calendar list...');
      
      const { data: { session } } = await Hub.sb.auth.getSession();
      if (!session?.provider_token) {
        console.error('[Calendar] No provider token found');
        return { error: 'Not authenticated. Please sign out and sign in again to grant calendar access.' };
      }

      console.log('[Calendar] Session found, provider_token exists:', !!session.provider_token);

      const url = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';
      
      console.log('[Calendar] Fetching from:', url);
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${session.provider_token}`,
          'Accept': 'application/json'
        }
      });

      console.log('[Calendar] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Calendar] Error response:', errorText);
        
        if (response.status === 401) {
          return { error: 'Calendar access expired. Please sign out and sign in again.' };
        }
        if (response.status === 403) {
          return { error: 'Calendar API access denied. Make sure Calendar API is enabled in Google Cloud Console and you granted calendar permissions when signing in.' };
        }
        throw new Error(`Calendar list error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('[Calendar] Found', data.items?.length || 0, 'calendars:', data.items?.map(c => c.summary));
      
      return data.items || [];
    } catch (error) {
      console.error('[Calendar] Error fetching calendar list:', error);
      return { error: `Failed to load calendars: ${error.message}` };
    }
  },

  /**
   * Fetch upcoming events from user's selected calendars
   * @param {number} maxResults - Maximum number of events to fetch per calendar
   * @returns {Array|Object} Array of events or error object
   */
  async getUpcomingEvents(maxResults = 10) {
    try {
      // Check cache first
      const now = Date.now();
      if (this._cache && (now - this._cacheTime) < this.CACHE_TTL) {
        console.log('[Calendar] Using cached events');
        return this._cache;
      }

      // Get access token from Supabase session
      if (!Hub.sb) {
        console.error('[Calendar] Supabase client not initialized');
        return { error: 'App not initialized - please refresh the page' };
      }
      const { data: { session } } = await Hub.sb.auth.getSession();
      if (!session?.provider_token) {
        console.warn('[Calendar] No provider token - user needs to re-authenticate');
        return { error: 'Please sign out and sign in again to grant calendar access' };
      }

      const accessToken = session.provider_token;

      // Get selected calendar IDs from settings (or use 'primary' as default)
      const settings = Hub.state?.settings || {};
      let calendarIds = settings.selected_calendars || ['primary'];
      
      // Ensure it's an array
      if (!Array.isArray(calendarIds)) {
        calendarIds = ['primary'];
      }

      console.log('[Calendar] ===== FETCHING EVENTS =====');
      console.log('[Calendar] Settings object:', settings);
      console.log('[Calendar] Selected calendars from settings:', calendarIds);
      console.log('[Calendar] Will fetch from', calendarIds.length, 'calendar(s)');
      calendarIds.forEach((id, i) => console.log(`[Calendar]   ${i + 1}. ${id}`));

      // Fetch events from each selected calendar
      const timeMin = new Date().toISOString();
      const allEvents = [];

      for (const calendarId of calendarIds) {
        try {
          const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
            `maxResults=${maxResults}&` +
            `orderBy=startTime&` +
            `singleEvents=true&` +
            `timeMin=${timeMin}`;

          const response = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json'
            }
          });

          if (!response.ok) {
            if (response.status === 401) {
              return { error: 'Calendar access expired - please sign out and sign in again' };
            }
            if (response.status === 403) {
              return { error: 'Calendar API not enabled - check Google Cloud Console' };
            }
            console.warn(`[Calendar] Error fetching from ${calendarId}:`, response.status);
            continue; // Skip this calendar and try others
          }

          const data = await response.json();
          const events = (data.items || []).map(event => ({
            ...event,
            calendarId: calendarId // Tag each event with its calendar ID
          }));
          
          console.log(`[Calendar] Fetched ${events.length} events from calendar: ${calendarId}`);
          
          allEvents.push(...events);
        } catch (err) {
          console.error(`[Calendar] Error fetching events from ${calendarId}:`, err);
          // Continue with other calendars
        }
      }

      // Sort all events by start time
      allEvents.sort((a, b) => {
        const aTime = a.start.dateTime || a.start.date;
        const bTime = b.start.dateTime || b.start.date;
        return new Date(aTime) - new Date(bTime);
      });

      // Limit to maxResults total events
      const limitedEvents = allEvents.slice(0, maxResults);
      
      // Cache the results
      this._cache = limitedEvents;
      this._cacheTime = now;
      
      console.log('[Calendar] ===== FETCH COMPLETE =====');
      console.log(`[Calendar] Total events fetched: ${limitedEvents.length}`);
      const calendarCounts = {};
      limitedEvents.forEach(e => {
        const cal = e.calendarId || 'unknown';
        calendarCounts[cal] = (calendarCounts[cal] || 0) + 1;
      });
      console.log('[Calendar] Events by calendar:', calendarCounts);
      console.log('[Calendar] ==========================');
      
      return this._cache;

    } catch (error) {
      console.error('[Calendar] Error fetching events:', error);
      return { error: error.message };
    }
  },

  /**
   * Create a new calendar event
   * @param {Object} event - Event object following Google Calendar API format
   * @returns {Object} Success or error object
   */
  async createEvent(event) {
    try {
      if (!Hub.sb) {
        return { error: 'App not initialized' };
      }
      const { data: { session } } = await Hub.sb.auth.getSession();
      if (!session?.provider_token) {
        return { error: 'No calendar access - please re-authenticate' };
      }

      console.log('[Calendar] Creating event:', event.summary);
      const response = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.provider_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(event)
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to create event: ${response.status}`);
      }

      const data = await response.json();
      
      // Clear cache to force refresh
      this._cache = null;
      
      console.log('[Calendar] Event created:', data.id);
      return { success: true, event: data };

    } catch (error) {
      console.error('[Calendar] Error creating event:', error);
      return { error: error.message };
    }
  },

  /**
   * Create a quick event with prompts
   */
  async createQuickEvent() {
    const title = prompt('Event title:');
    if (!title) return;

    const dateStr = prompt('Date (YYYY-MM-DD):');
    if (!dateStr) return;

    const timeStr = prompt('Time (HH:MM in 24-hour format, or leave empty for all-day):');

    let event;
    if (timeStr) {
      // Timed event
      const startDateTime = new Date(`${dateStr}T${timeStr}:00`);
      const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000); // +1 hour

      event = {
        summary: title,
        start: { 
          dateTime: startDateTime.toISOString(), 
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone 
        },
        end: { 
          dateTime: endDateTime.toISOString(), 
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone 
        }
      };
    } else {
      // All-day event
      event = {
        summary: title,
        start: { date: dateStr },
        end: { date: dateStr }
      };
    }

    const result = await this.createEvent(event);
    
    if (result.error) {
      Hub.ui.toast('Error: ' + result.error, 'error');
    } else {
      Hub.ui.toast('Event created!', 'success');
      this.refreshCalendar();
    }
  },

  /**
   * Render calendar widget on dashboard
   */
  async renderDashboard() {
    const widget = Hub.utils.$('calendarWidget');
    if (!widget) {
      console.warn('[Calendar] Widget element not found');
      return;
    }

    widget.innerHTML = '<div class="animate-pulse text-gray-400 text-sm">Loading calendar...</div>';

    const events = await this.getUpcomingEvents(5);

    if (events.error) {
      // Check if it's a simple re-auth issue
      const needsReauth = events.error.includes('sign out') || events.error.includes('sign in');
      
      widget.innerHTML = `
        <div class="bg-blue-900 bg-opacity-30 rounded-lg p-4 text-center">
          <p class="text-2xl mb-2">📅</p>
          <p class="text-sm font-medium mb-2">Calendar Not Connected</p>
          <p class="text-xs text-gray-400 mb-3">${Hub.utils.esc(events.error)}</p>
          ${needsReauth ? `
            <button onclick="Hub.auth.signOut()" class="btn btn-primary text-xs">
              Sign Out & Reconnect
            </button>
            <p class="text-xs text-gray-500 mt-2">You'll need to grant calendar access when signing back in</p>
          ` : `
            <button onclick="Hub.calendar.showSetupInstructions()" class="text-xs text-blue-400 hover:text-blue-300">
              How to connect
            </button>
          `}
        </div>
      `;
      return;
    }

    if (!events || events.length === 0) {
      widget.innerHTML = `
        <div class="text-center py-4">
          <p class="text-gray-400 text-sm mb-2">📅 No upcoming events</p>
          <button onclick="Hub.calendar.createQuickEvent()" class="text-xs text-blue-400 hover:text-blue-300">
            + Create Event
          </button>
        </div>
      `;
      return;
    }

    // Render events
    const html = events.map(event => {
      const start = event.start.dateTime || event.start.date;
      const startDate = new Date(start);
      const isToday = this._isToday(startDate);
      const isTomorrow = this._isTomorrow(startDate);
      
      let dateLabel;
      if (isToday) dateLabel = 'Today';
      else if (isTomorrow) dateLabel = 'Tomorrow';
      else dateLabel = startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

      const timeLabel = event.start.dateTime 
        ? startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : 'All day';

      return `
        <div class="flex items-start gap-3 py-2 border-b border-gray-700 last:border-0">
          <div class="text-xs text-gray-400 w-20 flex-shrink-0 pt-1">
            ${Hub.utils.esc(dateLabel)}
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-medium text-sm truncate">${Hub.utils.esc(event.summary || 'Untitled')}</div>
            <div class="text-xs text-gray-400">${Hub.utils.esc(timeLabel)}</div>
          </div>
        </div>
      `;
    }).join('');

    widget.innerHTML = `
      <div class="space-y-1">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold">📅 Upcoming Events</h3>
          <div class="space-x-2">
            <button onclick="Hub.calendar.createQuickEvent()" class="text-xs text-green-400 hover:text-green-300">
              + Add
            </button>
            <button onclick="Hub.calendar.refreshCalendar()" class="text-xs text-blue-400 hover:text-blue-300">
              Refresh
            </button>
          </div>
        </div>
        ${html}
      </div>
    `;
  },

  /**
   * Force refresh calendar (clears cache)
   */
  async refreshCalendar() {
    this._cache = null;
    await this.renderDashboard();
  },

  /**
   * Show setup instructions
   */
  showSetupInstructions() {
    alert(
      '📅 Google Calendar Setup:\n\n' +
      'Calendar permissions are now requested automatically!\n\n' +
      'If you\'re seeing this message:\n\n' +
      '1. Sign out of Home Hub\n' +
      '2. Sign back in with Google\n' +
      '3. Click "Allow" when Google asks for calendar access\n\n' +
      'Note: Admin may need to enable Calendar API in Google Cloud Console first.\n\n' +
      'After signing in, your calendar will appear here automatically!'
    );
  },

  // Helper functions
  _isToday(date) {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  },

  _isTomorrow(date) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return date.getDate() === tomorrow.getDate() &&
           date.getMonth() === tomorrow.getMonth() &&
           date.getFullYear() === tomorrow.getFullYear();
  }
};
