import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { generateGameId } from "@/lib/utils";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const GAME_TTL = 86400; // 24 Hours in seconds

export async function POST() {
  try {
    const gameId = generateGameId();

    const fenKey = `GAME:${gameId}:FEN`;
    const metaKey = `GAME:${gameId}:META`;
    const playersKey = `GAME:${gameId}:PLAYERS`; // We prep this key too

    const pipeline = redis.pipeline();

    // Create Keys
    pipeline.set(fenKey, STARTING_FEN);
    pipeline.hset(metaKey, {
      status: "waiting",
      createdAt: Date.now(),
    });

    // Set Expiration (TTL)
    pipeline.expire(fenKey, GAME_TTL);
    pipeline.expire(metaKey, GAME_TTL);
    // Note: Players key doesn't exist yet, but we will expire it in the join route

    await pipeline.exec();

    return NextResponse.json({ success: true, gameId });
  } catch (error) {
    console.error("Create Game Error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create game" },
      { status: 500 }
    );
  }
}
