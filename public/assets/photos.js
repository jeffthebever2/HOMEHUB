// ============================================================
// assets/photos.js — Unified photo provider (UNBREAKABLE)
//
// Fallback chain: Google Photos → Immich → Imgur → Placeholders
// The slideshow NEVER shows a blank screen.
//
// Each provider has a 5-second timeout. If one fails, the next
// is tried automatically. Placeholders are the last resort.
// ============================================================
window.Hub = window.Hub || {};

Hub.photos = {
  _provider: 'loading',
  _images:   [],
  _lastFetchTime: 0,
  _MIN_IMAGES: 3,        // minimum images to consider a provider "working"
  _PROVIDER_TIMEOUT: 5000, // 5s per provider

  // ── Read saved provider preference ───────────────────────
  _loadProvider() {
    const s = Hub.state?.settings || {};
    return s.photo_provider
      || localStorage.getItem('photo_provider')
      || (Hub.immich?._imgurConfig?.useImgur ? 'imgur' : 'immich');
  },

  _getImgurAlbumId() {
    return (Hub.state?.settings?.imgur_album_id)
      || localStorage.getItem('imgur_album_id')
      || Hub.immich?._imgurConfig?.albumId
      || 'kAG2MS3';
  },

  _getGoogleAlbumId() {
    return (Hub.state?.settings?.google_photos_album_id)
      || localStorage.getItem('google_photos_album_id')
      || null;
  },

  // ── Timeout wrapper ─────────────────────────────────────────
  _withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
    ]);
  },

  // ── MASTER FETCH: tries providers in order ──────────────────
  async getImages() {
    const preferred = this._loadProvider();
    console.log('[Photos] Preferred provider:', preferred);

    // Build provider chain based on preference
    const chain = this._buildChain(preferred);

    for (const { name, fetcher } of chain) {
      try {
        const images = await this._withTimeout(fetcher(), this._PROVIDER_TIMEOUT);
        if (Array.isArray(images) && images.length >= this._MIN_IMAGES) {
          this._provider = name;
          this._images = images;
          this._lastFetchTime = Date.now();
          console.log(`[Photos] ✓ ${name}: ${images.length} images`);
          return images;
        }
        console.log(`[Photos] ${name}: only ${images?.length || 0} images, trying next`);
      } catch (e) {
        console.warn(`[Photos] ${name} failed:`, e.message);
      }
    }

    // Absolute last resort: placeholders (NEVER blank)
    console.warn('[Photos] All providers failed — using placeholders');
    this._provider = 'placeholders';
    this._images = this._placeholders();
    return this._images;
  },

  _buildChain(preferred) {
    const providers = {
      google:  { name: 'google_photos',  fetcher: () => this._fetchGooglePhotos() },
      imgur:   { name: 'imgur',           fetcher: () => this._fetchImgur() },
      immich:  { name: 'immich',          fetcher: () => this._fetchImmich() },
    };

    // Put preferred first, then the rest, always end with placeholders
    const chain = [];
    if (preferred && providers[preferred]) {
      chain.push(providers[preferred]);
    }
    for (const [key, p] of Object.entries(providers)) {
      if (key !== preferred) chain.push(p);
    }
    return chain;
  },

  // ── Google Photos (server-side endpoint) ────────────────────
  async _fetchGooglePhotos() {
    const albumId = this._getGoogleAlbumId();
    const base = Hub.utils?.apiBase?.() || '';
    let url = `${base}/api/google-photos?action=images&pageSize=50`;
    if (albumId) url += `&albumId=${encodeURIComponent(albumId)}`;

    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();

    if (data.degraded) {
      console.warn('[Photos] Google Photos degraded:', data.error);
      throw new Error(data.error || 'degraded');
    }

    if (!data.images?.length) throw new Error('No images returned');
    return data.images.map(img => img.url);
  },

  // ── Imgur ───────────────────────────────────────────────────
  async _fetchImgur() {
    const albumId = this._getImgurAlbumId();
    const res = await fetch(`https://api.imgur.com/3/album/${albumId}`, {
      headers: { Authorization: 'Client-ID 546c25a59c58ad7' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.data?.images?.length) throw new Error('No images');
    return data.data.images.map(img => img.link);
  },

  // ── Immich ─────────────────────────────────────────────────
  async _fetchImmich() {
    const s   = Hub.state?.settings || {};
    const url = s.immich_base_url || '';
    const key = s.immich_api_key  || '';
    if (!url || !key) throw new Error('Not configured');

    const res = await fetch(`${url}/api/assets`, {
      headers: { 'x-api-key': key, Accept: 'application/json' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const assets = await res.json();
    const imgs = assets.filter(a => a.type === 'IMAGE' && !a.isTrashed);
    if (!imgs.length) throw new Error('No images');
    return imgs.map(a => `${url}/api/assets/${a.id}/thumbnail?size=preview`);
  },

  // ── Placeholders (always works, NEVER empty) ───────────────
  _placeholders() {
    return [
      'https://picsum.photos/seed/home1/1920/1080',
      'https://picsum.photos/seed/home2/1920/1080',
      'https://picsum.photos/seed/home3/1920/1080',
      'https://picsum.photos/seed/home4/1920/1080',
      'https://picsum.photos/seed/home5/1920/1080',
      'https://picsum.photos/seed/home6/1920/1080',
    ];
  },

  // ── Slideshow (delegates to Hub.immich._ss engine) ──────────
  async startStandbySlideshow() {
    Hub.immich.stopStandbySlideshow(); // clear any running instance

    let images;
    try {
      images = await this._withTimeout(this.getImages(), 12000);
    } catch (e) {
      console.warn('[Photos] Slideshow fetch timed out, using placeholders');
      images = this._placeholders();
    }
    if (!images || !images.length) images = this._placeholders();

    // Shuffle
    images = [...images].sort(() => Math.random() - 0.5);
    // Dedupe
    images = [...new Set(images)];

    Hub.immich._images = images;

    const ss     = Hub.immich._ss;
    const layerA = document.getElementById('slideshowLayerA');
    const layerB = document.getElementById('slideshowLayerB');
    if (!layerA || !layerB) { console.warn('[Photos] slideshow DOM not ready'); return; }

    ss.images      = images;
    ss.index       = 0;
    ss.isTransitioning = false;
    ss.paused      = false;
    ss.layerA      = layerA;
    ss.layerB      = layerB;
    ss.activeLayer = 'A';

    // Show first image immediately
    layerA.src           = images[0];
    layerA.style.opacity = '1';
    layerA.style.zIndex  = '2';
    layerB.style.opacity = '0';
    layerB.style.zIndex  = '1';

    await ss.preload(images[0]);
    ss.lastSwitchTime = performance.now();
    if (images.length > 1) ss.preload(images[1]);
    ss.rafId = requestAnimationFrame(t => ss.tick(t));

    // Visibility-aware pause
    if (Hub.immich._visibilityHandler) {
      document.removeEventListener('visibilitychange', Hub.immich._visibilityHandler);
    }
    Hub.immich._visibilityHandler = () => {
      if (document.hidden) {
        ss.paused = true;
      } else {
        ss.lastSwitchTime = performance.now();
        ss.paused = false;
      }
    };
    document.addEventListener('visibilitychange', Hub.immich._visibilityHandler);
    console.log('[Photos] Slideshow started —', images.length, 'images via', this._provider);

    // Background refresh: re-fetch images every 30 min and hot-swap
    this._startBackgroundRefresh();
  },

  _bgRefreshTimer: null,
  _startBackgroundRefresh() {
    clearInterval(this._bgRefreshTimer);
    this._bgRefreshTimer = setInterval(async () => {
      try {
        const fresh = await this._withTimeout(this.getImages(), 10000);
        if (fresh?.length >= this._MIN_IMAGES) {
          const shuffled = [...new Set([...fresh].sort(() => Math.random() - 0.5))];
          Hub.immich._ss.images = shuffled;
          Hub.immich._images = shuffled;
          console.log('[Photos] Background refresh: swapped in', shuffled.length, 'images');
        }
      } catch (e) {
        console.warn('[Photos] Background refresh failed (non-critical):', e.message);
      }
    }, 30 * 60 * 1000); // 30 minutes
  },

  stopStandbySlideshow() {
    clearInterval(this._bgRefreshTimer);
    Hub.immich.stopStandbySlideshow();
  },

  // ── Dashboard thumbnail grid ──────────────────────────────
  async renderDashboardWidget() {
    const el = Hub.utils.$('immichDashboardWidget');
    if (!el) return;

    let images = this._images;
    if (!images.length) {
      try {
        images = await this._withTimeout(this.getImages(), 8000);
      } catch (e) {
        images = this._placeholders();
      }
    }
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

  // ── Diagnostics (callable from console) ─────────────────────
  async diagnose() {
    const results = { timestamp: new Date().toISOString(), providers: {} };
    const base = Hub.utils?.apiBase?.() || '';

    // Google Photos server
    try {
      const t0 = Date.now();
      const resp = await fetch(`${base}/api/google-photos?action=images&pageSize=5`);
      const data = await resp.json();
      results.providers.google_photos = {
        status: data.degraded ? 'degraded' : 'ok',
        images: data.images?.length || 0,
        error: data.error || null,
        latencyMs: Date.now() - t0
      };
    } catch (e) {
      results.providers.google_photos = { status: 'error', error: e.message };
    }

    // Imgur
    try {
      const t0 = Date.now();
      const imgs = await this._withTimeout(this._fetchImgur(), 5000);
      results.providers.imgur = { status: 'ok', images: imgs.length, latencyMs: Date.now() - t0 };
    } catch (e) {
      results.providers.imgur = { status: 'error', error: e.message };
    }

    // Immich
    try {
      const t0 = Date.now();
      const imgs = await this._withTimeout(this._fetchImmich(), 5000);
      results.providers.immich = { status: 'ok', images: imgs.length, latencyMs: Date.now() - t0 };
    } catch (e) {
      results.providers.immich = { status: 'error', error: e.message };
    }

    results.currentProvider = this._provider;
    results.currentImages = this._images.length;

    console.log('[Photos] Diagnostics:', JSON.stringify(results, null, 2));
    return results;
  }
};
