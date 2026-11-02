function getDemoData() {
  return {
    matches: 24,
    wins: 15,
    losses: 9,
    winRate: 62.5,
    goals: 58,
    assists: 34,
    saves: 71,
    shots: 142,
    shotAccuracy: 40.8,
    score: 12450,
    avgBoost: 312.4,
    avgAirTime: 4.2,
    playlists: {
      '2v2': { matches: 14, wins: 9, losses: 5, goals: 36, assists: 22, saves: 41, shots: 88 },
      '3v3': { matches: 7, wins: 4, losses: 3, goals: 16, assists: 9, saves: 20, shots: 38 },
      '1v1': { matches: 3, wins: 2, losses: 1, goals: 6, assists: 3, saves: 10, shots: 16 },
    },
    timeline: Array.from({ length: 20 }, (_, i) => ({
      date: new Date(Date.now() - (19 - i) * 86400000).toISOString(),
      playlist: i % 3 === 0 ? '3v3' : '2v2',
      goals: Math.floor(Math.random() * 4),
      assists: Math.floor(Math.random() * 3),
      saves: Math.floor(Math.random() * 4),
      shots: Math.floor(Math.random() * 6),
      won: Math.random() > 0.4,
    })),
  };
}

module.exports = { getDemoData };