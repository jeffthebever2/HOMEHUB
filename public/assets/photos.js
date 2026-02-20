// ============================================================
// assets/photos.js — Unified photo provider for standby slideshow
//
// Priority order (set by user in Settings):
//   1. google  → Google Photos album via Hub.googlePhotos
//   2. imgur   → Imgur album via Hub.imgur client ID
//   3. immich  → Local Immich via settings
//   4. Off / placeholders
//
// Exposes:
//   Hub.photos.startStandbySlideshow()   — delegates to existing immich._ss engine
//   Hub.photos.stopStandbySlideshow()
//   Hub.photos.getImages()               — returns URL array for current provider
// ============================================================
window.Hub = window.Hub || {};

Hub.photos = {
  _provider: 'imgur',
  _images:   [],

  // ── Read saved provider preference ───────────────────────
  _loadProvider() {
    const s = Hub.state?.settings || {};
    return s.photo_provider
      || localStorage.getItem('photo_provider')
      || Hub.immich?._imgurConfig?.useImgur ? 'imgur' : 'immich';
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

  // ── Fetch images from chosen provider ────────────────────
  async getImages() {
    const provider = this._loadProvider();
    this._provider = provider;

    console.log('[Photos] Provider:', provider);

    if (provider === 'google') {
      const albumId = this._getGoogleAlbumId();
      if (!albumId) {
        console.warn('[Photos] Google Photos: no album selected, falling back');
        return this._fallback();
      }
      try {
        const urls = await Hub.googlePhotos.getAlbumImageUrls(albumId, 200);
        if (Array.isArray(urls) && urls.length > 0) {
          this._images = urls;
          console.log('[Photos] Google Photos:', urls.length, 'images');
          return urls;
        }
        if (urls && urls.error) {
          console.warn('[Photos] Google Photos error:', urls.error);
          // Detect auth/scope issues and show clear guidance
          const err = urls.error || '';
          if (err.includes('403') || err.includes('PERMISSION_DENIED') || err.includes('REQUEST_DENIED')) {
            Hub.ui?.toast?.('Google Photos: permission denied — sign out and back in to re-grant Photos access', 'error');
          } else if (err.includes('401')) {
            Hub.ui?.toast?.('Google Photos: session expired — sign out and back in', 'error');
          } else {
            Hub.ui?.toast?.('Google Photos unavailable — using Imgur fallback', 'info');
          }
        } else {
          console.warn('[Photos] Google Photos returned 0 images, falling back to Imgur');
          Hub.ui?.toast?.('Google Photos album is empty — using Imgur fallback', 'info');
        }
      } catch (e) {
        console.warn('[Photos] Google Photos error:', e.message);
        Hub.ui?.toast?.('Google Photos error — using Imgur fallback', 'info');
      }
      return this._fallback('imgur');
    }

    if (provider === 'imgur') {
      return this._fetchImgur();
    }

    if (provider === 'immich') {
      return this._fetchImmich();
    }

    // 'off' or unknown → placeholders
    return this._placeholders();
  },

  async _fetchImgur() {
    const albumId = this._getImgurAlbumId();
    try {
      const res = await fetch(`https://api.imgur.com/3/album/${albumId}`, {
        headers: { Authorization: 'Client-ID 546c25a59c58ad7' }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data.data?.images?.length) {
        this._images = data.data.images.map(img => img.link);
        console.log('[Photos] Imgur:', this._images.length, 'images');
        return this._images;
      }
    } catch (e) {
      console.warn('[Photos] Imgur error:', e.message);
    }
    return this._fetchImmich();
  },

  async _fetchImmich() {
    const s        = Hub.state?.settings || {};
    // Read Immich config from settings ONLY — never from hardcoded values
    const url      = s.immich_base_url || '';
    const key      = s.immich_api_key  || '';
    const library  = true; // always use whole library when Immich is selected

    if (!url || !key) return this._placeholders();

    try {
      if (library) {
        const res = await fetch(`${url}/api/assets`, {
          headers: { 'x-api-key': key, Accept: 'application/json' }
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const assets = await res.json();
        const imgs = assets.filter(a => a.type === 'IMAGE' && !a.isTrashed);
        if (imgs.length) {
          this._images = imgs.map(a => `${url}/api/assets/${a.id}/thumbnail?size=preview`);
          console.log('[Photos] Immich:', this._images.length, 'images');
          return this._images;
        }
      }
    } catch (e) {
      console.warn('[Photos] Immich error:', e.message);
    }
    return this._placeholders();
  },

  _placeholders() {
    this._images = [
      'https://picsum.photos/seed/home1/1920/1080',
      'https://picsum.photos/seed/home2/1920/1080',
      'https://picsum.photos/seed/home3/1920/1080',
      'https://picsum.photos/seed/home4/1920/1080',
      'https://picsum.photos/seed/home5/1920/1080',
      'https://picsum.photos/seed/home6/1920/1080',
    ];
    return this._images;
  },

  async _fallback(providerOverride) {
    const prev = this._provider;
    this._provider = providerOverride || 'placeholders';
    const result = providerOverride === 'imgur' ? await this._fetchImgur() : this._placeholders();
    this._provider = prev;
    return result;
  },

  // ── Slideshow (delegates to Hub.immich's existing RAF engine) ─
  async startStandbySlideshow() {
    Hub.immich.stopStandbySlideshow(); // clear any running instance

    let images = await this.getImages();
    if (!images.length) images = this._placeholders();

    // Shuffle
    images = [...images].sort(() => Math.random() - 0.5);
    Hub.immich._images = images; // keep immich in sync

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
  },

  stopStandbySlideshow() {
    Hub.immich.stopStandbySlideshow();
  },

  // ── Dashboard thumbnail grid ──────────────────────────────
  async renderDashboardWidget() {
    const el = Hub.utils.$('immichDashboardWidget');
    if (!el) return;

    let images = this._images;
    if (!images.length) images = await this.getImages();
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
  }
};
