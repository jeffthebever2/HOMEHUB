// ============================================================
// public/assets/radio.js — Radio page (TuneIn iframe)
// Streaming is handled by TuneIn embed.
// This module only manages Bluetooth audio output.
// ============================================================
window.Hub = window.Hub || {};

Hub.radio = {
  _btDevice: null,

  init() {
    console.log('[Radio] Initializing (TuneIn embed mode)');
    // Restore saved BT device label if any
    this._restoreBtLabel();
  },

  _restoreBtLabel() {
    const saved = localStorage.getItem('hub_bt_device_radio');
    const statusEl = document.getElementById('radioBtStatus');
    const btn      = document.getElementById('btnRadioBluetooth');
    if (saved && statusEl) statusEl.textContent = `Connected: ${saved}`;
    if (saved && btn) btn.textContent = 'Disconnect';
  },

  async handleBluetooth() {
    const btn      = document.getElementById('btnRadioBluetooth');
    const statusEl = document.getElementById('radioBtStatus');

    // Disconnect flow
    if (localStorage.getItem('hub_bt_device_radio') && this._btDevice) {
      try { if (this._btDevice.gatt?.connected) this._btDevice.gatt.disconnect(); } catch (_) {}
      this._btDevice = null;
      localStorage.removeItem('hub_bt_device_radio');
      if (statusEl) statusEl.textContent = 'Disconnected';
      if (btn) btn.textContent = 'Connect Bluetooth';
      Hub.ui?.toast?.('Bluetooth disconnected', 'info');
      return;
    }

    // Browser / security guards
    if (!window.isSecureContext) {
      Hub.ui?.toast?.('Bluetooth requires HTTPS', 'error');
      if (statusEl) statusEl.textContent = 'Requires HTTPS';
      return;
    }
    if (!navigator.bluetooth) {
      if (statusEl) statusEl.textContent = 'Not supported — use Chrome on Desktop/Android';
      Hub.ui?.toast?.('Web Bluetooth is not supported in this browser', 'error');
      return;
    }

    // Connect flow
    if (btn) { btn.disabled = true; btn.textContent = 'Scanning…'; }
    if (statusEl) statusEl.textContent = 'Opening device picker…';

    try {
      const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
      this._btDevice = device;
      const name = device.name || device.id || 'Unknown Device';
      localStorage.setItem('hub_bt_device_radio', name);
      if (statusEl) statusEl.textContent = `Connected: ${name}`;
      if (btn) { btn.disabled = false; btn.textContent = 'Disconnect'; }
      Hub.ui?.toast?.(`Bluetooth connected: ${name}`, 'success');

      device.addEventListener('gattserverdisconnected', () => {
        localStorage.removeItem('hub_bt_device_radio');
        this._btDevice = null;
        const s = document.getElementById('radioBtStatus');
        const b = document.getElementById('btnRadioBluetooth');
        if (s) s.textContent = 'Disconnected';
        if (b) { b.disabled = false; b.textContent = 'Connect Bluetooth'; }
        Hub.ui?.toast?.('Bluetooth device disconnected', 'info');
      });
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        console.error('[Radio] Bluetooth error:', err);
        if (statusEl) statusEl.textContent = `Error: ${err.message}`;
        Hub.ui?.toast?.(`Bluetooth: ${err.message}`, 'error');
      } else {
        // User cancelled picker — silently reset
        if (statusEl) statusEl.textContent = localStorage.getItem('hub_bt_device_radio') || 'No device connected';
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Connect Bluetooth'; }
    }
  },

  onEnter() {
    console.log('[Radio] Page entered');
    this._restoreBtLabel();
  },

  onLeave() {
    console.log('[Radio] Page left');
  }
};
