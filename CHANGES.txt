# INDEX.HTML COMPREHENSIVE UPDATES
# Apply these changes to /home/claude/HOMEHUB-main/public/index.html

## 1. UPDATE CSS SECTION (Replace lines 36-70)

Replace the <style> section with this enhanced version:

```html
  <style>
    /* ========================================
       DESIGN SYSTEM - Enhanced Variables
    ======================================== */
    :root {
      /* Colors - Elevated Dark Mode Palette */
      --bg-base: #0B0F19;
      --bg-surface-1: #151B2B;
      --bg-surface-2: #1E2738;
      --bg-card: #1A2235;
      --bg-card-hover: #1F2843;
      --accent-primary: #3B82F6;
      --accent-glow: rgba(59, 130, 246, 0.2);
      
      /* Typography Scale */
      --font-display: 2.5rem;
      --font-title: 1.5rem;
      --font-body: 1rem;
      --font-caption: 0.875rem;
      --font-micro: 0.75rem;
      
      /* Spacing */
      --space-xs: 0.5rem;
      --space-sm: 1rem;
      --space-md: 1.5rem;
      --space-lg: 2rem;
      --space-xl: 3rem;
      
      /* Animation */
      --ease-smooth: cubic-bezier(0.4, 0.0, 0.2, 1);
      --duration-fast: 150ms;
      --duration-normal: 300ms;
      --duration-slow: 500ms;
    }

    /* ========================================
       BASE STYLES
    ======================================== */
    * { box-sizing: border-box; }
    
    body {
      background: var(--bg-base);
      color: #f9fafb;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      margin: 0;
      line-height: 1.5;
    }

    /* Google Font - Inter */
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

    /* ========================================
       CARD SYSTEM with Elevation
    ======================================== */
    .card {
      background: linear-gradient(145deg, var(--bg-surface-1) 0%, var(--bg-card) 100%);
      border-radius: 1rem;
      padding: var(--space-md);
      margin-bottom: var(--space-md);
      box-shadow: 0 4px 6px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.2);
      transition: transform var(--duration-normal) var(--ease-smooth),
                  box-shadow var(--duration-normal) var(--ease-smooth);
    }

    .card:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 24px rgba(0,0,0,0.4), 0 4px 8px rgba(0,0,0,0.3);
    }

    /* Glassmorphism variant */
    .card-glass {
      background: rgba(21, 27, 43, 0.7);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    /* ========================================
       BUTTON SYSTEM
    ======================================== */
    .btn {
      padding: var(--space-xs) var(--space-sm);
      border-radius: 0.5rem;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--duration-fast);
      border: none;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: var(--font-caption);
    }

    .btn-primary {
      background: var(--accent-primary);
      color: #fff;
      box-shadow: 0 0 20px var(--accent-glow);
    }
    
    .btn-primary:hover {
      background: #2563eb;
      box-shadow: 0 0 30px var(--accent-glow);
      transform: translateY(-2px);
    }

    .btn-secondary {
      background: var(--bg-surface-2);
      color: #fff;
    }
    
    .btn-secondary:hover {
      background: var(--bg-card-hover);
    }

    .btn-danger {
      background: #ef4444;
      color: #fff;
    }
    
    .btn-danger:hover {
      background: #dc2626;
    }

    .btn-success {
      background: #10b981;
      color: #fff;
    }
    
    .btn-success:hover {
      background: #059669;
    }

    /* ========================================
       INPUT SYSTEM
    ======================================== */
    .input {
      background: var(--bg-surface-2);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 0.5rem;
      padding: var(--space-xs) var(--space-sm);
      color: #fff;
      width: 100%;
      font-size: var(--font-body);
      transition: border-color var(--duration-fast);
    }

    .input:focus {
      outline: none;
      border-color: var(--accent-primary);
      box-shadow: 0 0 0 3px var(--accent-glow);
    }

    select.input {
      appearance: auto;
    }

    /* ========================================
       BENTO GRID LAYOUT for Dashboard
    ======================================== */
    .bento-grid {
      display: grid;
      gap: var(--space-md);
      grid-template-columns: 1fr;
    }

    /* Mobile */
    @media (min-width: 640px) {
      .bento-grid {
        grid-template-columns: repeat(2, 1fr);
      }
      
      .bento-sm { grid-column: span 1; }
      .bento-md { grid-column: span 2; }
      .bento-lg { grid-column: span 2; grid-row: span 2; }
    }

    /* Desktop */
    @media (min-width: 1024px) {
      .bento-grid {
        grid-template-columns: repeat(3, 1fr);
      }
      
      .bento-sm { grid-column: span 1; }
      .bento-md { grid-column: span 2; grid-row: span 1; }
      .bento-lg { grid-column: span 2; grid-row: span 2; }
    }

    /* ========================================
       ANIMATION & MOTION
    ======================================== */
    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes wave {
      0%, 100% { transform: rotate(0deg); }
      25% { transform: rotate(10deg); }
      75% { transform: rotate(-10deg); }
    }

    .animate-wave:hover {
      animation: wave 0.5s ease-in-out;
    }

    /* Staggered entrance for cards */
    .bento-grid > * {
      animation: slideUp var(--duration-slow) var(--ease-smooth);
      animation-fill-mode: both;
    }

    .bento-grid > *:nth-child(1) { animation-delay: 0ms; }
    .bento-grid > *:nth-child(2) { animation-delay: 50ms; }
    .bento-grid > *:nth-child(3) { animation-delay: 100ms; }
    .bento-grid > *:nth-child(4) { animation-delay: 150ms; }
    .bento-grid > *:nth-child(5) { animation-delay: 200ms; }
    .bento-grid > *:nth-child(6) { animation-delay: 250ms; }

    /* Respect reduced motion */
    @media (prefers-reduced-motion: reduce) {
      * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }

    /* ========================================
       STANDBY ENHANCEMENTS
    ======================================== */
    @keyframes kenBurns {
      0% {
        transform: scale(1) translate(0, 0);
      }
      100% {
        transform: scale(1.1) translate(-5%, -5%);
      }
    }

    #standbyCurrentPhoto {
      animation: kenBurns 30s ease-in-out infinite alternate;
    }

    @media (prefers-reduced-motion: reduce) {
      #standbyCurrentPhoto {
        animation: none;
      }
    }

    /* Ripple wake effect */
    @keyframes ripple {
      0% {
        box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5);
      }
      100% {
        box-shadow: 0 0 0 100px rgba(59, 130, 246, 0);
      }
    }

    #standbyPage.waking {
      animation: ripple 0.8s ease-out;
    }

    /* ========================================
       CHORE ICONS & INDICATORS
    ======================================== */
    .chore-icon {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 6px;
    }

    .chore-icon.daily { background: #3b82f6; }
    .chore-icon.weekly { background: #f59e0b; }
    .chore-icon.monthly { background: #a855f7; }

    /* Custom checkbox animation */
    .chore-checkbox {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      transition: all var(--duration-fast);
      cursor: pointer;
    }

    .chore-checkbox.checked {
      background: var(--accent-primary);
      border-color: var(--accent-primary);
    }

    .chore-checkbox.checked::after {
      content: '✓';
      color: white;
      display: block;
      text-align: center;
      line-height: 20px;
      font-weight: bold;
    }

    /* ========================================
       UTILITY CLASSES
    ======================================== */
    .hidden { display: none !important; }
    .page { display: none; }
    .page.active { display: block; }
    
    /* Status indicators */
    .status-dot {
      display: inline-block;
      width: 0.75rem;
      height: 0.75rem;
      border-radius: 50%;
    }
    
    .status-dot.green { background: #10b981; }
    .status-dot.red { background: #ef4444; }
    .status-dot.yellow { background: #f59e0b; }

    /* Progress bars */
    .progress-bar {
      height: 1rem;
      background: var(--bg-surface-2);
      border-radius: 9999px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      border-radius: 9999px;
      transition: width 0.4s var(--ease-smooth);
      background: linear-gradient(90deg, var(--accent-primary), #60a5fa);
    }

    /* Alert banner */
    .alert-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 50;
      padding: 0.75rem 1rem;
      text-align: center;
      font-weight: 700;
      animation: slideDown 0.3s ease-out;
    }

    @keyframes slideDown {
      from { transform: translateY(-100%); }
      to { transform: translateY(0); }
    }

    .alert-banner.warning { background: #ef4444; }
    .alert-banner.watch { background: #f59e0b; color: #000; }
    .alert-banner.advisory { background: #eab308; color: #000; }

    /* Modal overlay */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 60;
      padding: 1rem;
    }

    /* Photo grid */
    .photo-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1rem;
    }

    .photo-item {
      aspect-ratio: 16/9;
      background: var(--bg-surface-1);
      border-radius: 0.5rem;
      overflow: hidden;
    }

    .photo-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: opacity 1s, transform 0.3s;
    }

    .photo-item:hover img {
      transform: scale(1.05);
    }

    /* Skeleton loader */
    .skeleton {
      background: linear-gradient(
        90deg,
        var(--bg-surface-1) 0%,
        var(--bg-surface-2) 50%,
        var(--bg-surface-1) 100%
      );
      background-size: 200% 100%;
      animation: skeleton-loading 1.5s ease-in-out infinite;
      border-radius: 0.5rem;
    }

    @keyframes skeleton-loading {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* ========================================
       RESPONSIVE UTILITIES
    ======================================== */
    @media (max-width: 640px) {
      .card {
        padding: var(--space-sm);
        margin-bottom: var(--space-sm);
      }
      
      :root {
        --font-display: 2rem;
        --font-title: 1.25rem;
      }
    }
  </style>
```

