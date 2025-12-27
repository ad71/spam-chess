export type Team = "w" | "b";
export type GameStatus = "waiting" | "playing" | "finished";

export interface Player {
  username: string;
  team: Team;
  joinedAt: number;
}

export interface GameInfo {
  gameId: string;
  fen: string;
  status: GameStatus;
  winner?: Team | null; // New field
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
}

export interface MoveLog {
  id: string; // Unique ID for React keys
  move: string;
  username: string;
  team: Team;
  timestamp: number;
}
