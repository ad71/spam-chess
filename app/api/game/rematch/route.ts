import { NextResponse } from "next/server";
import Pusher from "pusher";
import { Redis } from "@upstash/redis";

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
    const { gameId } = await req.json();

    if (!gameId) {
      return NextResponse.json({ success: false }, { status: 400 });
    }

    const fenKey = `GAME:${gameId}:FEN`;
    const metaKey = `GAME:${gameId}:META`;

    // 1. Reset Database State
    await Promise.all([
      redis.set(fenKey, STARTING_FEN),
      redis.hset(metaKey, { status: "playing", winner: "" }), // Clear winner
    ]);

    // 2. Broadcast Reset Event
    await pusher.trigger(`game-${gameId}`, "game-reset", {
      fen: STARTING_FEN,
      message: "BOARD RESET",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Rematch Error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
