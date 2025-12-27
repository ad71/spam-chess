"use client";

import { useState, useEffect, use } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import Pusher from "pusher-js";
import { Team, GameInfo, Player } from "@/app/types";
import { useRouter } from "next/navigation";

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
  const [players, setPlayers] = useState<Player[]>([]);

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
  const [status, setStatus] = useState("Syncing...");
  const [lastMover, setLastMover] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
        setPlayers(data.players || []);
        setLoading(false);
        setStatus("Live");
      } catch (err) {
        console.error(err);
        setError("Could not load game.");
        setLoading(false);
      }
    };

    fetchGameState();
  }, [gameId]);

  // 2. Pusher Subscription (Always active to see lobby updates)
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

      // Success
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
    if (!moveInput.trim() || !myTeam || !myUsername) return;

    const moveCommand = moveInput.trim();

    // Optimistic
    const gameCopy = new Chess(fen);
    const fenParts = gameCopy.fen().split(" ");
    fenParts[1] = myTeam;
    const forcedGame = new Chess(fenParts.join(" "));

    try {
      if (forcedGame.move(moveCommand)) {
        setGame(forcedGame);
        setFen(forcedGame.fen());
        setMoveInput("");
      }
    } catch (e) {
      /* ignore local validation */
    }

    await fetch("/api/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        move: moveCommand,
        team: myTeam,
        username: myUsername,
        gameId,
      }),
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
      <div className="text-white p-10 font-mono">Loading Battlefield...</div>
    );
  if (error)
    return <div className="text-red-500 p-10 font-mono text-xl">{error}</div>;

  // VIEW: LOBBY (If not joined)
  if (!isJoined) {
    const whitePlayers = players.filter((p) => p.team === "w");
    const blackPlayers = players.filter((p) => p.team === "b");

    return (
      <div className="min-h-screen bg-slate-950 text-white font-mono p-4 flex flex-col items-center">
        {/* Lobby Header */}
        <div className="w-full max-w-4xl flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-3xl font-bold text-emerald-500">
              LOBBY: {gameId}
            </h1>
            <p className="text-slate-500 text-sm">Choose your allegiance</p>
          </div>
          <button
            onClick={copyInvite}
            className="text-xs bg-slate-900 border border-slate-700 hover:border-emerald-500 text-slate-300 px-4 py-2 rounded transition-all"
          >
            {copied ? "LINK COPIED" : "INVITE FRIENDS"}
          </button>
        </div>

        {/* Name Input */}
        <div className="w-full max-w-md mb-8">
          <label className="block text-xs font-bold mb-2 text-slate-400 uppercase tracking-widest">
            Identity
          </label>
          <input
            type="text"
            value={tempUsername}
            onChange={(e) => setTempUsername(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded p-4 text-xl text-white focus:outline-none focus:border-emerald-500 transition-colors text-center"
            placeholder="ENTER CODENAME"
          />
        </div>

        {/* Teams Display */}
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* TEAM WHITE */}
          <div className="bg-slate-200 text-slate-900 rounded-xl p-6 flex flex-col shadow-xl">
            <h2 className="text-2xl font-bold mb-4 border-b border-slate-300 pb-2">
              TEAM WHITE
            </h2>
            <div className="flex-1 space-y-2 mb-6 min-h-[200px]">
              {whitePlayers.length === 0 && (
                <p className="opacity-50 italic">No operatives yet...</p>
              )}
              {whitePlayers.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="font-bold">{p.username}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => handleJoin("w")}
              disabled={isJoining}
              className="w-full bg-white border-2 border-slate-300 hover:border-slate-900 py-4 rounded-lg font-bold text-lg transition-all active:scale-95 disabled:opacity-50"
            >
              JOIN WHITE
            </button>
          </div>

          {/* TEAM BLACK */}
          <div className="bg-slate-900 text-slate-200 border border-slate-700 rounded-xl p-6 flex flex-col shadow-xl">
            <h2 className="text-2xl font-bold mb-4 border-b border-slate-700 pb-2">
              TEAM BLACK
            </h2>
            <div className="flex-1 space-y-2 mb-6 min-h-[200px]">
              {blackPlayers.length === 0 && (
                <p className="opacity-50 italic">No operatives yet...</p>
              )}
              {blackPlayers.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="font-bold">{p.username}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => handleJoin("b")}
              disabled={isJoining}
              className="w-full bg-slate-800 border-2 border-slate-700 hover:border-white py-4 rounded-lg font-bold text-lg transition-all active:scale-95 disabled:opacity-50"
            >
              JOIN BLACK
            </button>
          </div>
        </div>
      </div>
    );
  }

  // VIEW: GAME BOARD (If joined)
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-4 font-mono">
      {/* HEADER */}
      <div className="w-full max-w-[500px] flex justify-between items-end mb-4">
        <div>
          <h1 className="text-2xl font-bold text-emerald-500 leading-none">
            ROOM: {gameId}
          </h1>
          <p className="text-xs text-slate-500 mt-1 flex gap-2">
            <span>Online: {players.length}</span>
            <span className="text-emerald-500">• Live</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div
            className={`px-3 py-1 rounded border ${
              myTeam === "w"
                ? "border-slate-200 text-slate-200 bg-slate-800"
                : "border-slate-600 text-slate-500 bg-black"
            }`}
          >
            <span className="text-xs mr-2 opacity-50">PLAYING AS</span>
            <span className="font-bold">
              {myTeam === "w" ? "WHITE" : "BLACK"}
            </span>
          </div>
        </div>
      </div>

      <div className="w-full max-w-[500px]">
        {/* BOARD */}
        <div
          className={`relative rounded-lg overflow-hidden shadow-2xl border-4 ${
            myTeam === "w" ? "border-slate-200" : "border-slate-700"
          }`}
        >
          <Chessboard
            position={fen}
            boardOrientation={myTeam === "w" ? "white" : "black"}
            customDarkSquareStyle={{ backgroundColor: "#334155" }}
            customLightSquareStyle={{ backgroundColor: "#94a3b8" }}
            animationDuration={200}
          />

          {lastMover && (
            <div className="absolute top-2 right-2 bg-black/80 backdrop-blur text-xs px-3 py-1 rounded-full text-emerald-400 border border-emerald-900/50 z-10 shadow-lg">
              {lastMover} moved
            </div>
          )}
        </div>

        {/* INPUT AREA */}
        <form onSubmit={handleMove} className="mt-6 flex gap-2">
          <input
            type="text"
            className="flex-1 bg-slate-900 border border-slate-700 rounded px-4 py-4 text-xl font-mono text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-all"
            placeholder={`Move (e.g. ${myTeam === "w" ? "e4" : "e5"})`}
            value={moveInput}
            onChange={(e) => setMoveInput(e.target.value)}
            autoFocus
          />
          <button
            type="submit"
            className={`font-bold py-2 px-6 rounded text-xl transition-all active:scale-95 ${
              myTeam === "w"
                ? "bg-slate-200 text-slate-900 hover:bg-white"
                : "bg-slate-800 text-white hover:bg-slate-700 border border-slate-600"
            }`}
          >
            SEND
          </button>
        </form>

        <div className="mt-4 text-center">
          <p className="text-xs text-slate-500">
            Logged in as: <span className="text-white">{myUsername}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