## 2. UPDATE DASHBOARD SECTION (Lines ~136-223)

Replace the dashboard page section with this bento grid version:

```html
    <!-- ========== DASHBOARD ========== -->
    <div id="dashboardPage" class="page">
      <div class="max-w-7xl mx-auto p-4 md:p-6">
        <!-- Header with Greeting -->
        <header class="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 class="text-4xl md:text-5xl font-bold animate-wave" style="display: inline-block;">🏠</h1>
            <span class="text-4xl md:text-5xl font-bold"> Home Hub</span>
            <p class="text-gray-400 mt-2 text-base" id="dashboardDate"></p>
            <p class="text-blue-400 text-lg mt-1 font-medium" id="dashboardGreeting"></p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button onclick="Hub.router.go('standby')" class="btn btn-secondary text-sm py-2 px-4">🖥 Standby</button>
            <button onclick="Hub.router.go('status')" class="btn btn-secondary text-sm py-2 px-4">📊 Status</button>
            <button onclick="Hub.router.go('settings')" class="btn btn-secondary text-sm py-2 px-4">⚙️ Settings</button>
            <button id="btnSignOut" class="btn btn-secondary text-sm py-2 px-4">Sign Out</button>
          </div>
        </header>

        <!-- Bento Grid Layout -->
        <div class="bento-grid">
          
          <!-- Weather - Small (1x1) -->
          <div class="card bento-sm">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-xl font-bold">☀️ Weather</h2>
              <button onclick="Hub.router.go('weather')" class="text-blue-400 hover:text-blue-300 text-sm">
                View →
              </button>
            </div>
            <div id="dashboardWeather">
              <div class="skeleton" style="height: 120px;"></div>
            </div>
          </div>

          <!-- Chores - Medium (2x1) -->
          <div class="card bento-md">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-xl font-bold">Today's Chores</h2>
              <button onclick="Hub.router.go('chores')" class="text-blue-400 hover:text-blue-300 text-sm">
                View All →
              </button>
            </div>
            <div id="dashboardChores" class="space-y-2">
              <div class="skeleton" style="height: 60px;"></div>
            </div>
          </div>

          <!-- Calendar - Large (2x2) -->
          <div class="card bento-lg">
            <h2 class="text-xl font-bold mb-4">📅 Calendar</h2>
            <div id="calendarWidget">
              <div class="skeleton" style="height: 300px;"></div>
            </div>
          </div>

          <!-- Barker (Dog) - Medium (1x1) -->
          <div class="card bento-sm">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-bold text-xl">🐕 Barker</h3>
              <button onclick="Hub.treats.showQuickAdd()" class="btn btn-primary text-sm py-1 px-3">
                + Treat
              </button>
            </div>
            <div id="dogStatusWidget">
              <div class="skeleton" style="height: 150px;"></div>
            </div>
          </div>

          <!-- Now Playing - Small (1x1) -->
          <div class="card bento-sm">
            <h3 class="font-bold text-lg mb-3">🎵 Now Playing</h3>
            <div id="nowPlayingWidget">
              <div class="text-center text-gray-500 py-4">
                <div class="text-3xl mb-2">🎵</div>
                <p class="text-sm">Nothing playing</p>
              </div>
            </div>
          </div>

          <!-- Quick Actions - Small (1x1) -->
          <div class="card bento-sm">
            <h3 class="font-bold text-lg mb-3">⚡ Quick Actions</h3>
            <div class="grid grid-cols-2 gap-2">
              <button onclick="Hub.router.go('music')" class="btn btn-secondary w-full py-3">🎵 Music</button>
              <button onclick="Hub.router.go('radio')" class="btn btn-secondary w-full py-3">📻 Radio</button>
              <button onclick="Hub.router.go('weather')" class="btn btn-secondary w-full py-3">🌤️ Weather</button>
              <button onclick="Hub.router.go('treats')" class="btn btn-secondary w-full py-3">🐕 Treats</button>
            </div>
          </div>

          <!-- Photos - Full Width -->
          <div class="card bento-md lg:col-span-3">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-bold text-xl">📸 Family Photos</h3>
            </div>
            <div id="immichDashboardWidget" class="min-h-[200px]">
              <div class="skeleton" style="height: 200px;"></div>
            </div>
          </div>

        </div>
      </div>
    </div>
```

