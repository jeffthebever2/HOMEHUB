import { escapeHtml } from '../core/format.js';

export function loadingState(label = 'Loading…') {
  return `
    <div class="hh-card">
      <div class="hh-state">
        <p class="hh-state-title">${escapeHtml(label)}</p>
        <p class="hh-state-copy">Please wait while HomeHub updates this section.</p>
      </div>
    </div>
  `;
}

export function emptyState(title, copy) {
  return `
    <div class="hh-card">
      <div class="hh-state">
        <p class="hh-state-title">${escapeHtml(title)}</p>
        <p class="hh-state-copy">${escapeHtml(copy)}</p>
      </div>
    </div>
  `;
}

export function errorState(title, copy) {
  return `
    <div class="hh-card hh-card-danger">
      <div class="hh-state">
        <p class="hh-state-title">${escapeHtml(title)}</p>
        <p class="hh-state-copy">${escapeHtml(copy)}</p>
      </div>
    </div>
  `;
}

export function staleState(title, copy) {
  return `
    <div class="hh-card">
      <div class="hh-state">
        <p class="hh-state-title">${escapeHtml(title)}</p>
        <p class="hh-state-copy">${escapeHtml(copy)}</p>
        <span class="hh-badge hh-badge-offline">stale</span>
      </div>
    </div>
  `;
}

export function disconnectedState(title, copy) {
  return `
    <div class="hh-card">
      <div class="hh-state">
        <p class="hh-state-title">${escapeHtml(title)}</p>
        <p class="hh-state-copy">${escapeHtml(copy)}</p>
        <span class="hh-badge hh-badge-offline">disconnected</span>
      </div>
    </div>
  `;
}
