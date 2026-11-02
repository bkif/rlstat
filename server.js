require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.BALLCHASING_API_KEY;
const REPLAY_COUNT = Math.min(Number(process.env.REPLAY_COUNT) || 20, 50);

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Helper : appel Ballchasing avec la clé côté serveur (+ retry sur 429)
async function ballchasingFetch(endpoint, retries = 3) {
  if (!API_KEY) {
    throw Object.assign(new Error('Clé API absente'), { code: 'NO_KEY' });
  }
  const url = `https://ballchasing.com/api${endpoint}`;
  const res = await fetch(url, {
    headers: { Authorization: API_KEY },
  });

  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error('Clé API invalide ou expirée'), { code: 'INVALID_KEY' });
  }
  if (res.status === 429) {
    if (retries > 0) {
      // Le compte gratuit est limité à ~2 requêtes/seconde : on attend et on réessaie
      await sleep(1200 * (4 - retries));
      return ballchasingFetch(endpoint, retries - 1);
    }
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
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        if (err.code === 'INVALID_KEY' || err.code === 'NO_KEY') throw err;
        console.warn(`Replay ignoré (${items[i]}) : ${err.message}`);
        results[i] = null;
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results.filter(Boolean);
}

// "steam:7656..." / "epic:abc" / "psynet:..." → recherche par ID de plateforme
const PLATFORM_RE = /^(steam|epic|ps4|xbox|switch|psynet):(.+)$/i;
function parsePlayerQuery(input) {
  const m = input.match(PLATFORM_RE);
  if (m) return { type: 'id', platform: m[1].toLowerCase(), id: m[2] };
  return { type: 'name', name: input };
}

// Buts d'une équipe : Ballchasing les place dans team.stats.core.goals
function teamGoals(team) {
  if (!team) return 0;
  if (typeof team.stats?.core?.goals === 'number') return team.stats.core.goals;
  if (typeof team.goals === 'number') return team.goals;
  return (team.players || []).reduce((sum, p) => sum + (p.stats?.core?.goals || 0), 0);
}

// Agrégation des stats à partir des détails de replays
function aggregateStats(replayDetails, query) {
  const stats = {
    matches: 0,
    wins: 0,
    losses: 0,
    goals: 0,
    assists: 0,
    saves: 0,
    shots: 0,
    score: 0,
    mvps: 0,
    boostUsed: 0,
    boostSamples: 0,
    timeAirborne: 0,
    airSamples: 0,
    playlists: {},
    timeline: [],
    displayName: null,
    platform: null,
  };

  for (const detail of replayDetails) {
    const allPlayers = [
      ...(detail.blue?.players || []).map((p) => ({ ...p, team: 'blue' })),
      ...(detail.orange?.players || []).map((p) => ({ ...p, team: 'orange' })),
    ];

    const player = allPlayers.find((p) =>
      query.type === 'id'
        ? String(p.id?.id).toLowerCase() === query.id.toLowerCase()
        : p.name?.toLowerCase() === query.name.toLowerCase()
    );

    if (!player) continue;

    const blueGoals = teamGoals(detail.blue);
    const orangeGoals = teamGoals(detail.orange);
    const myGoals = player.team === 'blue' ? blueGoals : orangeGoals;
    const oppGoals = player.team === 'blue' ? orangeGoals : blueGoals;
    const won = myGoals > oppGoals;

    stats.displayName = stats.displayName || player.name;
    stats.platform = stats.platform || player.id?.platform || null;

    stats.matches++;
    if (won) stats.wins++; else stats.losses++;

    const core = player.stats?.core || {};
    stats.goals   += core.goals || 0;
    stats.assists += core.assists || 0;
    stats.saves   += core.saves || 0;
    stats.shots   += core.shots || 0;
    stats.score   += core.score || 0;
    if (core.mvp) stats.mvps++;

    const boost = player.stats?.boost;
    if (boost && typeof boost.amount_collected === 'number') {
      stats.boostUsed += boost.amount_collected;
      stats.boostSamples++;
    }
    const movement = player.stats?.movement;
    if (movement && typeof movement.time_high_air === 'number') {
      stats.timeAirborne += (movement.time_high_air || 0) + (movement.time_low_air || 0);
      stats.airSamples++;
    }

    const playlistName = detail.playlist_name || detail.playlist_id || 'Inconnu';
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
      map: detail.map_name || detail.map_code || '',
      goals: core.goals || 0,
      assists: core.assists || 0,
      saves: core.saves || 0,
      shots: core.shots || 0,
      score: core.score || 0,
      mvp: !!core.mvp,
      myGoals,
      oppGoals,
      won,
    });
  }

  // Ordre chronologique (plus ancien → plus récent)
  stats.timeline.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Calculs dérivés
  stats.winRate = stats.matches ? (stats.wins / stats.matches) * 100 : 0;
  stats.shotAccuracy = stats.shots ? (stats.goals / stats.shots) * 100 : 0;
  stats.avgScore = stats.matches ? stats.score / stats.matches : 0;
  stats.avgBoost = stats.boostSamples ? stats.boostUsed / stats.boostSamples : null;
  stats.avgAirTime = stats.airSamples ? stats.timeAirborne / stats.airSamples : null;

  return stats;
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, hasKey: !!API_KEY });
});

// Endpoint principal
app.get('/api/stats', async (req, res) => {
  const player = req.query.player?.trim();
  const demo = req.query.demo === '1';

  if (demo) {
    const { getDemoData } = require('./demo-data');
    return res.json({ demo: true, player: 'Demo Player', stats: getDemoData() });
  }

  if (!player) {
    return res.status(400).json({ error: 'Le paramètre "player" est requis.' });
  }

  const cacheKey = `stats:${player.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json({ demo: false, player: cached.displayName || player, stats: cached, cached: true });

  try {
    const query = parsePlayerQuery(player);
    const filter = query.type === 'id'
      ? `player-id=${encodeURIComponent(`${query.platform}:${query.id}`)}`
      : `player-name=${encodeURIComponent(query.name)}`;

    // 1) Lister les replays du joueur
    const listRes = await ballchasingFetch(`/replays?${filter}&count=${REPLAY_COUNT}&sort-by=replay-date&sort-dir=desc`);
    const replayList = listRes.list || [];

    if (!replayList.length) {
      return res.status(404).json({ error: `Aucun replay trouvé pour "${player}". Vérifie le pseudo (exact) ou utilise steam:ID / epic:ID.` });
    }

    // 2) Récupérer les détails de chaque replay (2 en parallèle → respecte la limite gratuite)
    const replayIds = replayList.map((r) => r.id);
    const details = await pMapLimit(replayIds, 2, (id) => ballchasingFetch(`/replays/${id}`));

    // 3) Agréger
    const stats = aggregateStats(details, query);

    if (stats.matches === 0) {
      return res.status(404).json({ error: `Le joueur "${player}" n’apparaît dans aucun des replays récupérés.` });
    }

    setCache(cacheKey, stats);
    res.json({ demo: false, player: stats.displayName || player, stats });
  } catch (err) {
    console.error('Erreur /api/stats:', err.message);
    if (err.code === 'INVALID_KEY') return res.status(401).json({ error: 'Clé API Ballchasing invalide ou expirée.' });
    if (err.code === 'RATE_LIMIT') return res.status(429).json({ error: 'Quota Ballchasing dépassé. Réessaie dans quelques minutes.' });
    if (err.code === 'NO_KEY') return res.status(500).json({ error: 'Clé API non configurée sur le serveur (fichier .env). Utilise le mode démo en attendant.' });
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
