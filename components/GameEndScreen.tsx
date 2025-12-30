"use client";

import { useState, useEffect } from "react";
import { GameStats, PlayerStat, Team } from "@/app/types";

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
  onRematch,
}: {
  stats: GameStats;
  myTeam: Team | null;
  onRematch: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(10); // 10s Cooldown
  const [canRematch, setCanRematch] = useState(false);

  // Cooldown Timer
  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanRematch(true);
    }
  }, [timeLeft]);

  const isWin = stats.winner === myTeam;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in font-mono">
      <div className="glass-panel w-full max-w-6xl max-h-[90vh] overflow-y-auto m-4 rounded-2xl shadow-2xl border border-white/10 relative flex flex-col">
        {/* HEADER */}
        <div
          className={`p-8 text-center border-b ${
            stats.winner === "w"
              ? "border-white/10 bg-white/5"
              : "border-red-900/30 bg-red-900/10"
          }`}
        >
          <h1
            className={`text-6xl md:text-8xl font-black tracking-tighter mb-2 ${
              stats.winner === "w"
                ? "text-white drop-shadow-[0_0_25px_rgba(255,255,255,0.4)]"
                : "text-red-600 drop-shadow-[0_0_25px_rgba(220,38,38,0.5)]"
            }`}
          >
            {stats.winner === "w" ? "WHITE VICTORY" : "BLACK VICTORY"}
          </h1>
          <p className="text-slate-400 tracking-[0.5em] text-sm uppercase">
            Debrief // Game Complete
          </p>
        </div>

        {/* STATS GRID */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/10">
          {/* WHITE TEAM COLUMN */}
          <TeamColumn
            teamName="WHITE TEAM"
            stats={stats.whiteStats}
            totalScore={stats.totalWhiteScore}
            isWinner={stats.winner === "w"}
            colorClass="text-white"
            bgClass="bg-slate-200"
          />

          {/* BLACK TEAM COLUMN */}
          <TeamColumn
            teamName="BLACK TEAM"
            stats={stats.blackStats}
            totalScore={stats.totalBlackScore}
            isWinner={stats.winner === "b"}
            colorClass="text-red-500"
            bgClass="bg-red-600"
          />
        </div>

        {/* FOOTER ACTION */}
        <div className="p-6 border-t border-white/10 bg-black/40 flex justify-center">
          <button
            onClick={onRematch}
            disabled={!canRematch}
            className={`
              relative overflow-hidden group px-10 py-4 rounded-lg font-bold text-lg tracking-widest transition-all
              ${
                canRematch
                  ? "bg-emerald-600 text-white hover:bg-emerald-500 hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.4)]"
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
            {canRematch ? "REMATCH" : `READY IN (${timeLeft})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// Sub-component for a Team's Stat List
function TeamColumn({
  teamName,
  stats,
  totalScore,
  isWinner,
  colorClass,
  bgClass,
}: any) {
  return (
    <div className={`p-6 flex flex-col h-full ${isWinner ? "bg-white/5" : ""}`}>
      <div className="flex justify-between items-end mb-6 border-b border-white/10 pb-2">
        <h2 className={`text-2xl font-black tracking-tight ${colorClass}`}>
          {teamName}
        </h2>
        <span className="text-slate-500 text-xs font-bold">
          TOTAL SCORE: <span className="text-white text-lg">{totalScore}</span>
        </span>
      </div>

      <div className="space-y-3 flex-1">
        {stats.map((player: PlayerStat, idx: number) => (
          <div
            key={player.username}
            className="relative p-4 rounded bg-slate-900/50 border border-white/5 flex items-center gap-4 animate-fade-in"
            style={{ animationDelay: `${idx * 100}ms` }}
          >
            {/* Rank */}
            <div
              className={`text-2xl font-black opacity-30 w-8 text-center ${colorClass}`}
            >
              {player.rank}
            </div>

            {/* Player Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${bgClass}`}></span>
                <span className="font-bold text-slate-200 truncate">
                  {player.username}
                </span>
                {/* Badges */}
                {player.badges.map((b) => (
                  <span
                    key={b}
                    className={`
                            text-[8px] px-1.5 py-0.5 rounded font-black tracking-wider border
                            ${
                              b === "KINGSLAYER"
                                ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/50"
                                : b === "MVP"
                                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50"
                                : "bg-slate-700 text-slate-400 border-slate-600"
                            }
                        `}
                  >
                    {b}
                  </span>
                ))}
              </div>

              {/* Kill Feed */}
              <div className="h-6 flex items-center overflow-hidden gap-1 opacity-80 text-lg leading-none text-slate-400">
                {player.kills.length === 0 && (
                  <span className="text-[10px] opacity-30 italic">
                    NO CONFIRMED KILLS
                  </span>
                )}
                {player.kills.slice(0, 12).map((k, i) => (
                  <span
                    key={i}
                    title={k}
                    className="hover:text-white transition-colors cursor-help"
                  >
                    {PIECE_ICONS[k] || k}
                  </span>
                ))}
                {player.kills.length > 12 && (
                  <span className="text-xs">+{player.kills.length - 12}</span>
                )}
              </div>
            </div>

            {/* Score */}
            <div className="text-right">
              <div className="text-2xl font-black text-white">
                {player.score}
              </div>
              <div className="text-[10px] text-slate-500 tracking-wider">
                PTS
              </div>
            </div>
          </div>
        ))}

        {stats.length === 0 && (
          <div className="text-center py-10 opacity-30 italic">NO PLAYERS</div>
        )}
      </div>
    </div>
  );
}
