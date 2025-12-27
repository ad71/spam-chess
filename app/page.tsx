"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleCreateGame = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/game/create", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        router.push(`/game/${data.gameId}`);
      } else {
        alert("Failed to create game");
        setIsLoading(false);
      }
    } catch (error) {
      console.error(error);
      setIsLoading(false);
    }
  };

  const handleJoinGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.length < 3) return;
    router.push(`/game/${joinCode.toUpperCase()}`);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-4 font-mono">
      <div className="max-w-md w-full bg-slate-900 border border-slate-700 p-8 rounded-xl shadow-2xl relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <svg width="100" height="100" viewBox="0 0 100 100">
            <path
              d="M50 0 L100 25 L100 75 L50 100 L0 75 L0 25 Z"
              fill="currentColor"
            />
          </svg>
        </div>

        <h1 className="text-4xl font-bold text-center mb-2 text-emerald-400">
          SPAM CHESS
        </h1>
        <p className="text-slate-400 text-center mb-8">
          Real-time Regicide. No turns. No mercy.
        </p>

        <div className="space-y-6">
          <button
            onClick={handleCreateGame}
            disabled={isLoading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-lg font-bold text-lg transition-all active:scale-95 shadow-lg shadow-emerald-900/50 disabled:opacity-50"
          >
            {isLoading ? "INITIALIZING..." : "CREATE NEW GAME"}
          </button>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-700"></div>
            <span className="flex-shrink-0 mx-4 text-slate-500 text-sm">
              OR JOIN EXISTING
            </span>
            <div className="flex-grow border-t border-slate-700"></div>
          </div>

          <form onSubmit={handleJoinGame} className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ENTER CODE"
              className="flex-1 bg-slate-950 border border-slate-700 rounded p-3 text-white focus:outline-none focus:border-emerald-500 transition-colors uppercase tracking-widest text-center font-bold"
            />
            <button
              type="submit"
              className="bg-slate-800 text-slate-200 hover:bg-slate-700 px-6 rounded-lg font-bold transition-colors border border-slate-600"
            >
              GO
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
