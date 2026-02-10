// ============================================================
// assets/immich.js — Immich shared album photos
// ============================================================
window.Hub = window.Hub || {};

Hub.immich = {
  _images: [],
  _currentPhotoIndex: 0,
  _photoRotateInterval: null,

  // IMGUR ALBUM CONFIGURATION
  _imgurConfig: {
    albumId: '1siWAzN',
    useImgur: true
  },

  // HARDCODED IMMICH CONFIGURATION (fallback)
  _hardcodedConfig: {
    immichUrl: 'http://192.168.7.248:2283',
    immichKey: 'LH6mLNi6tO8whoeiRkgkQkDjK7hmCUsAba02l7iazNI',
    useWholeLibrary: true
  },

  /** Fetch images from Imgur album or Immich library */
  async fetchImages() {
    // Try Imgur first if enabled
    if (this._imgurConfig.useImgur && this._imgurConfig.albumId) {
      try {
        console.log('[Immich] Fetching from Imgur album:', this._imgurConfig.albumId);
        
        // Fetch album data from Imgur API
        const response = await fetch(`https://api.imgur.com/3/album/${this._imgurConfig.albumId}`, {
          headers: {
            'Authorization': 'Client-ID 546c25a59c58ad7' // Public Imgur client ID
          }
        });

        if (!response.ok) {
          console.error('[Immich] Imgur API failed:', response.status);
          return this._tryImmichOrPlaceholders();
        }

        const data = await response.json();
        
        if (data.data && data.data.images) {
          // Extract image URLs from album
          this._images = data.data.images.map(img => img.link);
          console.log('[Immich] ✓ Loaded', this._images.length, 'photos from Imgur album');
          return this._images;
        } else {
          console.warn('[Immich] No images found in Imgur album');
          return this._tryImmichOrPlaceholders();
        }
      } catch (e) {
        console.error('[Immich] Error fetching from Imgur:', e);
        return this._tryImmichOrPlaceholders();
      }
    }

    // Fallback to Immich or placeholders
    return this._tryImmichOrPlaceholders();
  },

  /** Try Immich library or use placeholders */
  async _tryImmichOrPlaceholders() {
    const s = Hub.state.settings || {};
    
    // Use hardcoded config
    const immichUrl = this._hardcodedConfig.immichUrl || s.immich_base_url || '';
    const immichKey = this._hardcodedConfig.immichKey || s.immich_api_key || '';
    const useWholeLibrary = this._hardcodedConfig.useWholeLibrary !== undefined 
      ? this._hardcodedConfig.useWholeLibrary 
      : false;

    if (!immichUrl || !immichKey) {
      console.log('[Immich] No Immich configuration, using placeholders');
      return this._usePlaceholders();
    }

    // Try to fetch from Immich (only works on local network)
    if (useWholeLibrary) {
      try {
        console.log('[Immich] Trying local Immich library:', immichUrl);
        
        const response = await fetch(`${immichUrl}/api/assets`, {
          headers: {
            'x-api-key': immichKey,
            'Accept': 'application/json'
          }
        });

        if (!response.ok) {
          console.warn('[Immich] Local Immich not accessible (expected on Vercel)');
          return this._usePlaceholders();
        }

        const assets = await response.json();
        const imageAssets = assets.filter(asset => 
          asset.type === 'IMAGE' && !asset.isTrashed
        );
        
        this._images = imageAssets.map(asset => 
          `${immichUrl}/api/assets/${asset.id}/thumbnail?size=preview`
        );

        if (this._images.length > 0) {
          console.log('[Immich] ✓ Loaded', this._images.length, 'photos from local Immich');
          return this._images;
        }
      } catch (e) {
        console.log('[Immich] Local Immich not reachable (using Imgur instead)');
      }
    }

    // Final fallback to placeholders
    return this._usePlaceholders();
  },

  /** Use placeholder images */
  _usePlaceholders() {
    console.log('[Immich] Using placeholder images');
    this._images = [
      'https://picsum.photos/seed/family1/1200/800',
      'https://picsum.photos/seed/family2/1200/800',
      'https://picsum.photos/seed/family3/1200/800',
      'https://picsum.photos/seed/family4/1200/800',
      'https://picsum.photos/seed/family5/1200/800',
      'https://picsum.photos/seed/family6/1200/800',
      'https://picsum.photos/seed/family7/1200/800',
      'https://picsum.photos/seed/family8/1200/800'
    ];
    return this._images;
  },

  /** Refresh photos (reload from API) */
  async refreshPhotos() {
    console.log('[Immich] Refreshing photos...');
    this._images = [];
    await this.fetchImages();
    await this.renderDashboardWidget();
    Hub.ui.toast('Photos refreshed', 'success');
  },

  /** Render photo grid for dashboard */
  async renderDashboardWidget() {
    const el = Hub.utils.$('immichDashboardWidget');
    if (!el) return;

    let images = this._images;
    if (!images.length) images = await this.fetchImages();
    
    if (!images.length) {
      el.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">No photos available. Configure Immich in Settings or placeholder photos will be used.</p>';
      return;
    }

    // Show 6 random photos in grid
    const shuffled = [...images].sort(() => Math.random() - 0.5).slice(0, 6);
    el.innerHTML = `
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
        ${shuffled.map(url => `
          <div class="aspect-video bg-gray-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all cursor-pointer">
            <img 
              src="${Hub.utils.esc(url)}" 
              alt="Family photo" 
              class="w-full h-full object-cover"
              loading="lazy" 
              onerror="this.parentElement.innerHTML='<div class=\\'flex items-center justify-center h-full text-gray-600\\'>📷</div>'"
            >
          </div>
        `).join('')}
      </div>
    `;
  },

  /** Start rotating photo slideshow for standby mode */
  async startStandbySlideshow() {
    let images = this._images;
    if (!images.length) images = await this.fetchImages();
    
    if (!images.length) {
      console.log('[Immich] No images for slideshow');
      return;
    }

    // Shuffle images for variety
    images = [...images].sort(() => Math.random() - 0.5);
    this._images = images;
    this._currentPhotoIndex = 0;

    // Show first photo immediately
    this._showStandbyPhoto();

    // Rotate every 15 seconds
    this._photoRotateInterval = setInterval(() => {
      this._currentPhotoIndex = (this._currentPhotoIndex + 1) % this._images.length;
      this._showStandbyPhoto();
    }, 15000);

    console.log('[Immich] Slideshow started with', images.length, 'photos');
  },

  /** Show current photo in standby mode with fade effect */
  _showStandbyPhoto() {
    const img = Hub.utils.$('standbyCurrentPhoto');
    if (!img || !this._images.length) return;

    const currentUrl = this._images[this._currentPhotoIndex];
    
    // Fade out
    img.style.opacity = '0';
    
    // Change image after fade
    setTimeout(() => {
      img.src = currentUrl;
      // Fade in
      setTimeout(() => {
        img.style.opacity = '1';
      }, 50);
    }, 500);
  },

  /** Stop slideshow */
  stopStandbySlideshow() {
    if (this._photoRotateInterval) {
      clearInterval(this._photoRotateInterval);
      this._photoRotateInterval = null;
      console.log('[Immich] Slideshow stopped');
    }
  },

  /** Legacy function for old standby photos grid */
  async loadStandbyPhotos() {
    // This function is kept for backward compatibility
    // New standby mode uses startStandbySlideshow instead
    await this.startStandbySlideshow();
  }
};
