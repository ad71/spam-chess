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
const MAX_RETRIES = 5; // Try 5 times before giving up

// --- HELPERS ---

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

function isMoveMatch(userInputClean: string, move: Move) {
  const lan = cleanMove(move.lan);
  const san = cleanMove(move.san);

  if (lan === userInputClean) return true;
  if (san === userInputClean) return true;

  if (move.promotion) {
    if (lan.startsWith(userInputClean) && userInputClean.length === 4)
      return true;
    if (san.startsWith(userInputClean) && userInputClean.length >= 3)
      return true;
  }

  const p = move.piece;
  if (p !== "p") {
    const f = move.from[0];
    const r = move.from[1];
    const t = move.to;
    const candidates = [p + f + t, p + r + t, p + f + r + t];
    if (candidates.includes(userInputClean)) return true;
  }

  return false;
}

// --- MAIN HANDLER ---

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

    // 1. RATE LIMITING (Check first to save resources)
    const cooldownKey = `GAME:${gameId}:COOLDOWN:${username}`;
    if (await redis.exists(cooldownKey)) {
      return NextResponse.json(
        { success: false, message: "Cooldown active" },
        { status: 429 }
      );
    }

    // 2. RETRY LOOP (Optimistic Concurrency)
    // We attempt to apply the move. If the state changes while we are calculating,
    // we loop again and try to apply the move to the NEW state.
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // A. Fetch Current State
      const fenKey = `GAME:${gameId}:FEN`;
      const metaKey = `GAME:${gameId}:META`;

      const [currentFen, meta] = await Promise.all([
        redis.get<string>(fenKey),
        redis.hgetall<{ status: string; winner: string }>(metaKey),
      ]);

      if (!currentFen || !meta) throw new Error("Game not found");
      if (meta.status === "finished") {
        return NextResponse.json(
          { success: false, message: "Game Over" },
          { status: 400 }
        );
      }

      // B. Setup Engine & Parse Move
      const fenParts = currentFen.split(" ");
      fenParts[1] = team; // Force turn
      const forcedFen = fenParts.join(" ");
      const game = new Chess(forcedFen);
      const cleanedInput = cleanMove(move);

      const myKingPos = findKing(game, team);
      const enemyKingPos = findKing(game, team === "w" ? "b" : "w");

      // --- PHASE: REGICIDE CHECK ---
      let isRegicide = false;

      if (enemyKingPos) {
        const isKingMove =
          cleanedInput.startsWith("k") ||
          (myKingPos && cleanedInput.startsWith(myKingPos));
        let myKingPiece;

        // Remove own king to allow 'illegal' check moves, unless King is the one moving
        if (myKingPos && !isKingMove) {
          myKingPiece = game.remove(myKingPos);
        }

        const enemyKingPiece = game.remove(enemyKingPos);
        game.put({ type: "q", color: team === "w" ? "b" : "w" }, enemyKingPos); // Decoy

        const killMoves = game.moves({ verbose: true });
        const killShot = killMoves.find(
          (m) => isMoveMatch(cleanedInput, m) && m.to === enemyKingPos
        );

        if (killShot) isRegicide = true;

        // Cleanup board state for standard check
        game.remove(enemyKingPos);
        if (enemyKingPiece) game.put(enemyKingPiece, enemyKingPos);
        if (myKingPiece && myKingPos) game.put(myKingPiece, myKingPos);
      }

      // --- BRANCH 1: REGICIDE VICTORY ---
      if (isRegicide) {
        // Atomic Win Claim via Lua
        // Only wins if game is NOT already finished
        const winScript = `
          if redis.call('hget', KEYS[1], 'status') == 'finished' then
            return 0
          else
            redis.call('hset', KEYS[1], 'status', 'finished', 'winner', ARGV[1])
            return 1
          end
        `;

        const winResult = await redis.eval(winScript, [metaKey], [team]);

        if (winResult === 1) {
          await pusher.trigger(`game-${gameId}`, "game-over", {
            winner: team,
            lastMover: username,
            captured: "k",
          });
          return NextResponse.json({
            success: true,
            isGameOver: true,
            winner: team,
          });
        } else {
          // Someone else won milliseconds before us
          return NextResponse.json(
            { success: false, message: "Game already over" },
            { status: 400 }
          );
        }
      }

      // --- PHASE: STANDARD MOVE VALIDATION ---
      let moveDetails: Move | undefined;
      const standardMoves = game.moves({ verbose: true });
      moveDetails = standardMoves.find((m) => isMoveMatch(cleanedInput, m));

      // Try Shadow Board if standard fails
      if (!moveDetails && myKingPos) {
        const kingPiece = game.remove(myKingPos);
        const looseMoves = game.moves({ verbose: true });
        moveDetails = looseMoves.find((m) => isMoveMatch(cleanedInput, m));
        if (kingPiece) game.put(kingPiece, myKingPos);
      }

      if (!moveDetails) {
        // Invalid Move logic:
        // If this is the first attempt, it might be a user error.
        // If this is a retry (attempt > 0), it means the board changed and invalidated our move.
        // In either case, we can't process this move on *this* board state.
        // We break the loop and return error.
        break;
      }

      // --- PHASE: EXECUTION ---
      let capturedPiece = moveDetails.captured;

      try {
        const result = game.move(moveDetails);
        if (!result) throw new Error("Move failed");
      } catch (e) {
        // Force move manually
        const piece = game.remove(moveDetails.from);
        const target = game.remove(moveDetails.to);
        if (target) capturedPiece = target.type;

        if (piece) {
          if (moveDetails.promotion) piece.type = moveDetails.promotion;
          game.put(piece, moveDetails.to);
        }
        // Handle Castling
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

      // --- BRANCH 2: ATOMIC COMMIT (CAS) ---
      // We use a Lua script to ensure we only update FEN if it hasn't changed since we read it.
      // This is the core fix for the race condition.

      const updateScript = `
        if redis.call('get', KEYS[1]) == ARGV[1] then
          redis.call('set', KEYS[1], ARGV[2])
          redis.call('set', KEYS[2], '1', 'PX', ARGV[3])
          redis.call('expire', KEYS[1], ARGV[4])
          redis.call('expire', KEYS[3], ARGV[4])
          redis.call('expire', KEYS[4], ARGV[4])
          return 1
        else
          return 0
        end
      `;

      const playersKey = `GAME:${gameId}:PLAYERS`;
      const result = await redis.eval(
        updateScript,
        [fenKey, cooldownKey, metaKey, playersKey], // KEYS
        [currentFen, newFen, COOLDOWN_MS, GAME_TTL] // ARGV
      );

      if (result === 1) {
        // SUCCESS!
        await pusher.trigger(`game-${gameId}`, "update-board", {
          fen: newFen,
          lastMove: move,
          lastMover: username,
          team: team,
          captured: capturedPiece,
        });
        return NextResponse.json({ success: true, fen: newFen });
      }

      // If result === 0, the FEN changed between read and write.
      // The loop will continue, we fetch the NEW FEN, and try again.
      // This happens instantly (server-side retry), so the user sees no error.
    }

    // If we exhausted retries
    return NextResponse.json(
      { success: false, message: "Server busy, try again" },
      { status: 409 }
    );
  } catch (error) {
    console.error("Move Error:", error);
    return NextResponse.json(
      { success: false, message: "Error" },
      { status: 500 }
    );
  }
}
