import { apiFetch } from '../../core/api.js';
import { bindRouteButtons, formatDateTime } from '../../core/format.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { errorState, loadingState } from '../../ui/state.js';
import { pushToast } from '../../ui/toast.js';
import { renderAlertsView } from './alertsView.js';
import { renderWeatherView } from './weatherView.js';

export async function renderEnvironmentPage(container, mode = 'weather') {
  let intervalId = null;

  async function load() {
    container.innerHTML = loadingState(mode === 'alerts' ? 'Loading alerts…' : 'Loading weather…');
    try {
      const payload = await apiFetch('/api/environment');
      const title = mode === 'alerts' ? 'Alerts & Severe Weather' : 'Weather';
      const subtitle = `${mode === 'alerts' ? 'Threats and response guidance' : 'Forecast, radar, and impact outlook'} · Updated ${formatDateTime(payload.meta.fetchedAt)}`;
      container.innerHTML = `
        ${pageHeader({
          kicker: 'Environment',
          title,
          subtitle,
          actions: `
            <button id="hh-environment-refresh" class="hh-btn hh-btn-secondary">Refresh</button>
            <button class="hh-btn hh-btn-secondary" data-route="${mode === 'alerts' ? 'weather' : 'alerts'}">${mode === 'alerts' ? 'Open Weather' : 'Open Alerts'}</button>
          `,
        })}
        ${mode === 'alerts' ? renderAlertsView(payload) : renderWeatherView(payload)}
      `;
      bindRouteButtons(container);
      container.querySelector('#hh-environment-refresh')?.addEventListener('click', async () => {
        pushToast('Refreshing environment…');
        await load();
      });
      window.clearInterval(intervalId);
      intervalId = window.setInterval(load, payload.summary.risk.level >= 3 ? 60000 : 300000);
    } catch (error) {
      container.innerHTML = `
        ${pageHeader({ kicker: 'Environment', title: mode === 'alerts' ? 'Alerts & Severe Weather' : 'Weather', subtitle: 'HomeHub could not load this view.' })}
        ${errorState('Environment unavailable', error.message)}
      `;
    }
  }

  await load();
  return () => window.clearInterval(intervalId);
}
