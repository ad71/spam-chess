import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import Pusher from "pusher";
import { JoinRequest, Player } from "@/app/types";

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

const GAME_TTL = 86400; // 24 Hours in seconds

export async function POST(req: Request) {
  try {
    const body: JoinRequest = await req.json();
    const { gameId, username, team } = body;

    if (!gameId || !username || !team) {
      return NextResponse.json(
        { success: false, message: "Missing fields" },
        { status: 400 }
      );
    }

    const playersKey = `GAME:${gameId}:PLAYERS`;

    // 1. Check for duplicates
    // We safely handle cases where the list might be empty or null
    const currentPlayersRaw = await redis.lrange(playersKey, 0, -1);

    const isTaken = (currentPlayersRaw || []).some((p) => {
      try {
        // Handle potential double-encoding or raw objects
        const pStr = typeof p === "string" ? p : JSON.stringify(p);
        const player = JSON.parse(pStr) as Player;
        return player.username.toLowerCase() === username.toLowerCase();
      } catch (e) {
        return false;
      }
    });

    if (isTaken) {
      return NextResponse.json(
        { success: false, message: "Username taken in this lobby" },
        { status: 409 }
      );
    }

    // 2. Create Player Object
    const newPlayer: Player = {
      username,
      team,
      joinedAt: Date.now(),
    };

    // 3. Atomic Transaction: Add Player & Reset Game Timer
    const pipeline = redis.pipeline();

    // Push player to list
    pipeline.rpush(playersKey, JSON.stringify(newPlayer));

    // Extend TTL for all game assets so the game doesn't expire while people are joining
    pipeline.expire(playersKey, GAME_TTL);
    pipeline.expire(`GAME:${gameId}:FEN`, GAME_TTL);
    pipeline.expire(`GAME:${gameId}:META`, GAME_TTL);

    await pipeline.exec();

    // 4. Trigger Pusher Event
    await pusher.trigger(`game-${gameId}`, "player-joined", newPlayer);

    return NextResponse.json({ success: true, player: newPlayer });
  } catch (error) {
    console.error("Join Error:", error);
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500 }
    );
  }
}
