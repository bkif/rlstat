// Données de démo cohérentes : les totaux sont calculés à partir de la timeline
const MAPS = ['DFH Stadium', 'Mannfield', 'Champions Field', 'Urban Central', 'Beckwith Park', 'Utopia Coliseum', 'Neo Tokyo'];
const PLAYLISTS = ['Ranked Doubles 2v2', 'Ranked Standard 3v3', 'Ranked Duel 1v1'];

// Générateur pseudo-aléatoire déterministe (mêmes données à chaque chargement)
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function getDemoData() {
  const rand = rng(42);
  const n = 20;

  const timeline = Array.from({ length: n }, (_, i) => {
    const r = rand();
    const playlist = r < 0.55 ? PLAYLISTS[0] : r < 0.85 ? PLAYLISTS[1] : PLAYLISTS[2];
    const goals = Math.floor(rand() * 4);
    const assists = Math.floor(rand() * 3);
    const saves = Math.floor(rand() * 4);
    const shots = goals + Math.floor(rand() * 4);
    const won = rand() > 0.38;
    const myGoals = Math.max(goals + assists, won ? 2 + Math.floor(rand() * 3) : Math.floor(rand() * 3));
    const oppGoals = won ? Math.floor(rand() * myGoals) : myGoals + 1 + Math.floor(rand() * 2);
    const score = goals * 100 + assists * 50 + saves * 50 + shots * 20 + Math.floor(rand() * 120);
    return {
      date: new Date(Date.now() - (n - 1 - i) * 7 * 3600000).toISOString(),
      playlist,
      map: MAPS[Math.floor(rand() * MAPS.length)],
      goals, assists, saves, shots, score,
      mvp: won && rand() > 0.5,
      myGoals, oppGoals, won,
    };
  });

  const sum = (k) => timeline.reduce((a, m) => a + m[k], 0);
  const wins = timeline.filter((m) => m.won).length;
  const goals = sum('goals');
  const shots = sum('shots');

  const playlists = {};
  for (const m of timeline) {
    const p = (playlists[m.playlist] ||= { matches: 0, wins: 0, losses: 0, goals: 0, assists: 0, saves: 0, shots: 0 });
    p.matches++;
    m.won ? p.wins++ : p.losses++;
    p.goals += m.goals; p.assists += m.assists; p.saves += m.saves; p.shots += m.shots;
  }

  return {
    displayName: 'Demo Player',
    platform: 'steam',
    matches: n,
    wins,
    losses: n - wins,
    winRate: (wins / n) * 100,
    goals,
    assists: sum('assists'),
    saves: sum('saves'),
    shots,
    shotAccuracy: shots ? (goals / shots) * 100 : 0,
    score: sum('score'),
    avgScore: sum('score') / n,
    mvps: timeline.filter((m) => m.mvp).length,
    avgBoost: 1840.6,
    avgAirTime: 38.4,
    playlists,
    timeline,
  };
}

module.exports = { getDemoData };