## 3. UPDATE STANDBY SECTION (After line ~281)

Add Now Playing card to standby grid:

```html
          <!-- Now Playing - glassmorphism card -->
          <div class="bg-black/70 backdrop-blur-md rounded-xl p-3 sm:p-4 border border-white/10">
            <h3 class="text-sm font-semibold mb-2 text-purple-400">🎵 Now Playing</h3>
            <div id="standbyNowPlaying" class="text-xs sm:text-sm">
              <p class="text-gray-400">Nothing playing</p>
            </div>
          </div>
```

INSERT this after the Weather card (around line 271).

## 4. ADD MUSIC PAGE (After Treats page, before Status page)

```html
    <!-- ========== MUSIC ========== -->
    <div id="musicPage" class="page">
      <div class="max-w-7xl mx-auto p-4 md:p-6">
        <header class="flex items-center justify-between mb-6">
          <h1 class="text-3xl font-bold">🎵 Music</h1>
          <button onclick="Hub.router.go('dashboard')" class="btn btn-secondary">← Back</button>
        </header>

        <!-- YouTube Music Player -->
        <div class="card mb-6">
          <h2 class="text-xl font-bold mb-4">YouTube Music</h2>
          <div id="musicPlayerContainer">
            <p class="text-gray-400 text-center py-8">Player will load when you enter this page</p>
          </div>
        </div>

        <!-- Bluetooth Speakers Help -->
        <div id="bluetoothHelp"></div>
      </div>
    </div>

    <!-- ========== RADIO ========== -->
    <div id="radioPage" class="page">
      <div class="max-w-7xl mx-auto p-4 md:p-6">
        <header class="flex items-center justify-between mb-6">
          <h1 class="text-3xl font-bold">📻 Live Radio</h1>
          <button onclick="Hub.router.go('dashboard')" class="btn btn-secondary">← Back</button>
        </header>

        <!-- Radio Controls -->
        <div class="card mb-6 text-center" id="radioControls">
          <p class="text-gray-400 mb-4">Select a station below to start listening</p>
          <div class="flex gap-3 justify-center">
            <button onclick="Hub.player.pause()" class="btn btn-secondary">⏸ Pause</button>
            <button onclick="Hub.player.resume()" class="btn btn-primary">▶ Play</button>
            <button onclick="Hub.radio.stop()" class="btn btn-secondary">⏹ Stop</button>
          </div>
        </div>

        <!-- Station List -->
        <div id="radioStationList" class="space-y-4">
          <div class="skeleton" style="height: 100px;"></div>
          <div class="skeleton" style="height: 100px;"></div>
          <div class="skeleton" style="height: 100px;"></div>
        </div>
      </div>
    </div>
```

## 5. UPDATE SCRIPT INCLUDES (Before </body>)

Add new modules to the script section (around line 619):

```html
  <!-- Scripts (order matters) -->
  <script src="assets/utils.js"></script>
  <script src="assets/supabase.js"></script>
  <script src="assets/router.js"></script>
  <script src="assets/ui.js"></script>
  <script src="assets/player.js"></script>
  <script src="assets/weather.js"></script>
  <script src="assets/ai.js"></script>
  <script src="assets/calendar.js"></script>
  <script src="assets/treats.js"></script>
  <script src="assets/chores.js"></script>
  <script src="assets/radio.js"></script>
  <script src="assets/music.js"></script>
  <script src="assets/control.js"></script>
  <script src="assets/standby.js"></script>
  <script src="assets/immich.js"></script>
  <script src="assets/app.js"></script>
```

Note: player.js must load before radio.js and music.js.
