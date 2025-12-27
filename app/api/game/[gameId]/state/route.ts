import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { GameInfo, GameStatus, Player } from "@/app/types";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;

  // Fetch FEN, Meta, and Players in parallel
  const [fen, meta, playersRaw] = await Promise.all([
    redis.get<string>(`GAME:${gameId}:FEN`),
    redis.hgetall<{ status: GameStatus }>(`GAME:${gameId}:META`),
    redis.lrange<string>(`GAME:${gameId}:PLAYERS`, 0, -1),
  ]);

  if (!fen || !meta) {
    return NextResponse.json(
      { success: false, message: "Game not found" },
      { status: 404 }
    );
  }

  // Parse players from JSON strings
  const players: Player[] = (playersRaw || []).map((p) => JSON.parse(p));

  const response: GameInfo = {
    gameId,
    fen,
    status: meta.status || "waiting",
    players,
  };

  return NextResponse.json(response);
}
