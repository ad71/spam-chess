"use client";

import { useState, useEffect, use } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import Pusher from "pusher-js";
import { Team, GameInfo } from "@/app/types";
import { useRouter } from "next/navigation";

export default function GamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = use(params); // Unwrap params in Next.js 15+
  const router = useRouter();

  // --- Game State ---
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState("start");

  // --- Loading/Error State ---
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- User State ---
  const [team, setTeam] = useState<Team | null>(null);
  const [username, setUsername] = useState("");
  const [tempUsername, setTempUsername] = useState("");

  // --- UI State ---
  const [moveInput, setMoveInput] = useState("");
  const [status, setStatus] = useState("Syncing...");
  const [lastMover, setLastMover] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 1. Initial Data Fetch
  useEffect(() => {
    const fetchGameState = async () => {
      try {
        const res = await fetch(`/api/game/${gameId}/state`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("Game not found");
          } else {
            setError("Failed to load game");
          }
          setLoading(false);
          return;
        }

        const data: GameInfo = await res.json();
        const newGame = new Chess(data.fen);
        setGame(newGame);
        setFen(data.fen);
        setLoading(false);
        setStatus("Ready");
      } catch (err) {
        console.error(err);
        setError("Network error");
        setLoading(false);
      }
    };

    fetchGameState();
  }, [gameId]);

  // 2. Pusher Connection (Only after loading)
  useEffect(() => {
    if (loading || error) return;

    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });

    // Subscribe to dynamic channel for this specific game
    const channelName = `game-${gameId}`;
    const channel = pusher.subscribe(channelName);

    channel.bind(
      "update-board",
      (data: { fen: string; lastMove: string; lastMover: string }) => {
        const newGame = new Chess(data.fen);
        setGame(newGame);
        setFen(data.fen);
        setLastMover(data.lastMover);
        setStatus("Live");
      }
    );

    return () => {
      pusher.unsubscribe(channelName);
    };
  }, [gameId, loading, error]);

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

    // Optimistic Update
    const gameCopy = new Chess(fen);
    const fenParts = gameCopy.fen().split(" ");
    fenParts[1] = team;
    const forcedGame = new Chess(fenParts.join(" "));

    try {
      const result = forcedGame.move(moveCommand);
      if (result) {
        setGame(forcedGame);
        setFen(forcedGame.fen());
        setMoveInput("");
      }
    } catch (e) {
      // Ignore local validation errors
    }

    // Send Move with Game ID
    await fetch("/api/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        move: moveCommand,
        team,
        username,
        gameId, // Critical: Send the ID
      }),
    });
  };

  const copyInvite = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- RENDER: LOADING/ERROR ---
  if (loading)
    return <div className="text-white p-10 font-mono">Loading Game...</div>;
  if (error)
    return <div className="text-red-500 p-10 font-mono text-xl">{error}</div>;

  // --- RENDER: LOBBY (Pick Team) ---
  if (!team) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-4 font-mono">
        <div className="max-w-md w-full bg-slate-900 border border-slate-700 p-8 rounded-xl shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-emerald-400">
              GAME: {gameId}
            </h1>
            <button
              onClick={copyInvite}
              className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded border border-slate-600 transition-colors"
            >
              {copied ? "COPIED!" : "COPY LINK"}
            </button>
          </div>

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

  // --- RENDER: PLAYING ---
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-4 font-mono">
      {/* HEADER */}
      <div className="w-full max-w-[500px] flex justify-between items-end mb-4">
        <div>
          <h1 className="text-2xl font-bold text-emerald-500 leading-none">
            ROOM: {gameId}
          </h1>
          <p className="text-xs text-slate-500 mt-1">Status: {status}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={copyInvite}
            className="text-xs text-slate-400 hover:text-white underline decoration-dotted"
          >
            {copied ? "Link Copied" : "Share Link"}
          </button>
          <div
            className={`px-3 py-1 rounded border ${
              team === "w"
                ? "border-slate-200 text-slate-200"
                : "border-slate-600 text-slate-500"
            }`}
          >
            <span className="font-bold">
              {team === "w" ? "WHITE" : "BLACK"}
            </span>
          </div>
        </div>
      </div>

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
            animationDuration={200}
          />

          {lastMover && (
            <div className="absolute top-2 right-2 bg-black/70 backdrop-blur text-xs px-2 py-1 rounded text-emerald-400 border border-emerald-900/50 z-10">
              Last: {lastMover}
            </div>
          )}
        </div>

        {/* INPUT AREA */}
        <form onSubmit={handleMove} className="mt-6 flex gap-2">
          <input
            type="text"
            className="flex-1 bg-slate-900 border border-slate-700 rounded px-4 py-4 text-xl font-mono text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-all"
            placeholder={`Move (e.g. ${team === "w" ? "e4" : "e5"})`}
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
      </div>
    </div>
  );
}
