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

// CONSTANTS
const COOLDOWN_MS = 200; // Time between moves per player

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

    // 1. RATE LIMITING (COOLDOWN)
    // We check if this specific user is cooling down in this specific game.
    const cooldownKey = `GAME:${gameId}:COOLDOWN:${username}`;
    const isCoolingDown = await redis.exists(cooldownKey);

    if (isCoolingDown) {
      return NextResponse.json(
        { success: false, message: "Cooldown active" },
        { status: 429 }
      );
    }

    // 2. ATOMIC LOCK
    // Prevents race conditions on the board state
    const lockKey = `GAME:${gameId}:LOCK`;
    const acquiredLock = await redis.set(lockKey, "1", { nx: true, px: 500 });

    if (!acquiredLock) {
      return NextResponse.json(
        { success: false, message: "Server busy, try again" },
        { status: 429 }
      );
    }

    try {
      // 3. FETCH STATE
      const fenKey = `GAME:${gameId}:FEN`;
      const metaKey = `GAME:${gameId}:META`;

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

      // 4. GAME LOGIC ENGINE
      // Force turn hack for 'spam' logic
      const fenParts = currentFen.split(" ");
      fenParts[1] = team;
      const forcedFen = fenParts.join(" ");

      const game = new Chess(forcedFen);

      let moveDetails;
      try {
        const myKingPos = findKing(game, team);

        // Standard parse
        const standardMoves = game.moves({ verbose: true });
        moveDetails = standardMoves.find(
          (m) => m.san === move || m.lan === move
        );

        // Shadow Board parse (bypass check)
        if (!moveDetails && myKingPos) {
          const kingPiece = game.remove(myKingPos);
          const looseMoves = game.moves({ verbose: true });
          moveDetails = looseMoves.find(
            (m) => m.san === move || m.lan === move
          );
          if (kingPiece) game.put(kingPiece, myKingPos);
        }

        if (!moveDetails) throw new Error("Invalid move");

        // Regicide Check
        const targetSquare = game.get(moveDetails.to);
        if (
          targetSquare &&
          targetSquare.type === "k" &&
          targetSquare.color !== team
        ) {
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

        // Apply Move
        if (myKingPos && moveDetails.piece !== "k") {
          const king = game.remove(myKingPos);
          game.move(move);
          if (king) game.put(king, myKingPos);
        } else {
          game.move(move);
        }
      } catch (e) {
        return NextResponse.json(
          { success: false, message: "Invalid move geometry" },
          { status: 400 }
        );
      }

      const newFen = game.fen();

      // 5. UPDATE STATE, SET COOLDOWN, AND EXTEND TTL
      const GAME_TTL = 86400; // 24 Hours
      const pipeline = redis.pipeline();

      // Update the Board
      pipeline.set(fenKey, newFen);

      // Set the Cooldown (Short term)
      pipeline.set(cooldownKey, "1", { px: COOLDOWN_MS });

      // Extend Life of Game Keys (Long term)
      pipeline.expire(fenKey, GAME_TTL);
      pipeline.expire(metaKey, GAME_TTL);
      pipeline.expire(`GAME:${gameId}:PLAYERS`, GAME_TTL);

      await pipeline.exec();

      // 6. BROADCAST
      await pusher.trigger(`game-${gameId}`, "update-board", {
        fen: newFen,
        lastMove: move,
        lastMover: username,
        team: team,
      });

      return NextResponse.json({ success: true, fen: newFen });
    } finally {
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
