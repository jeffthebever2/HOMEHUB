// ============================================================
// public/assets/immich.js — Photo fetching + Slideshow
// Slideshow: RAF loop + performance.now() + two-layer crossfade
// 20s display per image, 900ms fade, visibility-aware pause
// ============================================================
window.Hub = window.Hub || {};

Hub.immich = {
  _images: [],

  _imgurConfig: {
    albumId: 'kAG2MS3',
    useImgur: true
  },

  // SECURITY: Immich URL and API key come from Settings (Hub.state.settings),
  // never hardcoded here. _hardcodedConfig is intentionally empty.
  _hardcodedConfig: {},

  // ── Slideshow Controller ───────────────────────────────────
  _ss: {
    images:          [],
    index:           0,
    lastSwitchTime:  0,       // performance.now() when current image became fully visible
    isTransitioning: false,
    paused:          false,
    rafId:           null,
    displayMs:       20000,   // 20 seconds per image
    fadeMs:          900,     // 900ms crossfade
    layerA:          null,
    layerB:          null,
    activeLayer:     'A',

    /** Preload an image URL into the browser cache */
    preload(url) {
      return new Promise(resolve => {
        const img = new Image();
        img.onload  = () => resolve(url);
        img.onerror = () => resolve(url); // resolve anyway — don't block
        img.src = url;
      });
    },

    /** Crossfade from active layer to the other layer */
    async crossfade(nextUrl) {
      if (this.isTransitioning) return;
      this.isTransitioning = true;

      // Preload before starting fade — avoids decode stutter
      await this.preload(nextUrl);

      const incoming = this.activeLayer === 'A' ? this.layerB : this.layerA;
      const outgoing  = this.activeLayer === 'A' ? this.layerA : this.layerB;

      incoming.style.zIndex  = '1';
      outgoing.style.zIndex  = '2';
      incoming.style.opacity = '0';
      incoming.src = nextUrl;

      // One frame pause so browser paints new src before fade
      await new Promise(r => setTimeout(r, 30));

      incoming.style.opacity = '1';
      outgoing.style.opacity  = '0';

      await new Promise(r => setTimeout(r, this.fadeMs + 50));

      this.activeLayer    = this.activeLayer === 'A' ? 'B' : 'A';
      this.isTransitioning = false;
      this.lastSwitchTime  = performance.now();

      console.log('[Slideshow] Image', this.index + 1, '/', this.images.length);
    },

    /** RAF tick — runs every frame */
    tick(now) {
      if (!this.paused && !this.isTransitioning) {
        const elapsed = now - this.lastSwitchTime;
        if (elapsed >= this.displayMs) {
          this.index = (this.index + 1) % this.images.length;
          this.crossfade(this.images[this.index]);
        }
      }
      this.rafId = requestAnimationFrame(t => this.tick(t));
    },

    stop() {
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    }
  },
  // ── End Slideshow Controller ───────────────────────────────

  /** Fetch image list from Imgur, Immich, or placeholders */
  async fetchImages() {
    if (this._imgurConfig.useImgur && this._imgurConfig.albumId) {
      try {
        console.log('[Immich] Fetching from Imgur album:', this._imgurConfig.albumId);
        const res = await fetch(`https://api.imgur.com/3/album/${this._imgurConfig.albumId}`, {
          headers: { 'Authorization': 'Client-ID 546c25a59c58ad7' }
        });
        if (!res.ok) return this._tryImmichOrPlaceholders();
        const data = await res.json();
        if (data.data?.images?.length) {
          this._images = data.data.images.map(img => img.link);
          console.log('[Immich] Loaded', this._images.length, 'photos from Imgur');
          return this._images;
        }
        return this._tryImmichOrPlaceholders();
      } catch (e) {
        console.error('[Immich] Imgur fetch failed:', e);
        return this._tryImmichOrPlaceholders();
      }
    }
    return this._tryImmichOrPlaceholders();
  },

  async _tryImmichOrPlaceholders() {
    const s          = Hub.state.settings || {};
    const immichUrl  = this._hardcodedConfig.immichUrl  || s.immich_base_url || '';
    const immichKey  = this._hardcodedConfig.immichKey  || s.immich_api_key  || '';
    const useLibrary = this._hardcodedConfig.useWholeLibrary ?? false;

    if (!immichUrl || !immichKey) return this._usePlaceholders();

    if (useLibrary) {
      try {
        const res = await fetch(`${immichUrl}/api/assets`, {
          headers: { 'x-api-key': immichKey, 'Accept': 'application/json' }
        });
        if (!res.ok) return this._usePlaceholders();
        const assets = await res.json();
        const imgs   = assets.filter(a => a.type === 'IMAGE' && !a.isTrashed);
        this._images = imgs.map(a => `${immichUrl}/api/assets/${a.id}/thumbnail?size=preview`);
        if (this._images.length) return this._images;
      } catch {
        console.log('[Immich] Local Immich unreachable');
      }
    }
    return this._usePlaceholders();
  },

  _usePlaceholders() {
    this._images = [
      'https://picsum.photos/seed/home1/1200/800',
      'https://picsum.photos/seed/home2/1200/800',
      'https://picsum.photos/seed/home3/1200/800',
      'https://picsum.photos/seed/home4/1200/800',
      'https://picsum.photos/seed/home5/1200/800',
      'https://picsum.photos/seed/home6/1200/800',
      'https://picsum.photos/seed/home7/1200/800',
      'https://picsum.photos/seed/home8/1200/800',
    ];
    return this._images;
  },

  async refreshPhotos() {
    this._images = [];
    await this.fetchImages();
    await this.renderDashboardWidget();
    Hub.ui.toast('Photos refreshed', 'success');
  },

  async renderDashboardWidget() {
    const el = Hub.utils.$('immichDashboardWidget');
    if (!el) return;
    let images = this._images;
    if (!images.length) images = await this.fetchImages();
    if (!images.length) {
      el.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">No photos available.</p>';
      return;
    }
    const shuffled = [...images].sort(() => Math.random() - 0.5).slice(0, 6);
    el.innerHTML = `
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
        ${shuffled.map(url => `
          <div class="aspect-video bg-gray-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all cursor-pointer">
            <img src="${Hub.utils.esc(url)}" alt="Photo" class="w-full h-full object-cover" loading="lazy"
              onerror="this.parentElement.innerHTML='<div class=\\'flex items-center justify-center h-full text-gray-600\\'>📷</div>'">
          </div>`).join('')}
      </div>`;
  },

  /** Start the RAF-driven crossfade slideshow on the standby screen */
  async startStandbySlideshow() {
    this.stopStandbySlideshow(); // stop any running instance

    let images = this._images;
    if (!images.length) images = await this.fetchImages();
    if (!images.length) { console.warn('[Immich] No images for slideshow'); return; }

    // Shuffle for variety
    images = [...images].sort(() => Math.random() - 0.5);
    this._images = images;

    const layerA = document.getElementById('slideshowLayerA');
    const layerB = document.getElementById('slideshowLayerB');
    if (!layerA || !layerB) {
      console.warn('[Immich] #slideshowLayerA / #slideshowLayerB not found in DOM');
      return;
    }

    const ss       = this._ss;
    ss.images      = images;
    ss.index       = 0;
    ss.isTransitioning = false;
    ss.paused      = false;
    ss.layerA      = layerA;
    ss.layerB      = layerB;
    ss.activeLayer = 'A';

    // Show first image immediately on layer A
    layerA.src           = images[0];
    layerA.style.opacity = '1';
    layerA.style.zIndex  = '2';
    layerB.style.opacity = '0';
    layerB.style.zIndex  = '1';

    // Wait for first image to load, then start timer
    await ss.preload(images[0]);
    ss.lastSwitchTime = performance.now();

    // Preload second image silently in background
    if (images.length > 1) ss.preload(images[1]);

    // Start RAF loop
    ss.rafId = requestAnimationFrame(t => ss.tick(t));

    // Pause/resume on tab visibility change — no skip, no fast-forward
    this._visibilityHandler = () => {
      if (document.hidden) {
        ss.paused = true;
        console.log('[Slideshow] Paused — tab hidden');
      } else {
        ss.lastSwitchTime = performance.now(); // reset timer so image shows for full 20s again
        ss.paused = false;
        console.log('[Slideshow] Resumed — tab visible');
      }
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);
    console.log('[Slideshow] Started —', images.length, 'photos — 20s each');
  },

  stopStandbySlideshow() {
    this._ss.stop();
    this._ss.paused = false;
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
    console.log('[Slideshow] Stopped');
  },

  // Legacy alias
  async loadStandbyPhotos() { await this.startStandbySlideshow(); }
};
