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

export async function POST() {
  // 1. Clear the DB
  await redis.del("CHESS_GAME_FEN");

  // 2. Broadcast the Reset
  const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  await pusher.trigger("spam-chess", "reset-board", {
    fen: startFen,
  });

  return NextResponse.json({ success: true });
}
