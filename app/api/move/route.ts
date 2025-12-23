import { NextResponse } from "next/server";
import Pusher from "pusher";
import { Redis } from "@upstash/redis";
import { Chess } from "chess.js";

// 1. Setup Redis & Pusher
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

export async function POST(req: Request) {
  try {
    const { move } = await req.json();

    // 2. Fetch current state from Redis (or default to start)
    const currentFen =
      ((await redis.get("CHESS_GAME_FEN")) as string) ||
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    // 3. Validate Move
    const game = new Chess(currentFen);
    try {
      game.move(move); // Throws exception if invalid
    } catch (e) {
      return NextResponse.json(
        { success: false, message: "Invalid move" },
        { status: 400 }
      );
    }

    // 4. Update Redis & Notify Everyone
    const newFen = game.fen();
    await redis.set("CHESS_GAME_FEN", newFen);

    // Trigger the event to the "spam-chess" channel
    await pusher.trigger("spam-chess", "update-board", {
      fen: newFen,
      lastMove: move,
    });

    return NextResponse.json({ success: true, fen: newFen });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
