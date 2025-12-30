import {
  MoveLog,
  Player,
  PlayerStat,
  Team,
  GameStats,
  Badge,
} from "@/app/types";

// Point values for captures
const POINTS: Record<string, number> = {
  p: 1, // Pawn
  n: 3, // Knight
  b: 3, // Bishop
  r: 5, // Rook
  q: 9, // Queen
  k: 100, // The King (Huge bonus for the kill)
};

export function calculateGameStats(
  history: MoveLog[],
  players: Player[],
  winner: Team
): GameStats {
  // 1. Initialize Stats Map for all players (even those who did nothing)
  const statsMap = new Map<string, PlayerStat>();

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
  let maxScore = -1;
  let maxMoves = -1;
  let kingslayerName: string | null = null;

  history.forEach((log) => {
    // If this log entry denotes the King capture, mark the Kingslayer
    if (log.captured === "k") {
      kingslayerName = log.username;
    }

    const stat = statsMap.get(log.username);
    if (!stat) return; // Should not happen unless player left

    stat.moves += 1;

    if (log.captured && POINTS[log.captured]) {
      stat.kills.push(log.captured);
      stat.score += POINTS[log.captured];
    }
  });

  // 3. Assign Badges & Calculate Maxima
  // We do a first pass to find max values
  statsMap.forEach((stat) => {
    if (stat.score > maxScore) maxScore = stat.score;
    if (stat.moves > maxMoves) maxMoves = stat.moves;
  });

  // 4. Finalize Badges
  statsMap.forEach((stat) => {
    // KINGSLAYER
    if (stat.username === kingslayerName) {
      stat.badges.push("KINGSLAYER");
    }

    // MVP (Highest Score - must have > 0)
    if (stat.score === maxScore && stat.score > 0) {
      stat.badges.push("MVP");
    }

    // SPRINTER (Most Moves - must have > 0)
    if (stat.moves === maxMoves && stat.moves > 5) {
      stat.badges.push("SPRINTER");
    }

    // PACIFIST (Many moves, no kills)
    if (stat.moves > 10 && stat.score === 0) {
      stat.badges.push("PACIFIST");
    }
  });

  // 5. Sort and Split by Team
  const allStats = Array.from(statsMap.values());

  // Helper to sort: Score DESC, then Moves DESC
  const sortFn = (a: PlayerStat, b: PlayerStat) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.moves - a.moves;
  };

  const whiteStats = allStats.filter((s) => s.team === "w").sort(sortFn);
  const blackStats = allStats.filter((s) => s.team === "b").sort(sortFn);

  // Assign Ranks
  whiteStats.forEach((s, i) => (s.rank = i + 1));
  blackStats.forEach((s, i) => (s.rank = i + 1));

  // Totals
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
