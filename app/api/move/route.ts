import { NextResponse } from "next/server";
import Pusher from "pusher";
import { Redis } from "@upstash/redis";
import { Chess, Square, Move } from "chess.js";
import { MoveRequest, Team } from "@/app/types";

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

const COOLDOWN_MS = 200;
const GAME_TTL = 86400;

// Helper: Normalize string (remove symbols, lowercase)
function cleanMove(m: string) {
  return m.replace(/[x=#+]/g, "").toLowerCase();
}

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

// Helper: Fuzzy Match logic to handle Promotions
// User input: "f7e8" (cleaned)
// Engine LAN: "f7e8q" (cleaned)
// We want this to match.
function isMoveMatch(userInputClean: string, move: Move) {
  const lan = cleanMove(move.lan);
  const san = cleanMove(move.san);

  // 1. Exact matches
  if (lan === userInputClean) return true;
  if (san === userInputClean) return true;

  // 2. Promotion fuzzy match (User didn't type 'q', engine expects it)
  // If move is a promotion, and user input is exactly the from-to coordinates
  if (move.promotion) {
    // LAN check: "f7e8q" starts with "f7e8"
    if (lan.startsWith(userInputClean) && userInputClean.length === 4)
      return true;
    // SAN check: "fxe8q" starts with "fxe8"
    if (san.startsWith(userInputClean) && userInputClean.length >= 3)
      return true;
  }

  return false;
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

    // 1. RATE LIMITING
    const cooldownKey = `GAME:${gameId}:COOLDOWN:${username}`;
    if (await redis.exists(cooldownKey)) {
      return NextResponse.json(
        { success: false, message: "Cooldown active" },
        { status: 429 }
      );
    }

    // 2. LOCK
    const lockKey = `GAME:${gameId}:LOCK`;
    const acquiredLock = await redis.set(lockKey, "1", { nx: true, px: 500 });
    if (!acquiredLock) {
      return NextResponse.json(
        { success: false, message: "Busy" },
        { status: 429 }
      );
    }

    try {
      const fenKey = `GAME:${gameId}:FEN`;
      const metaKey = `GAME:${gameId}:META`;

      const [currentFen, meta] = await Promise.all([
        redis.get<string>(fenKey),
        redis.hgetall<{ status: string; winner: string }>(metaKey),
      ]);

      if (!currentFen || !meta) throw new Error("Game not found");
      if (meta.status === "finished")
        return NextResponse.json(
          { success: false, message: "Game Over" },
          { status: 400 }
        );

      // 3. SETUP BOARD
      const fenParts = currentFen.split(" ");
      fenParts[1] = team;
      const forcedFen = fenParts.join(" ");
      const game = new Chess(forcedFen);
      const cleanedInput = cleanMove(move);

      const myKingPos = findKing(game, team);
      const enemyKingPos = findKing(game, team === "w" ? "b" : "w");

      // --- PHASE A: CHECK FOR REGICIDE (THE KILL SHOT) ---

      let isRegicide = false;

      if (enemyKingPos) {
        // 1. Determine if we need to remove our own king (Shadow Board)
        // Only remove my King if the PIECE MOVING is NOT my King.
        // If my King attacks their King, he must be on the board!
        // We guess if the king is moving by checking if the input matches the king's square.

        // Rough check: does input start with king pos? (e.g. "e1e2")
        const isKingProbablyMoving =
          myKingPos && cleanedInput.startsWith(myKingPos);

        let myKingPiece;
        if (myKingPos && !isKingProbablyMoving) {
          myKingPiece = game.remove(myKingPos);
        }

        // 2. Swap Enemy King for Decoy (Queen)
        const enemyKingPiece = game.remove(enemyKingPos);
        game.put({ type: "q", color: team === "w" ? "b" : "w" }, enemyKingPos);

        // 3. Generate moves against the Decoy
        const killMoves = game.moves({ verbose: true });

        const killShot = killMoves.find(
          (m) =>
            isMoveMatch(cleanedInput, m) && // Use fuzzy matcher
            m.to === enemyKingPos
        );

        if (killShot) {
          isRegicide = true;
        }

        // 4. Cleanup
        game.remove(enemyKingPos); // Remove decoy
        if (enemyKingPiece) game.put(enemyKingPiece, enemyKingPos);
        if (myKingPiece && myKingPos) game.put(myKingPiece, myKingPos);
      }

      if (isRegicide) {
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

      // --- PHASE B: STANDARD MOVE VALIDATION ---

      let moveDetails: Move | undefined;

      // Try Standard
      const standardMoves = game.moves({ verbose: true });
      moveDetails = standardMoves.find((m) => isMoveMatch(cleanedInput, m));

      // Try Shadow Board (Remove My King)
      if (!moveDetails && myKingPos) {
        const kingPiece = game.remove(myKingPos);
        const looseMoves = game.moves({ verbose: true });

        moveDetails = looseMoves.find((m) => isMoveMatch(cleanedInput, m));

        if (kingPiece) game.put(kingPiece, myKingPos);
      }

      if (!moveDetails) {
        throw new Error("Invalid move geometry");
      }

      // --- PHASE C: EXECUTE MOVE ---

      try {
        const result = game.move(moveDetails);
        if (!result) throw new Error("Move failed");
      } catch (e) {
        // Force move manually
        const piece = game.remove(moveDetails.from);
        game.remove(moveDetails.to);

        if (piece) {
          if (moveDetails.promotion) piece.type = moveDetails.promotion;
          game.put(piece, moveDetails.to);
        }

        // Handle Castling Manual
        if (moveDetails.flags.includes("k")) {
          const rook = game.remove((team === "w" ? "h1" : "h8") as Square);
          if (rook) game.put(rook, (team === "w" ? "f1" : "f8") as Square);
        }
        if (moveDetails.flags.includes("q")) {
          const rook = game.remove((team === "w" ? "a1" : "a8") as Square);
          if (rook) game.put(rook, (team === "w" ? "d1" : "d8") as Square);
        }
      }

      const newFen = game.fen();

      const pipeline = redis.pipeline();
      pipeline.set(fenKey, newFen);
      pipeline.set(cooldownKey, "1", { px: COOLDOWN_MS });
      pipeline.expire(fenKey, GAME_TTL);
      pipeline.expire(metaKey, GAME_TTL);
      pipeline.expire(`GAME:${gameId}:PLAYERS`, GAME_TTL);
      await pipeline.exec();

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
      { success: false, message: "Error" },
      { status: 500 }
    );
  }
}
