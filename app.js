const $ = (sel) => document.querySelector(sel);

const els = {
  form: $('#search-form'),
  input: $('#player-input'),
  demoBtn: $('#demo-btn'),
  skeleton: $('#skeleton'),
  dashboard: $('#dashboard'),
  errorBox: $('#error-box'),
  errorMsg: $('#error-message'),
  kpiGrid: $('#kpi-grid'),
  demoBanner: $('#demo-banner'),
  apiHint: $('#api-hint'),
};

let timelineChart, playlistChart, gaugeChart;

// Init hint API
fetch('/api/health').catch(() => {}); // pas indispensable

function showLoading() {
  els.skeleton.hidden = false;
  els.dashboard.hidden = true;
  els.errorBox.hidden = true;
}

function showError(msg) {
  els.skeleton.hidden = true;
  els.dashboard.hidden = true;
  els.errorBox.hidden = false;
  els.errorMsg.textContent = msg;
}

function hideError() { els.errorBox.hidden = true; }

// Formater les dates
const fmtDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
};

// Rendu des KPI
function renderKPIs(s) {
  const kpis = [
    { label: 'Matchs', value: s.matches, sub: `${s.wins} V / ${s.losses} D`, accent: '' },
    { label: 'Taux de victoire', value: `${s.winRate.toFixed(1)}%`, sub: '', accent: 'accent-blue' },
    { label: 'Buts', value: s.goals, sub: `Précision ${s.shotAccuracy.toFixed(1)}%`, accent: 'accent-orange' },
    { label: 'Passes', value: s.assists, sub: '', accent: '' },
    { label: 'Arrêts', value: s.saves, sub: '', accent: 'accent-blue' },
    { label: 'Tirs', value: s.shots, sub: '', accent: '' },
    { label: 'Score total', value: s.score.toLocaleString('fr-FR'), sub: '', accent: 'accent-orange' },
    { label: 'Boost / match', value: s.avgBoost != null ? Math.round(s.avgBoost) : '—', sub: s.avgBoost != null ? 'unités' : 'non disponible', accent: '' },
    { label: 'Temps en l’air', value: s.avgAirTime != null ? `${s.avgAirTime.toFixed(1)}s` : '—', sub: 'par match', accent: '' },
  ];

  els.kpiGrid.innerHTML = kpis
    .map(
      (k) => `
    <div class="kpi-card">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value ${k.accent || ''}">${k.value}</div>
      ${k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ''}
    </div>`
    )
    .join('');
}

// Timeline chart (courbes)
function renderTimeline(s) {
  const ctx = $('#timeline-chart');
  if (!ctx) return;
  if (timelineChart) timelineChart.destroy();

  const labels = s.timeline.map((m) => fmtDate(m.date));
  const datasets = [
    { label: 'Buts', data: s.timeline.map((m) => m.goals), borderColor: '#00b4ff', backgroundColor: 'rgba(0,180,255,0.08)', tension: 0.35, fill: true, pointRadius: 2 },
    { label: 'Passes', data: s.timeline.map((m) => m.assists), borderColor: '#ff7a1a', backgroundColor: 'rgba(255,122,26,0.08)', tension: 0.35, fill: true, pointRadius: 2 },
    { label: 'Arrêts', data: s.timeline.map((m) => m.saves), borderColor: '#2ecc71', backgroundColor: 'rgba(46,204,113,0.06)', tension: 0.35, fill: true, pointRadius: 2 },
  ];

  timelineChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#7a8ba3', font: { family: 'Rajdhani', size: 12 }, usePointStyle: true, pointStyle: 'circle' } },
        tooltip: { backgroundColor: '#0d1420', borderColor: '#1c2a3f', borderWidth: 1, titleColor: '#e8edf5', bodyColor: '#7a8ba3' },
      },
      scales: {
        x: { ticks: { color: '#7a8ba3', font: { family: 'Rajdhani', size: 11 }, maxTicksLimit: 10 }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { beginAtZero: true, ticks: { color: '#7a8ba3', font: { family: 'Rajdhani', size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
      },
    },
  });
}

