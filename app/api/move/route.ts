import { NextResponse } from "next/server";
import Pusher from "pusher";
import { Redis } from "@upstash/redis";
import { Chess } from "chess.js";
import { MoveRequest, MoveResponse } from "@/app/types";

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
    const body: MoveRequest = await req.json();
    const { move, team, username, gameId } = body;

    if (!move || !team || !username || !gameId) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    const redisKey = `GAME:${gameId}:FEN`;
    const currentFen = await redis.get<string>(redisKey);

    if (!currentFen) {
      return NextResponse.json(
        { success: false, message: "Game not found" },
        { status: 404 }
      );
    }

    // --- PHASE 1 LOGIC (Simplified for now, will enhance later) ---
    // Force turn hack (Still needed until Phase 3 Refactor)
    const fenParts = currentFen.split(" ");
    fenParts[1] = team;
    const forcedFen = fenParts.join(" ");

    const game = new Chess(forcedFen);

    try {
      const moveResult = game.move(move);
      if (!moveResult) throw new Error("Null move result");
    } catch (e) {
      return NextResponse.json(
        { success: false, message: "Invalid move" },
        { status: 400 }
      );
    }

    const newFen = game.fen();

    // Update DB
    await redis.set(redisKey, newFen);

    // Broadcast to specific game channel: 'game-{gameId}'
    await pusher.trigger(`game-${gameId}`, "update-board", {
      fen: newFen,
      lastMove: move,
      lastMover: username,
      team: team,
    });

    return NextResponse.json<MoveResponse>({
      success: true,
      fen: newFen,
    });
  } catch (error) {
    console.error("Move Error:", error);
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500 }
    );
  }
}
