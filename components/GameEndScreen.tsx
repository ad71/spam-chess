"use client";

import { useState, useEffect } from "react";
import { GameStats, PlayerStat, Team, MoveLog } from "@/app/types";
import ReplayBoard from "./ReplayBoard";

// Icons for the Kill Feed
const PIECE_ICONS: Record<string, string> = {
  p: "♟",
  n: "♞",
  b: "♝",
  r: "♜",
  q: "♛",
  k: "♚",
};

export default function GameEndScreen({
  stats,
  myTeam,
  history,
  onRematch,
}: {
  stats: GameStats;
  myTeam: Team | null;
  history: MoveLog[]; // Passed for replay engine (Phase 1)
  onRematch: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(10);
  const [canRematch, setCanRematch] = useState(false);

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanRematch(true);
    }
  }, [timeLeft]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl animate-fade-in font-mono p-4">
      <div className="w-full max-w-7xl h-[95vh] flex flex-col gap-4 relative">
        {/* TOP SECTION: REPLAY THEATER & HEADER */}
        <div className="flex-4 flex flex-col md:flex-row gap-4 min-h-0">
          {/* LEFT: HEADER & RESULT */}
          <div className="flex-1 flex flex-col justify-center items-center glass-panel rounded-2xl p-8 border-l-4 border-emerald-500 text-center">
            <div className="mb-2 text-white font-bold tracking-[0.5em] text-xs">
              DEBRIEF // GAME OVER
            </div>
            <h1
              className={`text-6xl md:text-8xl font-black leading-none tracking-tighter mb-4 ${
                stats.winner === "w" ? "text-white" : "text-red-500"
              }`}
            >
              {stats.winner === "w" ? "WHITE VICTORY" : "BLACK VICTORY"}
            </h1>
            <div className="h-1 w-24 bg-white/20 rounded mb-8 mx-auto"></div>

            {/* Rematch Button in Header for visibility */}
            <button
              onClick={onRematch}
              disabled={!canRematch}
              className={`
                    w-full relative overflow-hidden group px-8 py-6 rounded-lg font-bold text-xl tracking-widest transition-all
                    ${
                      canRematch
                        ? "bg-emerald-600 text-white hover:bg-emerald-500 hover:scale-[1.02] shadow-2xl shadow-emerald-900/50"
                        : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                    }
                    `}
            >
              {!canRematch && (
                <div
                  className="absolute bottom-0 left-0 h-1 bg-emerald-500 transition-all duration-1000 ease-linear"
                  style={{ width: `${(1 - timeLeft / 10) * 100}%` }}
                ></div>
              )}
              <span className="relative z-10 flex justify-center items-center w-full gap-2">
                <span>
                  {canRematch ? "REMATCH" : `READY IN 00:0${timeLeft}`}
                </span>
              </span>
            </button>
          </div>

          {/* RIGHT: REPLAY BOARD THEATER */}
          <div className="flex-[1.5] glass-panel rounded-2xl border border-slate-700 relative overflow-hidden flex items-center justify-center bg-black/50 shadow-inner">
            {/* We pass the history to the replay engine */}
            <ReplayBoard history={history} />
          </div>
        </div>

        {/* BOTTOM SECTION: STATS GRID */}
        <div className="flex-5 glass-panel rounded-2xl border-t border-white/10 overflow-hidden flex flex-col">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/10 overflow-y-auto">
            {/* WHITE TEAM */}
            <TeamColumn
              teamName="WHITE TEAM"
              stats={stats.whiteStats}
              totalScore={stats.totalWhiteScore}
              isWinner={stats.winner === "w"}
              colorClass="text-white"
              bgClass="bg-slate-200"
            />

            {/* BLACK TEAM */}
            <TeamColumn
              teamName="BLACK TEAM"
              stats={stats.blackStats}
              totalScore={stats.totalBlackScore}
              isWinner={stats.winner === "b"}
              colorClass="text-red-500"
              bgClass="bg-red-600"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamColumn({
  teamName,
  stats,
  totalScore,
  isWinner,
  colorClass,
  bgClass,
}: any) {
  return (
    <div
      className={`p-6 flex flex-col h-full ${
        isWinner ? "bg-emerald-900/5" : "bg-black/20"
      }`}
    >
      <div className="flex justify-between items-end mb-6 border-b border-white/5 pb-4">
        <h2
          className={`text-xl font-black tracking-tight ${colorClass} opacity-90`}
        >
          {teamName}
        </h2>
        <span className="text-slate-500 text-[10px] font-bold tracking-widest bg-slate-900 px-2 py-1 rounded">
          SCORE: <span className="text-white text-sm ml-2">{totalScore}</span>
        </span>
      </div>

      <div className="space-y-2 flex-1">
        {stats.map((player: PlayerStat, idx: number) => (
          <div
            key={player.username}
            className="group relative p-3 rounded bg-slate-900/40 border border-white/5 hover:border-white/10 transition-all flex items-center gap-4 animate-fade-in"
            style={{ animationDelay: `${idx * 50}ms` }}
          >
            {/* Rank */}
            <div
              className={`text-xl font-black opacity-20 w-6 text-center ${colorClass}`}
            >
              {player.rank}
            </div>

            {/* Player Info */}
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${bgClass} shadow-[0_0_5px_currentColor]`}
                ></span>
                <span className="font-bold text-slate-300 text-sm truncate">
                  {player.username}
                </span>

                {/* Badges */}
                <div className="flex gap-1 ml-2">
                  {player.badges.map((b) => (
                    <span
                      key={b}
                      className={`
                                text-[7px] px-1.5 py-0.5 rounded font-black tracking-wider border
                                ${
                                  b === "KINGSLAYER"
                                    ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                                    : b === "MVP"
                                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                    : "bg-slate-800 text-slate-500 border-slate-700"
                                }
                            `}
                    >
                      {b}
                    </span>
                  ))}
                </div>
              </div>

              {/* Kill Feed (Compact) */}
              <div className="h-4 flex items-center overflow-hidden gap-0.5 opacity-60 text-xs text-slate-500">
                {player.kills.length === 0 && (
                  <span className="text-[8px] opacity-30 italic">NO KILLS</span>
                )}
                {player.kills.slice(0, 15).map((k, i) => (
                  <span
                    key={i}
                    title={k}
                    className="hover:text-white transition-colors cursor-help -ml-0.5 first:ml-0"
                  >
                    {PIECE_ICONS[k] || k}
                  </span>
                ))}
              </div>
            </div>

            {/* Score */}
            <div className="text-right min-w-[50px]">
              <div className="text-lg font-black text-white leading-none">
                {player.score}
              </div>
              <div className="text-[8px] text-slate-600 tracking-wider font-bold">
                PTS
              </div>
            </div>
          </div>
        ))}

        {stats.length === 0 && (
          <div className="text-center py-10 opacity-20 text-xs tracking-widest">
            NO OPERATIVES
          </div>
        )}
      </div>
    </div>
  );
}
