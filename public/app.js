// RLStat Front Application
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  form: $('#search-form'),
  input: $('#player-input'),
  searchBtn: $('#search-btn'),
  demoBtn: $('#demo-btn'),
  loader: $('#loader'),
  errorCard: $('#error-card'),
  errorMsg: $('#error-message'),
  dashboard: $('#dashboard'),
  apiAlert: $('#api-alert'),
  apiAlertText: $('#api-alert-text'),
  apiStatus: $('#api-status'),

  // Player info
  avatarInitial: $('#avatar-initial'),
  playerName: $('#player-display-name'),
  badgeDemo: $('#badge-demo'),
  playerSubtitle: $('#player-subtitle'),
  wlRatio: $('#wl-ratio'),
  avgScore: $('#avg-score'),

  // KPIs
  winrate: $('#kpi-winrate'),
  winratePill: $('#kpi-winrate-pill'),
  winrateBar: $('#winrate-bar'),
  accuracy: $('#kpi-accuracy'),
  accuracyBar: $('#accuracy-bar'),
  shotsSummary: $('#kpi-shots-summary'),
  goals: $('#kpi-goals'),
  goalsRatio: $('#kpi-goals-ratio'),
  assists: $('#kpi-assists'),
  assistsRatio: $('#kpi-assists-ratio'),
  saves: $('#kpi-saves'),
  savesRatio: $('#kpi-saves-ratio'),
  boost: $('#kpi-boost'),

  // Matches
  matchesTbody: $('#matches-tbody'),
  matchCountTag: $('#match-count-tag'),
};

let timelineChartInstance = null;
let playlistChartInstance = null;

// Vérification de l'état du serveur & de la clé API
async function checkApiHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.hasKey) {
      els.apiStatus.textContent = 'API Ballchasing Connectée';
      els.apiAlert.hidden = true;
    } else {
      els.apiStatus.textContent = 'Mode Démo (Pas de clé API)';
      els.apiAlert.hidden = false;
    }
  } catch (e) {
    els.apiStatus.textContent = 'Serveur Hors-Ligne';
  }
}

function showLoading() {
  els.loader.hidden = false;
  els.dashboard.hidden = true;
  els.errorCard.hidden = true;
  els.searchBtn.disabled = true;
}

function hideLoading() {
  els.loader.hidden = true;
  els.searchBtn.disabled = false;
}

function showError(message) {
  hideLoading();
  els.dashboard.hidden = true;
  els.errorCard.hidden = false;
  els.errorMsg.textContent = message;
  els.errorCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function formatDate(isoStr) {
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  } catch {
    return '—';
  }
}

// Rendu des graphiques Chart.js
function renderTimelineChart(timeline) {
  const ctx = document.getElementById('timeline-chart');
  if (!ctx) return;

  if (timelineChartInstance) {
    timelineChartInstance.destroy();
  }

  const labels = timeline.map((m, i) => `#${i + 1} (${formatDate(m.date)})`);
  const goalsData = timeline.map(m => m.goals);
  const assistsData = timeline.map(m => m.assists);
  const savesData = timeline.map(m => m.saves);

  timelineChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Buts',
          data: goalsData,
          borderColor: '#00b4ff',
          backgroundColor: 'rgba(0, 180, 255, 0.1)',
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointBackgroundColor: '#00b4ff',
          pointRadius: 3,
        },
        {
          label: 'Passes',
          data: assistsData,
          borderColor: '#ff6b00',
          backgroundColor: 'transparent',
          tension: 0.35,
          borderWidth: 2,
          pointBackgroundColor: '#ff6b00',
          pointRadius: 3,
        },
        {
          label: 'Arrêts',
          data: savesData,
          borderColor: '#00e676',
          backgroundColor: 'transparent',
          tension: 0.35,
          borderWidth: 2,
          pointBackgroundColor: '#00e676',
          pointRadius: 3,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#101521',
          titleColor: '#f1f5f9',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 10,
          boxPadding: 4,
          usePointStyle: true,
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#64748b', font: { family: 'Rajdhani', size: 11 } }
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0, color: '#64748b', font: { family: 'Rajdhani', size: 11 } },
          grid: { color: 'rgba(255, 255, 255, 0.04)' }
        }
      }
    }
  });
}

function renderPlaylistChart(playlists) {
  const ctx = document.getElementById('playlist-chart');
  if (!ctx) return;

  if (playlistChartInstance) {
    playlistChartInstance.destroy();
  }

  const keys = Object.keys(playlists || {});
  const wins = keys.map(k => playlists[k].wins);
  const losses = keys.map(k => playlists[k].losses);

  playlistChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: keys,
      datasets: [
        {
          label: 'Victoires',
          data: wins,
          backgroundColor: '#00b4ff',
          borderRadius: 6,
        },
        {
          label: 'Défaites',
          data: losses,
          backgroundColor: '#ff6b00',
          borderRadius: 6,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#94a3b8',
            font: { family: 'Rajdhani', size: 12 },
            usePointStyle: true,
            boxWidth: 8
          }
        },
        tooltip: {
          backgroundColor: '#101521',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#64748b', font: { family: 'Rajdhani', size: 11 } }
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0, color: '#64748b', font: { family: 'Rajdhani', size: 11 } },
          grid: { color: 'rgba(255, 255, 255, 0.04)' }
        }
      }
    }
  });
}

