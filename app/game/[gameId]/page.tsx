"use client";

import { useState, useEffect, use, useRef } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import Pusher from "pusher-js";
import { Team, GameInfo, Player, MoveLog } from "@/app/types";
import { useRouter } from "next/navigation";

const CLIENT_COOLDOWN_MS = 250;

// Material Values
const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

function getMaterialBalance(fen: string) {
  const boardPart = fen.split(" ")[0];
  let white = 0;
  let black = 0;

  for (const char of boardPart) {
    if (PIECE_VALUES[char.toLowerCase()]) {
      const val = PIECE_VALUES[char.toLowerCase()];
      if (char === char.toUpperCase()) white += val;
      else black += val;
    }
  }
  return { white, black };
}

export default function GamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = use(params);
  const router = useRouter();

  // --- Game Data ---
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState("start");
  const [serverFen, setServerFen] = useState("start");
  const [players, setPlayers] = useState<Player[]>([]);
  const [winner, setWinner] = useState<Team | null>(null);

  const [moveHistory, setMoveHistory] = useState<MoveLog[]>([]);
  const [materialHistory, setMaterialHistory] = useState<
    { w: number; b: number }[]
  >([{ w: 39, b: 39 }]);

  // --- Loading/Error ---
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Local Player ---
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [myUsername, setMyUsername] = useState("");
  const [tempUsername, setTempUsername] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  // --- UI State ---
  const [moveInput, setMoveInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [isCoolingDown, setIsCoolingDown] = useState(false);

  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [moveHistory]);

  // 1. Initial Fetch
  useEffect(() => {
    const fetchGameState = async () => {
      try {
        const res = await fetch(`/api/game/${gameId}/state`);
        if (!res.ok)
          throw new Error(res.status === 404 ? "Game not found" : "Error");

        const data: GameInfo = await res.json();
        const newGame = new Chess(data.fen);
        setGame(newGame);
        setFen(data.fen);
        setServerFen(data.fen);
        setPlayers(data.players || []);

        const mat = getMaterialBalance(data.fen);
        setMaterialHistory([
          { w: 39, b: 39 },
          { w: mat.white, b: mat.black },
        ]);

        if (data.status === "finished" && data.winner) {
          setWinner(data.winner as Team);
        }
        setLoading(false);
      } catch (err) {
        console.error(err);
        setError("Could not load game.");
        setLoading(false);
      }
    };
    fetchGameState();
  }, [gameId]);

  // 2. Pusher Subscription
  useEffect(() => {
    if (loading || error) return;

    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });

    const channelName = `game-${gameId}`;
    const channel = pusher.subscribe(channelName);

    channel.bind(
      "update-board",
      (data: {
        fen: string;
        lastMove: string;
        lastMover: string;
        team: Team;
      }) => {
        setServerFen(data.fen);
        const newGame = new Chess(data.fen);
        setGame(newGame);
        setFen(data.fen);

        setMoveHistory((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).substr(2, 9),
            move: data.lastMove,
            username: data.lastMover,
            team: data.team,
            timestamp: Date.now(),
          },
        ]);

        const mat = getMaterialBalance(data.fen);
        setMaterialHistory((prev) => [...prev, { w: mat.white, b: mat.black }]);
      }
    );

    channel.bind("player-joined", (newPlayer: Player) => {
      setPlayers((prev) => [...prev, newPlayer]);
    });

    channel.bind("game-over", (data: { winner: Team; lastMover: string }) => {
      setWinner(data.winner);
    });

    channel.bind("game-reset", (data: { fen: string }) => {
      setWinner(null);
      setFen(data.fen);
      setServerFen(data.fen);
      setGame(new Chess(data.fen));
      setMoveHistory([]);
      setMaterialHistory([{ w: 39, b: 39 }]);
    });

    return () => {
      pusher.unsubscribe(channelName);
    };
  }, [gameId, loading, error]);

  // --- Handlers ---

  const handleJoin = async (selectedTeam: Team) => {
    if (!tempUsername.trim()) {
      alert("Enter callsign.");
      return;
    }
    setIsJoining(true);
    try {
      const res = await fetch("/api/game/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId,
          username: tempUsername,
          team: selectedTeam,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message);
        setIsJoining(false);
        return;
      }
      setMyUsername(data.player.username);
      setMyTeam(data.player.team);
      setIsJoined(true);
    } catch (e) {
      setIsJoining(false);
    }
  };

  const handleMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCoolingDown || !moveInput.trim() || !myTeam || !myUsername || winner)
      return;

    const moveCommand = moveInput.trim();

    // Optimistic Update
    const gameCopy = new Chess(fen);
    const fenParts = gameCopy.fen().split(" ");
    fenParts[1] = myTeam;
    const forcedGame = new Chess(fenParts.join(" "));

    let optimisticSuccess = false;
    try {
      if (forcedGame.move(moveCommand)) {
        setGame(forcedGame);
        setFen(forcedGame.fen());
        setMoveInput("");
        optimisticSuccess = true;
      }
    } catch (e) {
      return;
    }

    if (!optimisticSuccess) return;

    setIsCoolingDown(true);
    setTimeout(() => {
      setIsCoolingDown(false);
      setTimeout(() => inputRef.current?.focus(), 10);
    }, CLIENT_COOLDOWN_MS);

    try {
      const res = await fetch("/api/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          move: moveCommand,
          team: myTeam,
          username: myUsername,
          gameId,
        }),
      });

      if (!res.ok) {
        const safeGame = new Chess(serverFen);
        setGame(safeGame);
        setFen(serverFen);
      }
    } catch (err) {
      const safeGame = new Chess(serverFen);
      setGame(safeGame);
      setFen(serverFen);
    }
  };

  const handleRematch = async () => {
    await fetch("/api/game/rematch", {
      method: "POST",
      body: JSON.stringify({ gameId }),
    });
  };

  const copyInvite = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- Graph Component ---
  const MaterialGraph = () => {
    const dataPoints = materialHistory;
    if (dataPoints.length < 1) return null;

    const points = dataPoints.map((pt, index) => {
      const total = pt.w + pt.b;
      if (total === 0) return [index, 50];

      const whiteRatio = pt.w / total;

      // FIXED LOGIC:
      // y=0 is Top (SVG origin).
      // We want White (Top) to grow down as ratio increases.
      // So y coord of line = ratio * 100.
      // Example: Ratio 0.5 -> y=50 (Middle).
      // Example: Ratio 1.0 (All White) -> y=100 (Bottom). White fills whole box.
      // Wait, standard fill draws from 0,0.
      // Path M 0,0 ... L 100,0 closes at top.
      // So this shape is the TOP shape (White).
      // So if White has 100%, we want the shape to go to y=100.
      const y = whiteRatio * 100;

      const x = (index / (dataPoints.length - 1 || 1)) * 100;
      return [x, y];
    });

    const pathD = `
        M 0,0 
        ${points.map((p) => `L ${p[0]},${p[1]}`).join(" ")} 
        L 100,0 Z
    `;

    const current = materialHistory[materialHistory.length - 1];

    return (
      <div className="relative aspect-square w-full bg-[#111] border border-slate-800 overflow-hidden group rounded shadow-inner">
        {/* Center Line (Equilibrium) */}
        <div className="absolute top-1/2 left-0 right-0 h-px bg-white/20 z-0 border-t border-dashed border-white/20"></div>

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full z-10"
        >
          {/* White Advantage Area (Solid White) */}
          <path d={pathD} fill="#ffffff" />

          {/* The Frontier Line */}
          <path
            d={`M 0,${points[0][1]} ${points
              .map((p) => `L ${p[0]},${p[1]}`)
              .join(" ")}`}
            fill="none"
            stroke="#111"
            strokeWidth="0.5"
          />
        </svg>

        {/* Stats Overlay */}
        <div className="absolute bottom-2 left-2 flex flex-col font-mono text-[10px] font-bold z-20">
          <div className="bg-white text-black px-2 py-1 rounded-sm mb-1 shadow-lg w-fit border border-black">
            W: {current.w}
          </div>
          <div className="bg-black text-white border border-white/50 px-2 py-1 rounded-sm shadow-lg w-fit">
            B: {current.b}
          </div>
        </div>

        {/* Grid overlay for tech feel */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.1)_1px,transparent_1px)] bg-size-[20px_20px] pointer-events-none mix-blend-overlay"></div>
      </div>
    );
  };

  // --- RENDER ---

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen text-emerald-500 font-mono tracking-widest animate-pulse">
        INITIALIZING UPLINK...
      </div>
    );
  if (error)
    return (
      <div className="flex items-center justify-center min-h-screen text-red-500 font-mono text-xl">
        CONNECTION LOST
      </div>
    );

  const whitePlayers = players.filter((p) => p.team === "w");
  const blackPlayers = players.filter((p) => p.team === "b");

  if (!isJoined) {
    return (
      <>
        <div className="scanline-overlay"></div>
        <div className="min-h-screen p-4 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="glass-panel p-8 rounded-2xl w-full max-w-5xl shadow-2xl relative z-10 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-center mb-10 border-b border-slate-700 pb-6 gap-4">
              <div className="text-center md:text-left">
                <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-1">
                  SPAM<span className="text-emerald-500">CHESS</span>
                </h1>
                <p className="text-slate-400 font-mono text-xs tracking-[0.2em] uppercase">
                  Operation ID: {gameId}
                </p>
              </div>
              <button
                onClick={copyInvite}
                className="bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-900/50 px-6 py-3 rounded font-mono text-sm tracking-widest transition-all hover:shadow-[0_0_15px_rgba(16,185,129,0.2)]"
              >
                {copied ? "COPIED" : "COPY UPLINK"}
              </button>
            </div>

            <div className="mb-10 max-w-md mx-auto relative group">
              <input
                type="text"
                value={tempUsername}
                onChange={(e) => setTempUsername(e.target.value)}
                className="relative z-10 w-full bg-slate-950/80 border border-slate-700 rounded-lg p-5 text-xl text-center text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono uppercase tracking-widest"
                placeholder="ENTER CALLSIGN"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-100 rounded-xl p-1 relative overflow-hidden group">
                <div className="bg-slate-200 h-full rounded-lg p-6 flex flex-col relative z-10">
                  <div className="flex justify-between items-center mb-6 border-b border-slate-300 pb-4">
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                      WHITE
                    </h2>
                    <span className="bg-slate-300 text-slate-600 text-xs px-2 py-1 rounded font-mono font-bold">
                      {whitePlayers.length} UNITS
                    </span>
                  </div>
                  <div className="flex-1 space-y-2 mb-8 min-h-[150px]">
                    {whitePlayers.map((p, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 text-slate-700 font-mono text-sm"
                      >
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                        <span className="font-bold">{p.username}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => handleJoin("w")}
                    disabled={isJoining}
                    className="w-full bg-white text-slate-900 font-black py-4 rounded shadow-lg border-b-4 border-slate-300 active:border-b-0 active:translate-y-1 transition-all hover:bg-slate-50 uppercase tracking-widest"
                  >
                    Initialize White
                  </button>
                </div>
              </div>
              <div className="bg-slate-900 rounded-xl p-1 relative overflow-hidden group border border-slate-800">
                <div className="bg-slate-950 h-full rounded-lg p-6 flex flex-col relative z-10">
                  <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
                    <h2 className="text-2xl font-black text-white tracking-tight">
                      BLACK
                    </h2>
                    <span className="bg-slate-900 border border-slate-800 text-slate-400 text-xs px-2 py-1 rounded font-mono font-bold">
                      {blackPlayers.length} UNITS
                    </span>
                  </div>
                  <div className="flex-1 space-y-2 mb-8 min-h-[150px]">
                    {blackPlayers.map((p, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 text-slate-300 font-mono text-sm"
                      >
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                        <span className="font-bold">{p.username}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => handleJoin("b")}
                    disabled={isJoining}
                    className="w-full bg-slate-800 text-white font-black py-4 rounded shadow-lg border-b-4 border-slate-700 active:border-b-0 active:translate-y-1 transition-all hover:bg-slate-700 uppercase tracking-widest"
                  >
                    Initialize Black
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // --- GAME VIEW ---
  return (
    <>
      <div className="scanline-overlay"></div>
      <div className="flex flex-col md:flex-row h-screen bg-[#020617] text-white font-mono overflow-hidden relative">
        <div
          className={`fixed inset-0 pointer-events-none transition-opacity duration-1000 z-0 ${
            myTeam === "w"
              ? "bg-[radial-gradient(circle_at_20%_50%,rgba(255,255,255,0.03),transparent_70%)]"
              : "bg-[radial-gradient(circle_at_20%_50%,rgba(255,0,0,0.03),transparent_70%)]"
          }`}
        ></div>

        {winner && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in">
            <div className="glass-panel p-12 rounded-2xl text-center shadow-2xl border-t border-white/10 max-w-2xl w-full mx-4 relative overflow-hidden">
              <div
                className={`absolute top-0 left-1/2 -translate-x-1/2 w-full h-1 bg-linear-to-r from-transparent via-${
                  winner === "w" ? "white" : "red-500"
                } to-transparent opacity-50`}
              ></div>
              <h1
                className={`text-7xl md:text-9xl font-black mb-2 tracking-tighter ${
                  winner === "w"
                    ? "text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]"
                    : "text-red-600 drop-shadow-[0_0_30px_rgba(220,38,38,0.4)]"
                }`}
              >
                {winner === "w" ? "WHITE" : "BLACK"}
              </h1>
              <h2 className="text-3xl font-bold text-slate-400 tracking-[0.5em] mb-12">
                VICTORY
              </h2>
              <button
                onClick={handleRematch}
                className="group relative inline-flex items-center justify-center px-8 py-4 font-bold text-white transition-all duration-200 bg-emerald-600 font-mono rounded-lg hover:bg-emerald-500"
              >
                INITIALIZE REMATCH <span className="text-xl ml-2">↻</span>
              </button>
            </div>
          </div>
        )}

        {/* LEFT PANEL */}
        <div className="flex-1 flex flex-col relative z-10 p-6 md:p-10 h-full">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-xl font-bold text-slate-400 tracking-tight flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                ROOM_{gameId}
              </h1>
              <p className="text-[10px] text-slate-600 font-bold tracking-widest mt-1">
                OPERATOR: {myUsername} // {myTeam === "w" ? "WHITE" : "BLACK"}{" "}
                FACTION
              </p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={copyInvite}
                className="text-xs text-slate-500 hover:text-emerald-400 border border-slate-800 hover:border-emerald-500/50 px-3 py-1 rounded transition-all"
              >
                {copied ? "COPIED" : "SHARE UPLINK"}
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center min-h-0">
            <div
              className={`aspect-square h-full max-h-full rounded-lg overflow-hidden shadow-2xl border-[3px] transition-all duration-500 ${
                myTeam === "w"
                  ? "border-slate-300 glow-white"
                  : "border-slate-800 glow-black"
              }`}
            >
              <Chessboard
                position={fen}
                boardOrientation={myTeam === "w" ? "white" : "black"}
                customDarkSquareStyle={{ backgroundColor: "#1e293b" }}
                customLightSquareStyle={{ backgroundColor: "#475569" }}
                animationDuration={200}
                arePiecesDraggable={false}
              />
            </div>
          </div>

          <div className="mt-6 w-full max-w-3xl mx-auto">
            <form onSubmit={handleMove} className="flex gap-3 relative">
              <div className="flex-1 relative group">
                <input
                  ref={inputRef}
                  type="text"
                  className={`relative z-10 w-full bg-slate-900/90 border border-slate-700 rounded-lg px-5 py-4 text-xl font-mono text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all ${
                    isCoolingDown ? "opacity-50" : ""
                  }`}
                  placeholder={`CMD > (e.g. ${myTeam === "w" ? "e4" : "e5"})`}
                  value={moveInput}
                  onChange={(e) => setMoveInput(e.target.value)}
                  autoFocus
                  disabled={!!winner || isCoolingDown}
                />
              </div>
              <button
                type="submit"
                disabled={!!winner || isCoolingDown}
                className={`relative overflow-hidden font-black rounded-lg text-lg transition-all w-32 shadow-lg ${
                  isCoolingDown
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                    : myTeam === "w"
                    ? "bg-slate-200 text-slate-900 hover:bg-white hover:scale-105 active:scale-95"
                    : "bg-red-900 text-white hover:bg-red-800 border border-red-800 hover:scale-105 active:scale-95"
                }`}
              >
                {isCoolingDown && (
                  <div
                    className="absolute inset-0 bg-black/30 origin-left"
                    style={{
                      animation: `shrinkWidth ${CLIENT_COOLDOWN_MS}ms linear forwards`,
                    }}
                  ></div>
                )}
                <span className="relative z-10">
                  {isCoolingDown ? "..." : "EXEC"}
                </span>
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT PANEL: SIDEBAR */}
        <div className="w-full md:w-96 lg:w-[450px] border-l border-slate-800 bg-slate-950/80 backdrop-blur-sm flex flex-col z-20">
          <div className="p-4 border-b border-slate-800 bg-slate-900/50">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xs font-bold text-slate-400 tracking-widest uppercase">
                Advantage Graph
              </h3>
            </div>

            <MaterialGraph />

            <div className="flex gap-2 mt-4">
              <div className="flex-1 bg-slate-100 rounded p-2 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-900">WHITE</span>
                <span className="text-xs font-bold bg-slate-300 text-slate-800 px-1.5 rounded">
                  {whitePlayers.length}
                </span>
              </div>
              <div className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-300">BLACK</span>
                <span className="text-xs font-bold bg-slate-800 text-slate-400 px-1.5 rounded">
                  {blackPlayers.length}
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-sm relative">
            {moveHistory.length === 0 && (
              <div className="text-center text-slate-600 mt-10 text-xs italic">
                Waiting for tactical input...
              </div>
            )}

            {moveHistory.map((log) => (
              <div
                key={log.id}
                className="animate-fade-in flex gap-3 items-start group hover:bg-white/5 p-1 rounded transition-colors"
              >
                <span className="text-slate-600 text-[10px] mt-0.5 min-w-[30px] font-mono">
                  {new Date(log.timestamp).toLocaleTimeString([], {
                    hour12: false,
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <div className="flex-1">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          log.team === "w"
                            ? "bg-white shadow-[0_0_5px_white]"
                            : "bg-red-500 shadow-[0_0_5px_red]"
                        }`}
                      ></span>
                      <span
                        className={`font-bold tracking-tight ${
                          log.team === "w" ? "text-slate-200" : "text-red-400"
                        }`}
                      >
                        {log.username}
                      </span>
                    </div>
                    <div className="text-emerald-400 font-black font-mono tracking-widest">
                      {log.move}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>

          <div className="p-3 border-t border-slate-800 text-[10px] text-slate-600 text-center uppercase tracking-widest">
            End to End Encrypted
          </div>
        </div>

        <style jsx>{`
          @keyframes shrinkWidth {
            from {
              width: 100%;
            }
            to {
              width: 0%;
            }
          }
        `}</style>
      </div>
    </>
  );
}
