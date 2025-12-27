import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { GameInfo, GameStatus } from "@/app/types";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;

  // Fetch FEN and Meta in parallel
  const [fen, meta] = await Promise.all([
    redis.get<string>(`GAME:${gameId}:FEN`),
    redis.hgetall<{ status: GameStatus }>(`GAME:${gameId}:META`),
  ]);

  if (!fen || !meta) {
    return NextResponse.json(
      { success: false, message: "Game not found" },
      { status: 404 }
    );
  }

  const response: GameInfo = {
    gameId,
    fen,
    status: meta.status || "waiting",
  };

  return NextResponse.json(response);
}