// Playlist chart (barres empilées V/D)
function renderPlaylist(s) {
  const ctx = $('#playlist-chart');
  if (!ctx) return;
  if (playlistChart) playlistChart.destroy();

  const playlists = Object.keys(s.playlists);
  const wins = playlists.map((p) => s.playlists[p].wins);
  const losses = playlists.map((p) => s.playlists[p].losses);

  playlistChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: playlists,
      datasets: [
        { label: 'Victoires', data: wins, backgroundColor: 'rgba(0,180,255,0.75)', borderRadius: 4 },
        { label: 'Défaites', data: losses, backgroundColor: 'rgba(255,122,26,0.65)', borderRadius: 4 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#7a8ba3', font: { family: 'Rajdhani', size: 12 }, usePointStyle: true, pointStyle: 'circle' } },
      },
      scales: {
        x: { stacked: true, ticks: { color: '#7a8ba3', font: { family: 'Rajdhani', size: 11 } }, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, ticks: { color: '#7a8ba3', font: { family: 'Rajdhani', size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
      },
    },
  });
}

// Gauge winrate (doughnut)
function renderGauge(s) {
  const ctx = $('#winrate-gauge');
  if (!ctx) return;
  if (gaugeChart) gaugeChart.destroy();

  const winRate = Math.min(100, Math.max(0, s.winRate));
  gaugeChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Victoires', 'Défaites'],
      datasets: [
        {
          data: [winRate, 100 - winRate],
          backgroundColor: ['#00b4ff', 'rgba(255,255,255,0.06)'],
          borderWidth: 0,
          cutout: '78%',
          borderRadius: 10,
        },
      ],
    },
    options: {
      responsive: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      animation: { animateRotate: true, duration: 900 },
    },
  });

  $('#winrate-value').textContent = `${s.winRate.toFixed(1)}%`;

  // Détails
  const details = [
    { label: 'Victoires', value: s.wins },
    { label: 'Défaites', value: s.losses },
    { label: 'Matchs joués', value: s.matches },
    { label: 'Précision de tir', value: `${s.shotAccuracy.toFixed(1)}%` },
  ];
  $('#gauge-details').innerHTML = details
    .map(
      (d) => `
    <div class="gauge-detail-row">
      <span class="gauge-detail-label">${d.label}</span>
      <span class="gauge-detail-value">${d.value}</span>
    </div>`
    )
    .join('');
}

// Derniers matchs
function renderRecent(s) {
  const list = $('#recent-list');
  const items = [...s.timeline].reverse().slice(0, 12);
  $('#recent-count').textContent = `${items.length} matchs`;

  list.innerHTML = items
    .map(
      (m) => `
    <div class="recent-item">
      <span class="recent-result ${m.won ? 'win' : 'loss'}">${m.won ? 'VICTOIRE' : 'DÉFAITE'}</span>
      <div class="recent-meta">
        <span class="recent-playlist">${m.playlist}</span>
        <span class="recent-date">${fmtDate(m.date)}</span>
      </div>
      <div class="recent-stats">
        <span><strong>${m.goals}</strong> buts</span>
        <span><strong>${m.assists}</strong> passes</span>
        <span><strong>${m.saves}</strong> arrêts</span>
      </div>
    </div>`
    )
    .join('');
}

// Rendu global
function renderDashboard(data) {
  hideError();
  els.skeleton.hidden = true;
  els.dashboard.hidden = false;
  els.demoBanner.hidden = !data.demo;

  const s = data.stats;
  renderKPIs(s);
  renderTimeline(s);
  renderPlaylist(s);
  renderGauge(s);
  renderRecent(s);
}

// Appel API principal
async function fetchStats(player, demo = false) {
  showLoading();
  try {
    const params = new URLSearchParams();
    if (player) params.set('player', player);
    if (demo) params.set('demo', '1');

    const res = await fetch(`/api/stats?${params.toString()}`);
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Erreur inconnue.');
      return;
    }
    renderDashboard(data);
  } catch (err) {
    showError('Impossible de joindre le serveur. Vérifie que le backend est lancé (npm start).');
  }
}

// Événements
els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const player = els.input.value.trim();
  if (!player) return;
  fetchStats(player, false);
});

els.demoBtn.addEventListener('click', () => {
  els.input.value = '';
  fetchStats(null, true);
});

// Vérifier si une clé est configurée (endpoint optionnel)
fetch('/api/health')
  .then((r) => r.json())
  .then((d) => {
    if (!d.hasKey) {
      els.apiHint.textContent = '⚠️ Aucune clé API configurée — utilise le mode démo.';
    }
  })
  .catch(() => {});