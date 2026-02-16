# APP.JS UPDATES

## 1. Add initialization for new modules in init() method (around line 40)

FIND this section:
```javascript
  async init() {
    console.log('[App] init()');
    this._bindUI();
    Hub.router.init();
    Hub.treats.init();
    Hub.control?.init?.();
```

REPLACE with:
```javascript
  async init() {
    console.log('[App] init()');
    this._bindUI();
    Hub.router.init();
    Hub.treats.init();
    Hub.player?.init?.();
    Hub.radio?.init?.();
    Hub.music?.init?.();
    Hub.control?.init?.();
```

## 2. Add automatic chore reset call in _onLogin (around line 236)

FIND this section:
```javascript
      console.log('[Auth] ✓ Showing app');
      this._showApp();
    } catch (e) {
```

INSERT BEFORE `this._showApp()`:
```javascript
      // Call chore reset endpoint (non-blocking fallback)
      this._callChoreResetEndpoint().catch(e => 
        console.warn('[App] Chore reset call failed:', e.message)
      );

      console.log('[Auth] ✓ Showing app');
```

## 3. Add chore reset endpoint call method (add at end of Hub.app object, before closing brace)

Add this new method:
```javascript
  /** Call chore reset endpoint (client fallback) */
  async _callChoreResetEndpoint() {
    if (!Hub.state.household_id) {
      console.log('[App] Skip chore reset - no household');
      return;
    }

    try {
      console.log('[App] Calling chore reset endpoint...');
      const apiBase = window.HOME_HUB_CONFIG?.apiBase || '';
      const response = await fetch(`${apiBase}/api/cron-chores-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      console.log('[App] Chore reset result:', result);
      
      // If chores were reset, refresh chores page if we're on it
      if (result.processed > 0 && Hub.router.current === 'chores') {
        Hub.chores?.load?.();
      }
    } catch (error) {
      console.error('[App] Chore reset endpoint error:', error);
      // Don't throw - this is a fallback, cron is primary
    }
  },
```

## 4. Update onPageEnter to handle music and radio pages (around line 293)

FIND the switch statement:
```javascript
    switch (page) {
      case 'dashboard': this._loadDashboard(); break;
      case 'weather':   this._loadWeatherPage(); break;
      case 'chores':
        Hub.chores.load();
        Hub.chores.renderStats?.('choresStats', 7).catch?.(() => {});
        break;
      case 'treats':    Hub.treats.loadDogs(); break;
      case 'standby':   Hub.standby.start(); break;
      case 'settings':  this._loadSettingsForm(); break;
      case 'status':    this._loadStatusPage(); break;
      case 'control':   Hub.control?.load?.(); break;
    }
```

REPLACE with:
```javascript
    switch (page) {
      case 'dashboard': this._loadDashboard(); break;
      case 'weather':   this._loadWeatherPage(); break;
      case 'chores':
        Hub.chores.load();
        Hub.chores.renderStats?.('choresStats', 7).catch?.(() => {});
        break;
      case 'treats':    Hub.treats.loadDogs(); break;
      case 'standby':   Hub.standby.start(); break;
      case 'music':
        Hub.music?.onEnter?.();
        Hub.music?.renderBluetoothHelp?.();
        break;
      case 'radio':
        Hub.radio?.onEnter?.();
        break;
      case 'settings':  this._loadSettingsForm(); break;
      case 'status':    this._loadStatusPage(); break;
      case 'control':   Hub.control?.load?.(); break;
    }
```

## 5. Update _loadDashboard to render Now Playing widget (around line 343)

FIND this section:
```javascript
    // Load Immich photos widget
    if (Hub.immich && typeof Hub.immich.renderDashboardWidget === 'function') {
      Hub.immich.renderDashboardWidget().catch(e => console.warn('[Dashboard] Photos error:', e));
    }
  },
```

INSERT BEFORE the closing brace:
```javascript
    // Update Now Playing widget
    if (Hub.player) {
      Hub.player.updateUI();
    }
  },
```

These changes will:
1. Initialize player, radio, and music modules on app startup
2. Call chore reset endpoint after login (client fallback)
3. Handle music and radio page navigation
4. Update Now Playing widget on dashboard load
