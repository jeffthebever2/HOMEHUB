// ============================================================
// assets/photos.js — Mixed-pool photo slideshow
//
// Fetches Cloudflare R2 AND Imgur in parallel, merges both into
// one shuffled pool. No provider selection, no settings UI —
// sources are hardcoded in config.js. If both fail, falls back
// to placeholders so the slideshow is NEVER blank.
// ============================================================
window.Hub = window.Hub || {};

Hub.photos = {
  _provider: 'loading',
  _images:   [],
  _lastFetchTime: 0,
  _MIN_IMAGES: 1,        // any image is better than placeholders
  _SOURCE_TIMEOUT: 6000, // 6s per source (parallel, so total ~6s)

  // ── Timeout wrapper ─────────────────────────────────────────
  _withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
    ]);
  },

  // ── MASTER FETCH: parallel Cloudinary + Imgur, merge, shuffle ──
  async getImages() {
    // Fire both sources at the same time. Promise.allSettled means a
    // failure in one never blocks the other — we just use whatever
    // came back.
    const results = await Promise.allSettled([
      this._withTimeout(this._fetchCloudinary(), this._SOURCE_TIMEOUT),
      this._withTimeout(this._fetchImgur(),      this._SOURCE_TIMEOUT),
    ]);

    const [cldRes, imgurRes] = results;
    const pool = [];
    const sources = [];

    if (cldRes.status === 'fulfilled' && Array.isArray(cldRes.value) && cldRes.value.length) {
      pool.push(...cldRes.value);
      sources.push(`cloudinary(${cldRes.value.length})`);
    } else if (cldRes.status === 'rejected') {
      console.warn('[Photos] Cloudinary failed:', cldRes.reason?.message || cldRes.reason);
    }

    if (imgurRes.status === 'fulfilled' && Array.isArray(imgurRes.value) && imgurRes.value.length) {
      pool.push(...imgurRes.value);
      sources.push(`imgur(${imgurRes.value.length})`);
    } else if (imgurRes.status === 'rejected') {
      console.warn('[Photos] Imgur failed:', imgurRes.reason?.message || imgurRes.reason);
    }

    if (pool.length >= this._MIN_IMAGES) {
      // Dedupe then shuffle so the mix is interleaved, not grouped by source
      const merged = [...new Set(pool)].sort(() => Math.random() - 0.5);
      this._provider = sources.join('+') || 'mixed';
      this._images = merged;
      this._lastFetchTime = Date.now();
      console.log(`[Photos] ✓ mixed pool: ${merged.length} images from ${sources.join(' + ')}`);
      return merged;
    }

    // Absolute last resort: placeholders (NEVER blank)
    console.warn('[Photos] All sources empty — using placeholders');
    this._provider = 'placeholders';
    this._images = this._placeholders();
    return this._images;
  },

  // ── Cloudinary Delivery (via Vercel Serverless Proxy) ─────────
  async _fetchCloudinary() {
    const cfg = window.HOME_HUB_CONFIG?.cloudinary || {};
    const cloudName = cfg.cloudName;
    const tagName = cfg.tagName || 'homehub';
    if (!cloudName) throw new Error('no cloudName in config');

    const apiBase = window.HOME_HUB_CONFIG?.apiBase || '';
    const resp = await fetch(`${apiBase}/api/cloudinary-album?cloudName=${encodeURIComponent(cloudName)}&tagName=${encodeURIComponent(tagName)}`);
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || 'Serverless Proxy HTTP ' + resp.status);
    }
    const data = await resp.json();

    if (!data.photos?.length) throw new Error('Cloudinary tag empty or failed to load photos');
    return data.photos;
  },

  // ── Imgur ───────────────────────────────────────────────────
  async _fetchImgur() {
    const cfg     = window.HOME_HUB_CONFIG?.imgur || {};
    const albumId = cfg.albumId || 'kAG2MS3';
    if (!albumId) throw new Error('no imgur albumId in config');

    const res = await fetch(`https://api.imgur.com/3/album/${encodeURIComponent(albumId)}`, {
      headers: { Authorization: 'Client-ID 546c25a59c58ad7' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.data?.images?.length) throw new Error('album empty');
    return data.data.images.map(img => img.link);
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

    // Show first image immediately on layer A (set both bg + fg children)
    ss._applyImage(layerA, images[0]);
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

  // ── Diagnostics (callable from console: Hub.photos.diagnose()) ─
  async diagnose() {
    const results = { timestamp: new Date().toISOString(), sources: {} };

    // Cloudinary
    try {
      const t0 = Date.now();
      const imgs = await this._withTimeout(this._fetchCloudinary(), 5000);
      results.sources.cloudinary = { status: 'ok', images: imgs.length, latencyMs: Date.now() - t0 };
    } catch (e) {
      results.sources.cloudinary = { status: 'error', error: e.message };
    }

    // Imgur
    try {
      const t0 = Date.now();
      const imgs = await this._withTimeout(this._fetchImgur(), 5000);
      results.sources.imgur = { status: 'ok', images: imgs.length, latencyMs: Date.now() - t0 };
    } catch (e) {
      results.sources.imgur = { status: 'error', error: e.message };
    }

    results.currentPool     = this._provider;
    results.currentImages   = this._images.length;

    console.log('[Photos] Diagnostics:', JSON.stringify(results, null, 2));
    return results;
  },

  async testWorkerUrl() {
    const el = document.getElementById('cfDiagStatus');
    const btn = document.getElementById('btnCfTestUrl');
    if (!el) return;

    el.classList.remove('hidden');
    el.innerHTML = 'Testing Cloudinary Connection...';
    btn.disabled = true;

    try {
      const cfg = window.HOME_HUB_CONFIG?.cloudinary || {};
      const cloudName = cfg.cloudName;
      const tagName = cfg.tagName || 'homehub';
      if (!cloudName) {
        el.innerHTML = '❌ Error: cloudinary.cloudName is not defined in config.js.';
        return;
      }

      const apiBase = window.HOME_HUB_CONFIG?.apiBase || '';
      el.innerHTML = `📡 Querying Secure Serverless Proxy:\nGET ${apiBase}/api/cloudinary-album?cloudName=${cloudName}&tagName=${tagName}...`;
      
      const t0 = performance.now();
      const resp = await fetch(`${apiBase}/api/cloudinary-album?cloudName=${encodeURIComponent(cloudName)}&tagName=${encodeURIComponent(tagName)}`);
      const latency = Math.round(performance.now() - t0);
      
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        el.innerHTML = `❌ Error: HTTP ${resp.status}\nResponse: ${data.error || 'unknown error'}\n\nHint: Verify your Cloudinary API Key and Secret are correct, and your internet is active.`;
        return;
      }

      const data = await resp.json();
      el.innerHTML = `✅ Connection Successful! (${latency}ms)\n\nPhotos Found: ${data.count || 0}\nCloud Name: ${cloudName}\nTag Name: ${tagName}`;
    } catch (e) {
      el.innerHTML = `❌ Connection Failed!\n\nError: ${e.message}\n\nHint:\n1. Verify your network connection.\n2. Ensure your serverless functions are deployed.`;
    } finally {
      btn.disabled = false;
    }
  },

  async runDiagnostics() {
    const el = document.getElementById('cfDiagStatus');
    const btn = document.getElementById('btnCfDiag');
    if (!el) return;

    el.classList.remove('hidden');
    el.innerHTML = 'Initializing Secure Cloudinary Diagnostics...';
    btn.disabled = true;

    try {
      const cfg = window.HOME_HUB_CONFIG?.cloudinary || {};
      const cloudName = cfg.cloudName;
      const tagName = cfg.tagName || 'homehub';
      
      if (!cloudName) {
        el.innerHTML = '❌ Error: cloudinary.cloudName is not defined in config.js.';
        return;
      }

      el.innerHTML = `1. Resolving Cloudinary config...\n`;
      el.innerHTML += `   Cloud Name: "${cloudName}"\n`;
      el.innerHTML += `   Tag Name: "${tagName}"\n\n`;

      el.innerHTML += `2. Querying Secure Serverless Proxy...\n`;
      const apiBase = window.HOME_HUB_CONFIG?.apiBase || '';
      el.innerHTML += `   GET ${apiBase}/api/cloudinary-album?cloudName=${cloudName}&tagName=${tagName}...\n`;

      const t0 = performance.now();
      const resp = await fetch(`${apiBase}/api/cloudinary-album?cloudName=${encodeURIComponent(cloudName)}&tagName=${encodeURIComponent(tagName)}`);
      const latency = Math.round(performance.now() - t0);

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        el.innerHTML += `\n❌ Cloudinary Fetch Failed (HTTP ${resp.status})!\nError: ${data.error || 'unknown'}\n\nTroubleshooting Hint:\n- Check that the Cloudinary credentials (API Key & Secret) match your dashboard exactly.\n- Make sure you actually applied the tag "${tagName}" to at least one image in Cloudinary!`;
        return;
      }

      const data = await resp.json();
      el.innerHTML += `   Latency: ${latency}ms\n`;
      el.innerHTML += `   Status: ✅ Fetched successfully!\n`;
      el.innerHTML += `   Photos Found: ${data.count || 0} images with tag "${tagName}"\n\n`;

      if (data.photos?.length > 0) {
        el.innerHTML += `3. Verifying image delivery & reachability...\n`;
        const firstPhoto = data.photos[0];
        el.innerHTML += `   First Image URL: ${firstPhoto}\n`;
        el.innerHTML += `   Testing image reachability fetch...\n`;

        try {
          const imgResp = await fetch(firstPhoto, { method: 'HEAD' });
          if (imgResp.ok) {
            el.innerHTML += `   ✅ Image reachable! Content-Type: ${imgResp.headers.get('Content-Type') || 'image'}\n\n🎉 DIAGNOSTICS COMPLETE: Cloudinary secure serverless integration is working perfectly!`;
          } else {
            el.innerHTML += `   ❌ Image HEAD check returned HTTP ${imgResp.status}.\n\n🎉 DIAGNOSTICS COMPLETE: Listing works but image load returned an error. Check Cloudinary asset delivery settings.`;
          }
        } catch (imgErr) {
          el.innerHTML += `   ❌ Image head fetch threw error: ${imgErr.message}\n\n🎉 DIAGNOSTICS COMPLETE: Listing works, but CORS blocks HEAD checks. The image should still render successfully in your slideshow!`;
        }
      } else {
        el.innerHTML += `\n⚠️ Warning: No photos have the tag "${tagName}".\n\nHint:\n- Log in to your Cloudinary Console.\n- Select your family photos and apply the tag "${tagName}" to them.`;
      }
    } catch (e) {
      el.innerHTML += `\n❌ Diagnostic Error: ${e.message}\n\nHint:\n- Double check your cloudName.\n- Make sure the client browser is online.`;
    } finally {
      btn.disabled = false;
    }
  }
};
