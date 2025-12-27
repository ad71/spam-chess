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
    <>
      <div className="scanline-overlay"></div>
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#020617] text-white p-4 font-mono relative overflow-hidden">
        {/* Background Ambient Glow */}
        <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,_rgba(16,185,129,0.05),_transparent_60%)]"></div>

        <div className="glass-panel p-10 rounded-2xl w-full max-w-md shadow-2xl relative z-10 animate-fade-in border border-slate-800">
          {/* LOGO SECTION */}
          <div className="flex flex-col items-center justify-center mb-12">
            <h1 className="flex flex-col items-center leading-[0.85]">
              <span className="text-7xl md:text-8xl font-black text-white tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">
                SPAM
              </span>
              <span className="text-7xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-emerald-400 to-emerald-700 tracking-tighter drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                CHESS
              </span>
            </h1>
            <div className="h-1 w-24 bg-emerald-500 mt-6 rounded-full opacity-50"></div>
            <p className="mt-4 text-emerald-500/80 font-mono text-xs tracking-[0.3em] uppercase">
              Real-Time Strategy
            </p>
          </div>

          <div className="space-y-6">
            {/* CREATE BUTTON */}
            <button
              onClick={handleCreateGame}
              disabled={isLoading}
              className="group relative w-full overflow-hidden rounded-lg bg-emerald-600 p-4 text-white shadow-lg transition-all hover:bg-emerald-500 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
              <span className="relative font-black text-xl tracking-widest flex items-center justify-center gap-2">
                {isLoading ? "INITIALIZING..." : "NEW GAME"}
              </span>
            </button>

            {/* DIVIDER */}
            <div className="relative flex py-2 items-center opacity-50">
              <div className="flex-grow border-t border-slate-600"></div>
              <span className="flex-shrink-0 mx-4 text-slate-500 text-[10px] tracking-widest">
                OR JOIN EXISTING
              </span>
              <div className="flex-grow border-t border-slate-600"></div>
            </div>

            {/* JOIN FORM */}
            <form onSubmit={handleJoinGame} className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="CODE"
                className="flex-1 bg-slate-950/50 border border-slate-700 rounded-lg p-3 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all uppercase tracking-widest text-center font-bold text-lg"
              />
              <button
                type="submit"
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-500 px-6 rounded-lg font-bold transition-all active:scale-95"
              >
                GO
              </button>
            </form>
          </div>

          {/* Footer Decor */}
          <div className="absolute bottom-2 right-4 text-[8px] text-slate-700 font-mono">
            V.1.0 // NO_TURNS
          </div>
        </div>
      </div>
    </>
  );
}
