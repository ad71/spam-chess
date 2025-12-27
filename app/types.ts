export type Team = "w" | "b";
export type GameStatus = "waiting" | "playing" | "finished";

// The shape of the data we expect when fetching a game
export interface GameInfo {
  gameId: string;
  fen: string;
  status: GameStatus;
  lastMove?: string;
  lastMover?: string;
}

// Payload sent when making a move
export interface MoveRequest {
  gameId: string;
  move: string;
  team: Team;
  username: string;
}

export interface MoveResponse {
  success: boolean;
  fen?: string;
  message?: string;
}
