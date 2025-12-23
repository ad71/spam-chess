export type Team = "w" | "b";

export interface GameState {
  fen: string;
  lastMove: string;
  lastMover: string; // Username of who played the last move
}

export interface MoveRequest {
  move: string;
  team: Team;
  username: string;
}

export interface MoveResponse {
  success: boolean;
  fen?: string;
  message?: string;
  isGameOver?: boolean;
  winner?: Team;
}
