"use client";

import { useState, useEffect, useRef } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import Pusher from "pusher-js";
import { Team } from "@/app/types";

export default function Home() {
  // --- Game State ---
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());

  // --- User State ---
  const [team, setTeam] = useState<Team | null>(null);
  const [username, setUsername] = useState("");
  const [tempUsername, setTempUsername] = useState(""); // For input field

  // --- UI State ---
  const [moveInput, setMoveInput] = useState("");
  const [status, setStatus] = useState("Connecting...");
  const [lastMover, setLastMover] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initialize Pusher
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });

    const channel = pusher.subscribe("spam-chess");

    // Listen for board updates
    channel.bind(
      "update-board",
      (data: { fen: string; lastMove: string; lastMover: string }) => {
        // We create a new Chess instance to ensure validation works locally if needed
        const newGame = new Chess(data.fen);
        setGame(newGame);
        setFen(data.fen);
        setLastMover(data.lastMover);
        setStatus("Live");
      }
    );

    channel.bind("reset-board", (data: { fen: string }) => {
      const newGame = new Chess(data.fen);
      setGame(newGame);
      setFen(data.fen);
      setLastMover(null); // Clear the toaster
      setStatus("Game Reset");
    });

    // Initial sync (optional: could fetch from an API, but pusher handles next event)
    setStatus("Ready");

    return () => {
      pusher.unsubscribe("spam-chess");
    };
  }, []);

  const handleJoin = (selectedTeam: Team) => {
    if (!tempUsername.trim()) {
      alert("Please enter a username!");
      return;
    }
    setUsername(tempUsername);
    setTeam(selectedTeam);
  };

  const handleMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveInput.trim() || !team || !username) return;

    const moveCommand = moveInput.trim();

    // OPTIMISTIC UPDATE:
    // We try to apply the move locally to the current visual board
    // Note: We must clone the game to avoid mutating state directly
    const gameCopy = new Chess(fen);

    // HACK: Force local board turn to match our team so we can visualize the move
    // even if the engine thinks it's the other person's turn
    const fenParts = gameCopy.fen().split(" ");
    fenParts[1] = team;
    const forcedGame = new Chess(fenParts.join(" "));

    try {
      const result = forcedGame.move(moveCommand);
      if (result) {
        // It's a valid move geometry-wise
        setGame(forcedGame); // Update board visually immediately
        setFen(forcedGame.fen());
        setMoveInput(""); // Clear input
      }
    } catch (e) {
      // If local validation fails, we just ignore it visually
      // but we STILL send it to server in case our local state is slightly desynced
    }

    // FIRE AND FORGET
    await fetch("/api/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        move: moveCommand,
        team,
        username,
      }),
    });
  };

  const handleReset = async () => {
    if (confirm("ARE YOU SURE? This will nuke the game for everyone.")) {
      await fetch("/api/reset", { method: "POST" });
    }
  };

  // --- RENDER: LOBBY ---
  if (!team) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-4 font-mono">
        <div className="max-w-md w-full bg-slate-900 border border-slate-700 p-8 rounded-xl shadow-2xl">
          <h1 className="text-4xl font-bold text-center mb-2 text-emerald-400">
            SPAM CHESS
          </h1>
          <p className="text-slate-400 text-center mb-8">Faction Wars</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold mb-2 text-slate-300">
                CODENAME
              </label>
              <input
                type="text"
                value={tempUsername}
                onChange={(e) => setTempUsername(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-emerald-400 focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="Enter alias..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6">
              <button
                onClick={() => handleJoin("w")}
                className="bg-slate-200 text-slate-900 hover:bg-white py-4 rounded-lg font-bold text-lg transition-transform active:scale-95"
              >
                JOIN WHITE
              </button>
              <button
                onClick={() => handleJoin("b")}
                className="bg-slate-800 text-slate-200 hover:bg-slate-700 py-4 rounded-lg font-bold text-lg transition-transform active:scale-95 border border-slate-600"
              >
                JOIN BLACK
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER: GAME BOARD ---
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-4 font-mono">
      {/* HEADER */}
      <div className="w-full max-w-[500px] flex justify-between items-end mb-4">
        <div>
          <h1 className="text-2xl font-bold text-emerald-500 leading-none">
            SPAM CHESS
          </h1>
          <p className="text-xs text-slate-500">Connected: {status}</p>
        </div>
        <div
          className={`text-right px-3 py-1 rounded border ${
            team === "w"
              ? "border-slate-200 text-slate-200"
              : "border-slate-600 text-slate-500"
          }`}
        >
          Playing as:{" "}
          <span className="font-bold">{team === "w" ? "WHITE" : "BLACK"}</span>
        </div>
      </div>
      <button
        onClick={handleReset}
        className="text-xs bg-red-900/50 hover:bg-red-900 text-red-400 border border-red-800 px-3 py-1 rounded transition-colors uppercase font-bold tracking-wider"
      >
        Nuke Game
      </button>
      <div className="w-full max-w-[500px]">
        {/* BOARD */}
        <div
          className={`relative rounded-lg overflow-hidden shadow-2xl border-4 ${
            team === "w" ? "border-slate-200" : "border-slate-700"
          }`}
        >
          <Chessboard
            position={fen}
            boardOrientation={team === "w" ? "white" : "black"}
            customDarkSquareStyle={{ backgroundColor: "#334155" }}
            customLightSquareStyle={{ backgroundColor: "#94a3b8" }}
          />

          {/* Last Mover Toast */}
          {lastMover && (
            <div className="absolute top-2 right-2 bg-black/70 backdrop-blur text-xs px-2 py-1 rounded text-emerald-400 border border-emerald-900/50">
              Last: {lastMover}
            </div>
          )}
        </div>

        {/* INPUT AREA */}
        <form onSubmit={handleMove} className="mt-6 flex gap-2">
          <input
            type="text"
            className="flex-1 bg-slate-900 border border-slate-700 rounded px-4 py-4 text-xl font-mono text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-all"
            placeholder={`Your move... (e.g. ${team === "w" ? "e4" : "e5"})`}
            value={moveInput}
            onChange={(e) => setMoveInput(e.target.value)}
            autoFocus
          />
          <button
            type="submit"
            className={`font-bold py-2 px-6 rounded text-xl transition-all active:scale-95 ${
              team === "w"
                ? "bg-slate-200 text-slate-900 hover:bg-white"
                : "bg-slate-800 text-white hover:bg-slate-700 border border-slate-600"
            }`}
          >
            SEND
          </button>
        </form>

        {/* INSTRUCTIONS */}
        <div className="mt-6 p-4 bg-slate-900/50 rounded border border-slate-800 text-xs text-slate-400 text-center">
          <p>TYPE ANY VALID MOVE. SPEED IS KEY.</p>
          <p className="mt-1 opacity-50">
            Team members can move consecutively.
          </p>
        </div>
      </div>
    </div>
  );
}
