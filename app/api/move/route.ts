import { NextResponse } from "next/server";
import Pusher from "pusher";
import { Redis } from "@upstash/redis";
import { Chess, Square } from "chess.js";
import { MoveRequest, MoveResponse, Team } from "@/app/types";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  useTLS: true,
});

// Helper to find a king's position
function findKing(game: Chess, color: Team): Square | undefined {
  const board = game.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.type === "k" && piece.color === color) {
        return piece.square;
      }
    }
  }
  return undefined;
}

export async function POST(req: Request) {
  try {
    const body: MoveRequest = await req.json();
    const { move, team, username, gameId } = body;

    if (!move || !team || !username || !gameId) {
      return NextResponse.json(
        { success: false, message: "Missing fields" },
        { status: 400 }
      );
    }

    // 1. ATOMIC LOCK
    const lockKey = `GAME:${gameId}:LOCK`;
    const acquiredLock = await redis.set(lockKey, "1", { nx: true, px: 500 });

    if (!acquiredLock) {
      return NextResponse.json(
        { success: false, message: "Rate limited / Race condition" },
        { status: 429 }
      );
    }

    try {
      // 2. FETCH STATE
      const fenKey = `GAME:${gameId}:FEN`;
      const metaKey = `GAME:${gameId}:META`;

      // Fetch FEN and Status
      const [currentFen, meta] = await Promise.all([
        redis.get<string>(fenKey),
        redis.hgetall<{ status: string; winner: string }>(metaKey),
      ]);

      if (!currentFen || !meta) {
        throw new Error("Game not found");
      }

      if (meta.status === "finished") {
        return NextResponse.json(
          { success: false, message: "Game is over" },
          { status: 400 }
        );
      }

      // 3. GAME LOGIC ENGINE
      // HACK: Force the turn to the requesting team
      const fenParts = currentFen.split(" ");
      fenParts[1] = team; // Set active color
      const forcedFen = fenParts.join(" ");

      const game = new Chess(forcedFen);

      // 3a. PARSE MOVE
      let moveDetails;
      try {
        const myKingPos = findKing(game, team);

        // Try standard parsing
        const standardMoves = game.moves({ verbose: true });
        moveDetails = standardMoves.find(
          (m) => m.san === move || m.lan === move
        );

        // If standard parsing fails (likely due to check), try "Shadow Board" parsing
        if (!moveDetails && myKingPos) {
          const kingPiece = game.remove(myKingPos);

          // Now check moves again without our King
          const looseMoves = game.moves({ verbose: true });
          moveDetails = looseMoves.find(
            (m) => m.san === move || m.lan === move
          );

          // Put King back immediately
          if (kingPiece) game.put(kingPiece, myKingPos);
        }

        if (!moveDetails) {
          throw new Error("Invalid move geometry");
        }

        // 3b. REGICIDE CHECK (Winning Condition)
        const targetSquare = game.get(moveDetails.to);

        if (
          targetSquare &&
          targetSquare.type === "k" &&
          targetSquare.color !== team
        ) {
          // GAME OVER!
          await redis.hset(metaKey, { status: "finished", winner: team });

          await pusher.trigger(`game-${gameId}`, "game-over", {
            winner: team,
            lastMover: username,
          });

          return NextResponse.json({
            success: true,
            isGameOver: true,
            winner: team,
          });
        }

        // 3c. APPLY MOVE
        if (myKingPos && moveDetails.piece !== "k") {
          // To ensure the move is executed even if in check:
          const king = game.remove(myKingPos);
          game.move(move); // Execute move

          // FIXED: Ensure king exists before putting back
          if (king) {
            game.put(king, myKingPos);
          }
        } else {
          // King is moving, or standard move is fine
          game.move(move);
        }
      } catch (e) {
        return NextResponse.json(
          { success: false, message: "Invalid move" },
          { status: 400 }
        );
      }

      const newFen = game.fen();

      // 4. COMMIT STATE
      await redis.set(fenKey, newFen);

      // 5. BROADCAST
      await pusher.trigger(`game-${gameId}`, "update-board", {
        fen: newFen,
        lastMove: move,
        lastMover: username,
        team: team,
      });

      return NextResponse.json({ success: true, fen: newFen });
    } finally {
      // 6. RELEASE LOCK
      await redis.del(lockKey);
    }
  } catch (error) {
    console.error("Move Error:", error);
    return NextResponse.json(
      { success: false, message: "Server Error" },
      { status: 500 }
    );
  }
}