// Mise à jour de l'affichage avec les données
function displayDashboard(payload) {
  hideLoading();
  els.errorCard.hidden = true;
  els.dashboard.hidden = false;

  const { demo, player, stats } = payload;
  const count = stats.matches || 1;

  // Header info
  const name = stats.displayName || player || 'Joueur Inconnu';
  els.playerName.textContent = name;
  els.avatarInitial.textContent = name.substring(0, 2).toUpperCase();
  els.badgeDemo.hidden = !demo;
  els.playerSubtitle.textContent = `${stats.matches} derniers matchs analysés ${stats.platform ? `• Plateforme: ${stats.platform}` : ''}`;

  els.wlRatio.textContent = `${stats.wins}V - ${stats.losses}D`;
  els.avgScore.textContent = `${Math.round(stats.avgScore || (stats.score / count))} pts`;

  // KPIs
  const winrateVal = Math.round(stats.winRate || 0);
  els.winrate.textContent = `${winrateVal}%`;
  els.winratePill.textContent = `${stats.wins}V / ${stats.losses}D`;
  els.winrateBar.style.width = `${winrateVal}%`;

  const accVal = Math.round(stats.shotAccuracy || 0);
  els.accuracy.textContent = `${accVal}%`;
  els.accuracyBar.style.width = `${Math.min(accVal, 100)}%`;
  els.shotsSummary.textContent = `${stats.shots || 0} tirs`;

  els.goals.textContent = stats.goals || 0;
  els.goalsRatio.textContent = `${((stats.goals || 0) / count).toFixed(1)} / match`;

  els.assists.textContent = stats.assists || 0;
  els.assistsRatio.textContent = `${((stats.assists || 0) / count).toFixed(1)} / match`;

  els.saves.textContent = stats.saves || 0;
  els.savesRatio.textContent = `${((stats.saves || 0) / count).toFixed(1)} / match`;

  els.boost.textContent = stats.avgBoost ? Math.round(stats.avgBoost).toLocaleString() : 'N/D';

  // Graphiques
  renderTimelineChart(stats.timeline || []);
  renderPlaylistChart(stats.playlists || {});

  // Tableau des matchs
  const matches = [...(stats.timeline || [])].reverse();
  els.matchCountTag.textContent = `${matches.length} matchs récents`;

  els.matchesTbody.innerHTML = matches.map((m) => {
    const isWin = m.won;
    const badgeClass = isWin ? 'badge-win' : 'badge-loss';
    const badgeText = isWin ? 'VICTOIRE' : 'DÉFAITE';
    const scoreText = (m.myGoals !== undefined && m.oppGoals !== undefined) 
      ? `${m.myGoals} - ${m.oppGoals}` 
      : '—';

    return `
      <tr>
        <td><span class="match-badge ${badgeClass}">${badgeText}</span></td>
        <td><strong>${m.playlist || 'Match'}</strong></td>
        <td><span class="score-display">${scoreText}</span></td>
        <td><strong class="text-blue">${m.goals}</strong></td>
        <td><strong class="text-orange">${m.assists}</strong></td>
        <td>${m.saves}</td>
        <td>${m.shots}</td>
        <td><strong>${m.score}</strong></td>
        <td>${m.mvp ? '<span class="mvp-star" title="MVP">★ MVP</span>' : '—'}</td>
      </tr>
    `;
  }).join('');

  // Scroll doux vers le dashboard
  els.dashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Appel Backend
async function fetchStats({ player, demo = false }) {
  showLoading();
  try {
    const query = new URLSearchParams();
    if (demo) query.set('demo', '1');
    if (player) query.set('player', player);

    const res = await fetch(`/api/stats?${query.toString()}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Erreur lors de la récupération des données.');
    }

    displayDashboard(data);
  } catch (err) {
    showError(err.message);
  }
}

// Gestionnaires d'événements
els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const player = els.input.value.trim();
  if (!player) {
    showError('Merci de saisir un pseudo ou un ID de joueur Rocket League.');
    return;
  }
  fetchStats({ player, demo: false });
});

els.demoBtn.addEventListener('click', () => {
  els.input.value = '';
  fetchStats({ demo: true });
});

$$('.tag-player').forEach((btn) => {
  btn.addEventListener('click', () => {
    const p = btn.dataset.player;
    els.input.value = p;
    fetchStats({ player: p, demo: false });
  });
});

// Initialisation au chargement
checkApiHealth();

// Déclencher automatiquement la démo au premier affichage pour que le site ne soit jamais vide
fetchStats({ demo: true });
