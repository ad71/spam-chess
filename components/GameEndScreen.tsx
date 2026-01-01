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
          <div
            className={`
                flex-1 flex flex-col justify-center items-center text-center glass-panel rounded-2xl p-8 border-l-4 transition-all duration-500
                ${
                  stats.winner === "w"
                    ? "border-white bg-white/5"
                    : "border-red-700 bg-red-950/20"
                }
            `}
          >
            <div
              className={`mb-6 font-bold tracking-[0.5em] text-xs animate-pulse ${
                stats.winner === "w" ? "text-emerald-400" : "text-red-500"
              }`}
            >
              DEBRIEF // GAME OVER
            </div>

            <h1
              className={`
                    text-6xl md:text-8xl font-black leading-none tracking-tighter mb-4
                    ${
                      stats.winner === "w"
                        ? "text-white drop-shadow-[0_0_45px_rgba(255,255,255,0.6)]"
                        : "text-red-700 drop-shadow-[0_0_35px_rgba(220,38,38,0.8)]"
                    }
                `}
            >
              {stats.winner === "w" ? "WHITE" : "BLACK"}
              <span
                className={`block text-4xl md:text-5xl mt-2 ${
                  stats.winner === "w"
                    ? "text-slate-200"
                    : "text-red-900 drop-shadow-none"
                }`}
              >
                VICTORY
              </span>
            </h1>

            {/* Glowing Separator */}
            <div
              className={`h-1 w-24 rounded-full mb-10 mt-4 ${
                stats.winner === "w"
                  ? "bg-white shadow-[0_0_15px_white]"
                  : "bg-red-800 shadow-[0_0_15px_rgba(153,27,27,0.8)]"
              }`}
            ></div>

            {/* Rematch Button */}
            <button
              onClick={onRematch}
              disabled={!canRematch}
              className={`
                    w-full max-w-md relative overflow-hidden group px-8 py-6 rounded-lg font-bold text-xl tracking-widest transition-all
                    ${
                      canRematch
                        ? "bg-emerald-600 text-white hover:bg-emerald-500 hover:scale-[1.02] shadow-[0_0_30px_rgba(16,185,129,0.4)]"
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
              <span className="relative z-10 flex justify-center items-center w-full gap-3">
                <span>{canRematch ? "REMATCH" : "READY IN "}</span>
                <span className="font-mono">
                  {canRematch ? "↻" : `00:0${timeLeft}`}
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
      className={`p-8 flex flex-col h-full ${
        isWinner ? "bg-emerald-900/5" : "bg-black/20"
      }`}
    >
      {/* HEADER */}
      <div className="flex justify-between items-end mb-8 border-b border-white/10 pb-6">
        <h2
          className={`text-4xl font-black tracking-tight ${colorClass} opacity-90`}
        >
          {teamName}
        </h2>
        <span className="text-slate-500 text-xs font-bold tracking-widest bg-slate-900/80 px-4 py-2 rounded border border-white/5">
          TOTAL SCORE:{" "}
          <span className="text-white text-2xl ml-3">{totalScore}</span>
        </span>
      </div>

      {/* PLAYER ROWS */}
      <div className="space-y-4 flex-1">
        {stats.map((player: PlayerStat, idx: number) => (
          <div
            key={player.username}
            className="group relative p-5 rounded-xl bg-slate-900/40 border border-white/5 hover:border-white/20 hover:bg-slate-800/40 transition-all flex items-center gap-5 animate-fade-in"
            style={{ animationDelay: `${idx * 50}ms` }}
          >
            {/* Rank */}
            <div
              className={`text-4xl font-black opacity-30 w-12 text-center ${colorClass}`}
            >
              {player.rank}
            </div>

            {/* Player Info */}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
              <div className="flex items-center gap-3">
                <span
                  className={`w-3 h-3 rounded-full ${bgClass} shadow-[0_0_8px_currentColor]`}
                ></span>
                <span className="font-bold text-slate-200 text-2xl truncate tracking-tight">
                  {player.username}
                </span>

                {/* Badges */}
                <div className="flex gap-2 ml-3">
                  {player.badges.map((b) => (
                    <span
                      key={b}
                      className={`
                                text-[10px] px-2 py-1 rounded font-black tracking-wider border uppercase
                                ${
                                  b === "KINGSLAYER"
                                    ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                                    : b === "MVP"
                                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                    : "bg-slate-800 text-slate-400 border-slate-700"
                                }
                            `}
                    >
                      {b}
                    </span>
                  ))}
                </div>
              </div>

              {/* Kill Feed */}
              <div className="h-8 flex items-center overflow-hidden gap-1 opacity-70 text-xl text-slate-400">
                {player.kills.length === 0 && (
                  <span className="text-xs opacity-40 italic tracking-wide">
                    NO CONFIRMED KILLS
                  </span>
                )}
                {player.kills.slice(0, 12).map((k, i) => (
                  <span
                    key={i}
                    title={k}
                    className="hover:text-white transition-colors cursor-help -ml-1 first:ml-0 drop-shadow-md transform hover:scale-125 duration-150"
                  >
                    {PIECE_ICONS[k] || k}
                  </span>
                ))}
                {player.kills.length > 12 && (
                  <span className="text-xs font-bold text-slate-500 ml-2">
                    +{player.kills.length - 12} MORE
                  </span>
                )}
              </div>
            </div>

            {/* Score */}
            <div className="text-right min-w-[100px]">
              <div className="text-5xl font-black text-white leading-none mb-1">
                {player.score}
              </div>
              <div className="text-xs text-slate-500 tracking-[0.2em] font-bold uppercase">
                Points
              </div>
            </div>
          </div>
        ))}

        {stats.length === 0 && (
          <div className="text-center py-20 opacity-20 text-sm tracking-[0.2em] font-bold">
            NO PLAYERS
          </div>
        )}
      </div>
    </div>
  );
}
