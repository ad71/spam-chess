import {
  MoveLog,
  Player,
  PlayerStat,
  Team,
  GameStats,
  Badge,
} from "@/app/types";

const POINTS: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 25, // king = massive value
};

export function calculateGameStats(
  history: MoveLog[],
  players: Player[],
  winner: Team
): GameStats {
  const statsMap = new Map<string, PlayerStat>();

  // 1. Initialize
  players.forEach((p) => {
    statsMap.set(p.username, {
      username: p.username,
      team: p.team,
      rank: 0,
      moves: 0,
      score: 0,
      kills: [],
      badges: [],
    });
  });

  // 2. Process History
  let kingslayerName: string | null = null;

  history.forEach((log) => {
    if (log.captured === "k") {
      kingslayerName = log.username;
    }

    const stat = statsMap.get(log.username);
    if (!stat) return;

    stat.moves += 1;

    if (log.captured && POINTS[log.captured]) {
      stat.kills.push(log.captured);
      stat.score += POINTS[log.captured];
    }
  });

  // 3. Separate Teams & Sort (Initial sort for ranking)
  // Sort by Score DESC, then Moves ASC (Efficiency)
  const allStats = Array.from(statsMap.values());

  const sortFn = (a: PlayerStat, b: PlayerStat) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.moves - b.moves; // Fewer moves = better if scores tied
  };

  const whiteStats = allStats.filter((s) => s.team === "w").sort(sortFn);
  const blackStats = allStats.filter((s) => s.team === "b").sort(sortFn);

  // 4. Assign Badges
  // We process per-team logic
  [whiteStats, blackStats].forEach((teamStats) => {
    const isWinnerTeam = teamStats.length > 0 && teamStats[0].team === winner;

    // Calculate Team Maxes
    let maxMoves = -1;
    teamStats.forEach((s) => {
      if (s.moves > maxMoves) maxMoves = s.moves;
    });

    teamStats.forEach((stat, index) => {
      // KINGSLAYER
      if (stat.username === kingslayerName) {
        stat.badges.push("KINGSLAYER");
      }

      // MVP (Winner Only, Top Rank)
      if (isWinnerTeam && index === 0 && stat.score > 0) {
        stat.badges.push("MVP");
      }

      // WARLORD (Loser Only, Top Rank, High Score)
      if (!isWinnerTeam && index === 0 && stat.score > 10) {
        stat.badges.push("WARLORD"); // Changed from MVP for loser
      }

      // SPRINTER (Most moves on team, must be active)
      if (stat.moves === maxMoves && stat.moves > 5) {
        // Avoid duplicate if they already have MVP/Warlord to keep it clean?
        // Nah, multiple badges are fun.
        stat.badges.push("SPRINTER");
      }

      // SNIPER (High efficiency: High score, low moves)
      if (stat.score >= 9 && stat.moves < 10) {
        stat.badges.push("SNIPER");
      }

      // PACIFIST (Many moves, 0 score)
      if (stat.moves > 8 && stat.score === 0) {
        stat.badges.push("PACIFIST");
      }

      // BRICK (The "Useless" Roast - Moderate moves, 0 score)
      // Rare: 10% chance to trigger if criteria met to keep it funny/rare
      if (
        stat.moves > 5 &&
        stat.score === 0 &&
        !stat.badges.includes("PACIFIST")
      ) {
        if (Math.random() > 0.8) stat.badges.push("BRICK");
      }

      // GHOST (Joined but did almost nothing)
      if (stat.moves < 2) {
        stat.badges.push("GHOST");
      }
    });
  });

  // Assign Ranks
  whiteStats.forEach((s, i) => (s.rank = i + 1));
  blackStats.forEach((s, i) => (s.rank = i + 1));

  const totalWhiteScore = whiteStats.reduce((sum, s) => sum + s.score, 0);
  const totalBlackScore = blackStats.reduce((sum, s) => sum + s.score, 0);

  return {
    winner,
    whiteStats,
    blackStats,
    totalWhiteScore,
    totalBlackScore,
  };
}
