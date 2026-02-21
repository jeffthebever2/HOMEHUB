// ============================================================
// assets/radio.js — Live Radio Streaming
// Uses single HTMLAudioElement for performance
// Integrates with player.js for unified Now Playing state
// ============================================================

window.Hub = window.Hub || {};

Hub.radio = {
  currentStation: null,

  /** Initialize radio page */
  init() {
    console.log('[Radio] Initializing...');
    
    // Render station list
    this.render();
    
    console.log('[Radio] Ready');
  },

  /** Render radio page */
  render() {
    const container = document.getElementById('radioStationList');
    if (!container) return;

    const stations = window.HOME_HUB_CONFIG?.radio?.stations || [];
    
    if (stations.length === 0) {
      container.innerHTML = `
        <div class="text-center text-gray-400 py-8">
          <p>No radio stations configured</p>
          <p class="text-sm mt-2">Edit config.js to add stations</p>
        </div>
      `;
      return;
    }

    container.innerHTML = stations.map((station, index) => `
      <div class="card hover:bg-gray-700 transition-all cursor-pointer" 
           onclick="Hub.radio.playStation(${index})">
        <div class="flex items-center gap-4">
          <div style="width:40px;height:40px;border-radius:8px;background:rgba(59,130,246,.15);border:1px solid rgba(59,130,246,.3);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#60a5fa;">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px;" aria-hidden="true"><path d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"/></svg>
            </div>
          <div class="flex-1">
            <h3 class="font-bold text-lg">${station.name}</h3>
            ${station.websiteUrl ? `
              <a href="${station.websiteUrl}" 
                 target="_blank" 
                 onclick="event.stopPropagation()" 
                 class="text-blue-400 hover:text-blue-300 text-sm">
                Visit website →
              </a>
            ` : ''}
          </div>
          ${this.currentStation === index && Hub.player.state.isPlaying 
            ? '<span class="text-green-400 font-semibold">▶ Playing</span>'
            : '<span class="text-gray-400">Tap to play</span>'
          }
        </div>
      </div>
    `).join('');
  },

  /** Play a station by index */
  playStation(index) {
    const stations = window.HOME_HUB_CONFIG?.radio?.stations || [];
    const station = stations[index];
    
    if (!station) {
      console.error('[Radio] Invalid station index:', index);
      return;
    }

    console.log('[Radio] Playing:', station.name);
    
    this.currentStation = index;
    Hub.player.playRadio(station.name, station.streamUrl);
    
    // Re-render to update UI
    this.render();
  },

  /** Stop current station */
  stop() {
    Hub.player.stop();
    this.currentStation = null;
    this.render();
  },

  /** Handle page enter */
  onEnter() {
    console.log('[Radio] Page entered');
    this.render();
  },

  /** Handle page leave */
  onLeave() {
    console.log('[Radio] Page left');
    // Don't stop playback - let it continue in background
  }
};
