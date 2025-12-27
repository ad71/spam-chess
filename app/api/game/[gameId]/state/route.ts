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
  try {
    const { gameId } = await params;

    // Fetch FEN, Meta, and Players in parallel
    // explicit typing helps, but we must handle runtime data safely
    const [fen, meta, playersRaw] = await Promise.all([
      redis.get<string>(`GAME:${gameId}:FEN`),
      redis.hgetall<{ status: GameStatus; winner?: string }>(
        `GAME:${gameId}:META`
      ),
      redis.lrange(`GAME:${gameId}:PLAYERS`, 0, -1),
    ]);

    if (!fen || !meta) {
      return NextResponse.json(
        { success: false, message: "Game not found" },
        { status: 404 }
      );
    }

    // SAFE PARSING LOGIC
    // Redis might return strings OR objects depending on client config.
    // We handle both cases to prevent crashes.
    const players: Player[] = (playersRaw || [])
      .map((p: any) => {
        try {
          if (typeof p === "string") {
            return JSON.parse(p);
          }
          return p; // It's already an object
        } catch (e) {
          console.error("Failed to parse player:", p);
          return null;
        }
      })
      .filter((p): p is Player => p !== null); // Filter out any failed parses

    const response: GameInfo = {
      gameId,
      fen,
      status: meta.status || "waiting",
      winner: (meta.winner as any) || null, // Ensure winner is passed if it exists
      players,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("State Fetch Error:", error);
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500 }
    );
  }
}
