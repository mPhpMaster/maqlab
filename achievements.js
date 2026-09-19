// Achievements are evaluated server-side against lifetime profile totals, so
// they can't be forged from the browser the way the old localStorage ones could.
// `p` is the profile row after this game was recorded; `g` is this game.
const LIST = [
  { id: 'first_game', e: '🎮', test: p => p.games >= 1 },
  { id: 'first_win', e: '🏆', test: p => p.wins >= 1 },
  { id: 'games10', e: '🏅', test: p => p.games >= 10 },
  { id: 'games50', e: '🎖️', test: p => p.games >= 50 },
  { id: 'wins5', e: '👑', test: p => p.wins >= 5 },
  { id: 'wins25', e: '💠', test: p => p.wins >= 25 },
  { id: 'liar5', e: '🤥', test: p => p.fooled >= 5 },
  { id: 'liar50', e: '🎭', test: p => p.fooled >= 50 },
  { id: 'bull', e: '🎯', test: p => p.bullseyes >= 1 },
  { id: 'bull10', e: '🏹', test: p => p.bullseyes >= 10 },
  { id: 'streak4', e: '🔥', test: p => p.best_streak >= 4 },
  { id: 'streak8', e: '☄️', test: p => p.best_streak >= 8 },
  { id: 'speedy', e: '⚡', test: p => p.fastest >= 3 },
  { id: 'speedy25', e: '🌩️', test: p => p.fastest >= 25 },
  { id: 'famous', e: '🌟', test: p => p.famous >= 1 },
  { id: 'allin', e: '🎲', test: p => p.high_bets >= 5 },
  { id: 'spy_hunter', e: '🔎', test: p => p.spy_caught >= 5 },
  { id: 'spy_ghost', e: '🕵️', test: p => p.spy_evaded >= 5 },
  { id: 'winstreak3', e: '📈', test: p => p.best_win_streak >= 3 },
  { id: 'winstreak10', e: '🚀', test: p => p.best_win_streak >= 10 },
  { id: 'score10k', e: '💰', test: p => Number(p.total_score) >= 10000 },
  { id: 'score100k', e: '💎', test: p => Number(p.total_score) >= 100000 },
  { id: 'crowded', e: '🎪', test: (p, g) => g.won && g.players >= 6 },
  { id: 'sniper', e: '🎳', test: p => p.snipes >= 20 },
];

const IDS = LIST.map(a => a.id);

// Returns only the ids earned now that weren't held before.
function earned(profile, game) {
  const had = new Set(profile.achievements || []);
  return LIST.filter(a => !had.has(a.id) && a.test(profile, game)).map(a => a.id);
}

module.exports = { LIST, IDS, earned };
