import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { generateGameId } from "@/lib/utils";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export async function POST() {
  try {
    const gameId = generateGameId();

    // Redis Keys:
    // GAME:{id}:FEN  -> The board state
    // GAME:{id}:META -> { status, createdAt }

    const pipeline = redis.pipeline();

    pipeline.set(`GAME:${gameId}:FEN`, STARTING_FEN);
    pipeline.hset(`GAME:${gameId}:META`, {
      status: "waiting",
      createdAt: Date.now(),
    });

    // Execute all commands
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
