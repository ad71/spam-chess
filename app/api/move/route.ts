import { NextResponse } from "next/server";
import Pusher from "pusher";
import { Redis } from "@upstash/redis";
import { Chess } from "chess.js";
import { MoveRequest, MoveResponse } from "@/app/types";

// Initialize Infrastructure
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

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export async function POST(req: Request) {
  try {
    const body: MoveRequest = await req.json();
    const { move, team, username } = body;

    // 1. Validation: Ensure we have necessary data
    if (!move || !team || !username) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    // 2. Fetch State
    const currentFen =
      (await redis.get<string>("CHESS_GAME_FEN")) || STARTING_FEN;

    // 3. THE CHAOS HACK: Force the board to accept a move from the requesting team
    // regardless of whose turn it actually is.
    const fenParts = currentFen.split(" ");

    // fenParts[1] is the active color ('w' or 'b')
    // We overwrite it with the requester's team.
    fenParts[1] = team;

    // Reconstruct FEN with the forced turn
    const forcedFen = fenParts.join(" ");

    const game = new Chess(forcedFen);

    // 4. Attempt the move
    try {
      const moveResult = game.move(move);
      // Note: game.move() validates that the piece belongs to 'team'
      // and the move is geometrically legal.

      if (!moveResult) throw new Error("Null move result");
    } catch (e) {
      // Move failed (illegal, or blocked)
      return NextResponse.json(
        { success: false, message: "Invalid move" },
        { status: 400 }
      );
    }

    // 5. Success! Get the new state
    const newFen = game.fen();

    // 6. Commit to Database
    await redis.set("CHESS_GAME_FEN", newFen);

    // 7. Broadcast to the world
    await pusher.trigger("spam-chess", "update-board", {
      fen: newFen,
      lastMove: move,
      lastMover: username,
      team: team,
    });

    return NextResponse.json<MoveResponse>({
      success: true,
      fen: newFen,
    });
  } catch (error) {
    console.error("Move Error:", error);
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500 }
    );
  }
}
