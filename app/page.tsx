"use client";

import { useState, useEffect } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import Pusher from "pusher-js";

export default function Home() {
  const [game, setGame] = useState(new Chess());
  const [moveInput, setMoveInput] = useState("");
  const [status, setStatus] = useState("Connecting...");

  useEffect(() => {
    // 1. Connect to Pusher
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });

    const channel = pusher.subscribe("spam-chess");

    // 2. Listen for updates from other players
    channel.bind("update-board", (data: { fen: string }) => {
      const newGame = new Chess(data.fen);
      setGame(newGame);
      setStatus("Live");
    });

    // 3. Initial fetch (to get current board state on load)
    // In a real app we'd have a GET endpoint, but for now we rely on the first move
    // or you can manually trigger a move to sync.
    setStatus("Ready to Spam");

    return () => {
      pusher.unsubscribe("spam-chess");
    };
  }, []);

  // 4. Handle "Spamming" the Move
  const handleMove = async (e: React.FormEvent) => {
    e.preventDefault();
    const move = moveInput.trim();
    if (!move) return;

    // Optimistic Update: Try move locally first for instant feel
    const gameCopy = new Chess(game.fen());
    try {
      gameCopy.move(move);
      setGame(gameCopy); // Show move immediately
      setMoveInput(""); // Clear input

      // Send to server
      await fetch("/api/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ move }),
      });
    } catch (error) {
      // If invalid, shake input or just ignore (it's spam chess!)
      console.log("Invalid move locally");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      <h1 className="text-4xl font-bold mb-4 font-mono text-green-400">
        SPAM CHESS
      </h1>

      <div className="w-full max-w-[400px]">
        {/* The Board */}
        <div className="border-4 border-green-700 rounded-lg overflow-hidden shadow-2xl">
          <Chessboard position={game.fen()} />
        </div>

        {/* The Input "Chat" Box */}
        <form onSubmit={handleMove} className="mt-6 flex gap-2">
          <input
            type="text"
            className="flex-1 bg-gray-800 border border-gray-600 rounded px-4 py-3 text-lg font-mono focus:outline-none focus:border-green-500"
            placeholder="Type move (e.g. e4, Nf3)"
            value={moveInput}
            onChange={(e) => setMoveInput(e.target.value)}
            autoFocus
          />
          <button
            type="submit"
            className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-6 rounded font-mono"
          >
            SEND
          </button>
        </form>

        <p className="text-center mt-4 text-gray-500 text-sm font-mono">
          Status: {status} | Turn: {game.turn() === "w" ? "White" : "Black"}
        </p>
      </div>
    </div>
  );
}
