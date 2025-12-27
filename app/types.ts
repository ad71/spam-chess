export type Team = "w" | "b";
export type GameStatus = "waiting" | "playing" | "finished";

export interface Player {
  username: string;
  team: Team;
  joinedAt: number;
}

// The shape of the data we expect when fetching a game
export interface GameInfo {
  gameId: string;
  fen: string;
  status: GameStatus;
  players: Player[]; // Added players list
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
}
