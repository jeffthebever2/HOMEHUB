// ============================================================
// assets/immich.js — Immich shared album photos
// ============================================================
window.Hub = window.Hub || {};

Hub.immich = {
  _images: [],

  /** Fetch images from the backend proxy */
  async fetchImages() {
    const base = Hub.utils.apiBase();
    const s = Hub.state.settings || {};
    const immichUrl = s.immich_base_url || window.HOME_HUB_CONFIG?.immichBaseUrl || '';
    const immichKey = s.immich_api_key || window.HOME_HUB_CONFIG?.immichSharedAlbumKeyOrToken || '';
    const albumId = s.immich_album_id || '';

    if (!immichUrl || !immichKey || !albumId) return [];

    try {
      const resp = await fetch(`${base}/api/immich-album?baseUrl=${encodeURIComponent(immichUrl)}&key=${encodeURIComponent(immichKey)}&albumId=${encodeURIComponent(albumId)}`);
      if (!resp.ok) return [];
      const data = await resp.json();
      this._images = data.images || [];
      return this._images;
    } catch (e) {
      console.error('Immich error:', e);
      return [];
    }
  },

  /** Load photos for standby mode */
  async loadStandbyPhotos() {
    const el = Hub.utils.$('standbyPhotos');
    if (!el) return;

    let images = this._images;
    if (!images.length) images = await this.fetchImages();
    if (!images.length) {
      el.innerHTML = '';
      return;
    }

    // Pick 6 random images
    const shuffled = [...images].sort(() => Math.random() - 0.5).slice(0, 6);
    el.innerHTML = `
      <div class="photo-grid h-full p-8">
        ${shuffled.map(url => `<div class="photo-item"><img src="${Hub.utils.esc(url)}" alt="" loading="lazy" onerror="this.style.display='none'"></div>`).join('')}
      </div>
    `;
  }
};
