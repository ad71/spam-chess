export type Team = "w" | "b";
export type GameStatus = "waiting" | "playing" | "finished";

export interface Player {
  username: string;
  team: Team;
  joinedAt: number;
}

export interface MoveLog {
  id: string;
  move: string;
  username: string;
  team: Team;
  timestamp: number;
  captured?: string;
}

export interface GameInfo {
  gameId: string;
  fen: string;
  status: GameStatus;
  winner?: Team | null;
  players: Player[];
  lastMove?: string;
  lastMover?: string;
}

export interface MoveRequest {
  gameId: string;
  move: string;
  team: Team;
  username: string;
}

export interface JoinRequest {
  gameId: string;
  username: string;
  team: Team;
}

export interface MoveResponse {
  success: boolean;
  fen?: string;
  message?: string;
  isGameOver?: boolean;
  winner?: Team;
  captured?: string;
}

export interface PlayerStat {
  username: string;
  team: Team;
  rank: number;
  moves: number; // Total moves made
  score: number; // Material value captured
  kills: string[]; // List of captured pieces (e.g. ['p', 'n', 'q'])
  badges: Badge[]; // Awards
}

export type Badge = "KINGSLAYER" | "MVP" | "SPRINTER" | "PACIFIST";

export interface GameStats {
  winner: Team;
  whiteStats: PlayerStat[];
  blackStats: PlayerStat[];
  totalWhiteScore: number;
  totalBlackScore: number;
}
