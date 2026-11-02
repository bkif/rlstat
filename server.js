require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.BALLCHASING_API_KEY;

if (!API_KEY) {
  console.warn('⚠️  BALLCHASING_API_KEY manquante dans .env — le mode réel ne fonctionnera pas. Le mode démo reste disponible.');
}

// Cache simple en mémoire (TTL 5 minutes)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL });
}

// Helper : appel Ballchasing avec la clé côté serveur
async function ballchasingFetch(endpoint) {
  if (!API_KEY) {
    throw Object.assign(new Error('Clé API absente'), { code: 'NO_KEY' });
  }
  const url = `https://ballchasing.com/api${endpoint}`;
  const res = await fetch(url, {
    headers: { Authorization: API_KEY },
  });

  if (res.status === 401) {
    throw Object.assign(new Error('Clé API invalide ou expirée'), { code: 'INVALID_KEY' });
  }
  if (res.status === 429) {
    throw Object.assign(new Error('Quota Ballchasing dépassé. Réessaie dans quelques minutes.'), { code: 'RATE_LIMIT' });
  }
  if (!res.ok) {
    throw Object.assign(new Error(`Erreur Ballchasing (${res.status})`), { code: 'API_ERROR' });
  }
  return res.json();
}

// Limite de concurrence pour ne pas saturer l'API
async function pMapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// Agrégation des stats à partir des détails de replays
function aggregateStats(replayDetails, playerName) {
  const stats = {
    matches: 0,
    wins: 0,
    losses: 0,
    goals: 0,
    assists: 0,
    saves: 0,
    shots: 0,
    score: 0,
    boostUsed: 0,          // pas toujours disponible
    timeAirborne: 0,        // pas toujours disponible
    playlists: {},          // { "2v2": { wins, losses, goals... } }
    timeline: [],           // évolution match par match
  };

  for (const detail of replayDetails) {
    // Trouver le joueur dans le replay (blue ou orange)
    const allPlayers = [
      ...(detail.blue?.players || []).map(p => ({ ...p, team: 'blue', teamGoals: detail.blue.goals })),
      ...(detail.orange?.players || []).map(p => ({ ...p, team: 'orange', teamGoals: detail.orange.goals })),
    ];

    const player = allPlayers.find(
      p => p.name?.toLowerCase() === playerName.toLowerCase() ||
           p.id?.id === playerName
    );

    if (!player) continue;

    const opponentGoals = player.team === 'blue' ? detail.orange?.goals : detail.blue?.goals;
    const won = (player.teamGoals ?? 0) > (opponentGoals ?? 0);

    stats.matches++;
    if (won) stats.wins++; else stats.losses++;

    const core = player.stats?.core || {};
    stats.goals   += core.goals || 0;
    stats.assists += core.assists || 0;
    stats.saves   += core.saves || 0;
    stats.shots   += core.shots || 0;
    stats.score   += core.score || 0;

    // Champs potentiellement absents
    const boost = player.stats?.boost;
    if (boost && typeof boost.amount_used === 'number') stats.boostUsed += boost.amount_used;
    const movement = player.stats?.movement;
    if (movement && typeof movement.time_airborne === 'number') stats.timeAirborne += movement.time_airborne;

    const playlistName = detail.playlist_name || 'Inconnu';
    if (!stats.playlists[playlistName]) {
      stats.playlists[playlistName] = { wins: 0, losses: 0, goals: 0, assists: 0, saves: 0, shots: 0, matches: 0 };
    }
    const pl = stats.playlists[playlistName];
    pl.matches++;
    if (won) pl.wins++; else pl.losses++;
    pl.goals   += core.goals || 0;
    pl.assists += core.assists || 0;
    pl.saves   += core.saves || 0;
    pl.shots   += core.shots || 0;

    stats.timeline.push({
      date: detail.date,
      playlist: playlistName,
      goals: core.goals || 0,
      assists: core.assists || 0,
      saves: core.saves || 0,
      shots: core.shots || 0,
      won,
    });
  }

  // Calculs dérivés
  stats.winRate = stats.matches ? (stats.wins / stats.matches) * 100 : 0;
  stats.shotAccuracy = stats.shots ? (stats.goals / stats.shots) * 100 : 0;
  stats.avgBoost = stats.matches ? stats.boostUsed / stats.matches : null;
  stats.avgAirTime = stats.matches ? stats.timeAirborne / stats.matches : null;

  return stats;
}

// Endpoint principal
app.get('/api/stats', async (req, res) => {
  const player = req.query.player?.trim();
  const demo = req.query.demo === '1';

  if (demo) {
    const { getDemoData } = require('./demo-data');
    return res.json({ demo: true, player: player || 'Demo Player', stats: getDemoData() });
  }

  if (!player) {
    return res.status(400).json({ error: 'Le paramètre "player" est requis.' });
  }

  const cacheKey = `stats:${player.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json({ demo: false, player, stats: cached, cached: true });

  try {
    // 1) Lister les replays du joueur (30 max pour rester raisonnable)
    const listRes = await ballchasingFetch(`/replays?player-name=${encodeURIComponent(player)}&count=30&sort-by=replay-date&sort-dir=desc`);
    const replayList = listRes.list || [];

    if (!replayList.length) {
      return res.status(404).json({ error: `Aucun replay trouvé pour "${player}". Vérifie le pseudo ou l’ID de plateforme.` });
    }

    // 2) Récupérer les détails de chaque replay (concurrence limitée à 4)
    const replayIds = replayList.map(r => r.id);
    const details = await pMapLimit(replayIds, 4, (id) => ballchasingFetch(`/replays/${id}`));

    // 3) Agréger
    const stats = aggregateStats(details, player);

    if (stats.matches === 0) {
      return res.status(404).json({ error: `Le joueur "${player}" n’apparaît dans aucun des replays récupérés.` });
    }

    setCache(cacheKey, stats);
    res.json({ demo: false, player, stats });
  } catch (err) {
    console.error('Erreur /api/stats:', err.message);
    if (err.code === 'INVALID_KEY') return res.status(401).json({ error: 'Clé API Ballchasing invalide ou expirée.' });
    if (err.code === 'RATE_LIMIT') return res.status(429).json({ error: 'Quota Ballchasing dépassé. Réessaie dans quelques minutes.' });
    if (err.code === 'NO_KEY') return res.status(500).json({ error: 'Clé API non configurée sur le serveur. Utilise le mode démo.' });
    res.status(500).json({ error: 'Erreur interne lors de la récupération des statistiques.' });
  }
});

// Servir le front
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`🚀 Rocket Stats sur http://localhost:${PORT}`);
  console.log(API_KEY ? '✅ Clé API chargée.' : '⚠️  Mode démo uniquement (pas de clé API).');
});