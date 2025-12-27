"use client";

import { useState, useEffect, use, useRef } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import Pusher from "pusher-js";
import { Team, GameInfo, Player } from "@/app/types";
import { useRouter } from "next/navigation";

// Client-side cooldown slightly longer than server to be safe
const CLIENT_COOLDOWN_MS = 250;

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

  // --- Loading/Error ---
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Local Player State ---
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [myUsername, setMyUsername] = useState("");
  const [tempUsername, setTempUsername] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  // --- UI State ---
  const [moveInput, setMoveInput] = useState("");
  const [lastMover, setLastMover] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Cooldown State
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

        if (data.status === "finished" && data.winner) {
          setWinner(data.winner);
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

    // Board Updates
    channel.bind(
      "update-board",
      (data: { fen: string; lastMove: string; lastMover: string }) => {
        setServerFen(data.fen);
        const newGame = new Chess(data.fen);
        setGame(newGame);
        setFen(data.fen);
        setLastMover(data.lastMover);
      }
    );

    // Player Joins
    channel.bind("player-joined", (newPlayer: Player) => {
      setPlayers((prev) => [...prev, newPlayer]);
    });

    // Game Over
    channel.bind("game-over", (data: { winner: Team; lastMover: string }) => {
      setWinner(data.winner);
      setLastMover(data.lastMover);
    });

    // Game Reset (Rematch)
    channel.bind("game-reset", (data: { fen: string }) => {
      setWinner(null);
      setFen(data.fen);
      setServerFen(data.fen);
      setGame(new Chess(data.fen));
      setLastMover(null);
    });

    return () => {
      pusher.unsubscribe(channelName);
    };
  }, [gameId, loading, error]);

  // --- Actions ---

  const handleJoin = async (selectedTeam: Team) => {
    if (!tempUsername.trim()) {
      alert("Enter a username first.");
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
        alert(data.message || "Failed to join");
        setIsJoining(false);
        return;
      }

      setMyUsername(data.player.username);
      setMyTeam(data.player.team);
      setIsJoined(true);
    } catch (e) {
      console.error(e);
      alert("Network error joining game");
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
        // Rollback
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

  // VIEW: LOBBY
  if (!isJoined) {
    return (
      <>
        <div className="scanline-overlay"></div>
        <div className="min-h-screen p-4 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="glass-panel p-8 rounded-2xl w-full max-w-5xl shadow-2xl relative z-10 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-10 border-b border-slate-700 pb-6 gap-4">
              <div className="text-center md:text-left">
                <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-1">
                  SPAM<span className="text-emerald-500">CHESS</span>
                </h1>
                <p className="text-slate-400 font-mono text-xs tracking-[0.2em] uppercase">
                  Game ID: {gameId}
                </p>
              </div>
              <button
                onClick={copyInvite}
                className="bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-900/50 px-6 py-3 rounded font-mono text-sm tracking-widest transition-all hover:shadow-[0_0_15px_rgba(16,185,129,0.2)]"
              >
                {copied ? "COPIED" : "COPY UPLINK"}
              </button>
            </div>

            {/* Input */}
            <div className="mb-10 max-w-md mx-auto relative group">
              <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <input
                type="text"
                value={tempUsername}
                onChange={(e) => setTempUsername(e.target.value)}
                className="relative z-10 w-full bg-slate-950/80 border border-slate-700 rounded-lg p-5 text-xl text-center text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono uppercase tracking-widest"
                placeholder="ENTER CALLSIGN"
              />
            </div>

            {/* Team Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* WHITE FACTION */}
              <div className="bg-slate-100 rounded-xl p-1 relative overflow-hidden group">
                <div className="bg-slate-200 h-full rounded-lg p-6 flex flex-col relative z-10">
                  <div className="flex justify-between items-center mb-6 border-b border-slate-300 pb-4">
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                      WHITE
                    </h2>
                    <span className="bg-slate-300 text-slate-600 text-xs px-2 py-1 rounded font-mono font-bold">
                      {whitePlayers.length} PLAYERS
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
                    {whitePlayers.length === 0 && (
                      <span className="text-slate-400 italic text-sm">
                        Waiting for units...
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => handleJoin("w")}
                    disabled={isJoining}
                    className="w-full bg-white text-slate-900 font-black py-4 rounded shadow-lg border-b-4 border-slate-300 active:border-b-0 active:translate-y-1 transition-all hover:bg-slate-50 uppercase tracking-widest"
                  >
                    Join White
                  </button>
                </div>
              </div>

              {/* BLACK FACTION */}
              <div className="bg-slate-900 rounded-xl p-1 relative overflow-hidden group border border-slate-800">
                <div className="bg-slate-950 h-full rounded-lg p-6 flex flex-col relative z-10">
                  <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
                    <h2 className="text-2xl font-black text-white tracking-tight">
                      BLACK
                    </h2>
                    <span className="bg-slate-900 border border-slate-800 text-slate-400 text-xs px-2 py-1 rounded font-mono font-bold">
                      {blackPlayers.length} PLAYERS
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
                    {blackPlayers.length === 0 && (
                      <span className="text-slate-600 italic text-sm">
                        Waiting for units...
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => handleJoin("b")}
                    disabled={isJoining}
                    className="w-full bg-slate-800 text-white font-black py-4 rounded shadow-lg border-b-4 border-slate-700 active:border-b-0 active:translate-y-1 transition-all hover:bg-slate-700 uppercase tracking-widest"
                  >
                    Join Black
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // VIEW: PLAYING
  return (
    <>
      <div className="scanline-overlay"></div>
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#020617] text-white p-4 font-mono relative overflow-hidden">
        {/* BACKGROUND GLOW */}
        <div
          className={`fixed inset-0 pointer-events-none transition-opacity duration-1000 ${
            myTeam === "w"
              ? "bg-[radial-gradient(circle_at_50%_50%,_rgba(255,255,255,0.03),_transparent_70%)]"
              : "bg-[radial-gradient(circle_at_50%_50%,_rgba(255,0,0,0.03),_transparent_70%)]"
          }`}
        ></div>

        {/* VICTORY OVERLAY */}
        {winner && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in">
            <div className="glass-panel p-12 rounded-2xl text-center shadow-2xl border-t border-white/10 max-w-2xl w-full mx-4 relative overflow-hidden">
              {/* Ambient light effect inside modal */}
              <div
                className={`absolute top-0 left-1/2 -translate-x-1/2 w-full h-1 bg-gradient-to-r from-transparent via-${
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
                DOMINATION
              </h2>

              <button
                onClick={handleRematch}
                className="group relative inline-flex items-center justify-center px-8 py-4 font-bold text-white transition-all duration-200 bg-emerald-600 font-mono rounded-lg hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-600"
              >
                <span className="absolute inset-0 w-full h-full -mt-1 rounded-lg opacity-30 bg-gradient-to-b from-transparent via-transparent to-black"></span>
                <span className="relative flex items-center gap-3">
                  INITIALIZE REMATCH <span className="text-xl">↻</span>
                </span>
              </button>
            </div>
          </div>
        )}

        {/* HEADER HUD */}
        <div className="w-full max-w-[500px] flex justify-between items-end mb-6 z-10">
          <div>
            <h1 className="text-xl font-bold text-slate-400 tracking-tight flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              ROOM_{gameId}
            </h1>
          </div>

          {/* PLAYER STATUS PILL */}
          <div className="glass-panel px-4 py-2 rounded-full flex items-center gap-4 text-xs font-bold shadow-lg">
            <div
              className={`flex items-center gap-2 ${
                myTeam === "w" ? "text-white" : "text-slate-500"
              }`}
            >
              <span className="w-2 h-2 bg-slate-200 rounded-sm"></span>
              {whitePlayers.length} UNIT(S)
            </div>
            <div className="h-3 w-px bg-slate-700"></div>
            <div
              className={`flex items-center gap-2 ${
                myTeam === "b" ? "text-red-400" : "text-slate-500"
              }`}
            >
              <span className="w-2 h-2 bg-red-900 rounded-sm"></span>
              {blackPlayers.length} UNIT(S)
            </div>
          </div>
        </div>

        {/* MAIN GAME AREA */}
        <div className="w-full max-w-[500px] z-10 relative">
          {/* BOARD CONTAINER */}
          <div
            className={`relative rounded-lg overflow-hidden shadow-2xl border-[3px] transition-all duration-500 ${
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

            {lastMover && !winner && (
              <div className="absolute top-4 right-4 bg-slate-950/90 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded font-mono text-xs font-bold shadow-lg flex items-center gap-2 animate-fade-in">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
                {lastMover} ACTED
              </div>
            )}
          </div>

          {/* INPUT HUD */}
          <form onSubmit={handleMove} className="mt-8 flex gap-3 relative">
            <div className="flex-1 relative group">
              <div className="absolute inset-0 bg-emerald-500/10 rounded-lg blur opacity-0 group-hover:opacity-100 transition-opacity"></div>
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
              className={`relative overflow-hidden font-black rounded-lg text-lg transition-all w-32 shadow-lg group
                ${
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
              <span className="relative z-10 flex items-center justify-center gap-2">
                {isCoolingDown ? "..." : "EXEC"}
              </span>
            </button>
          </form>

          {/* FOOTER */}
          <div className="mt-4 flex justify-between items-center text-[10px] text-slate-600 font-bold tracking-widest uppercase">
            <span>OPERATOR: {myUsername}</span>
            <span>
              STATUS: {status === "Game Over" ? "TERMINATED" : "ONLINE"}
            </span>
          </div>
        </div>

        {/* Inline styles for dynamic animations */}
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
