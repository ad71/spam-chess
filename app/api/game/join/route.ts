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

    // Redis Key for players: GAME:{id}:PLAYERS
    const playersKey = `GAME:${gameId}:PLAYERS`;

    // 1. Check if username is taken in this game
    // We fetch all current players to check.
    // (Optimization: In a huge scale app, we'd use a separate Set for usernames,
    // but for <100 players, scanning the list is fine).
    const currentPlayersRaw = await redis.lrange(playersKey, 0, -1);
    const isTaken = currentPlayersRaw.some((p) => {
      const player = JSON.parse(p as string) as Player;
      return player.username.toLowerCase() === username.toLowerCase();
    });

    if (isTaken) {
      return NextResponse.json(
        { success: false, message: "Username taken in this lobby" },
        { status: 409 } // Conflict
      );
    }

    // 2. Create Player Object
    const newPlayer: Player = {
      username,
      team,
      joinedAt: Date.now(),
    };

    // 3. Save to Redis
    await redis.rpush(playersKey, JSON.stringify(newPlayer));

    // 4. Trigger Pusher Event
    await pusher.trigger(`game-${gameId}`, "player-joined", newPlayer);

    return NextResponse.json({ success: true, player: newPlayer });
  } catch (error) {
    console.error("Join Error:", error);
    return NextResponse.json(
      { success: false, message: "Internal Error" },
      { status: 500 }
    );
  }
}
