import { useState, useEffect, useRef } from "react";
import { Chess, Square } from "chess.js";
import { MoveLog, Team } from "@/app/types";

const TOTAL_DURATION = 8000;
const SLOW_MO_DURATION = 1500;

// Helper: Find King
function findKing(game: Chess, color: Team): Square | undefined {
  const board = game.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.type === "k" && piece.color === color) {
        return piece.square;
      }
    }
  }
  return undefined;
}

export function useCinematicReplay(history: MoveLog[]) {
  const [replayFen, setReplayFen] = useState("start");
  const [isImpactFrame, setIsImpactFrame] = useState(false);

  // We use a ref to prevent closure staleness issues with the timer
  const latestFenRef = useRef("start");

  useEffect(() => {
    if (history.length === 0) return;

    // Reset to start
    const startFen = history[0].fen || "start";
    setReplayFen(startFen);
    latestFenRef.current = startFen;
    setIsImpactFrame(false);

    const n = history.length;
    // Dynamic Timing
    const fastDuration = Math.max(1000, TOTAL_DURATION - SLOW_MO_DURATION);
    const fastDelay = Math.max(50, n > 3 ? fastDuration / (n - 3) : 500);
    const slowDelay = 600;

    let timer: NodeJS.Timeout;
    let currentStep = 0;

    const playNextMove = () => {
      if (currentStep >= n) return;

      const moveLog = history[currentStep];
      const isSlowMo = currentStep >= n - 3;
      const isFinalFrame = currentStep === n - 1;

      // --- FINAL FRAME (REGICIDE) LOGIC ---
      if (moveLog.captured === "k" || moveLog.move === "REGICIDE") {
        try {
          // 1. Load the state BEFORE the kill
          const game = new Chess(moveLog.fen);

          // 2. Identify Actors
          const killerTeam = moveLog.team;
          const victimTeam = killerTeam === "w" ? "b" : "w";
          const victimKingPos = findKing(game, victimTeam);

          if (victimKingPos) {
            // 3. Find the Killer Piece
            // We need ANY piece of the killer's team that attacks the King's square.
            // To bypass "Illegal Move" restrictions (pins/checks), we:
            // A. Remove Killer's King (so he isn't in check)
            // B. Swap Victim King for a Queen (so she is a valid capture target)

            const killerKingPos = findKing(game, killerTeam);
            let killerKingPiece;
            if (killerKingPos) killerKingPiece = game.remove(killerKingPos); // Remove own King

            game.remove(victimKingPos); // Remove victim King
            game.put({ type: "q", color: victimTeam }, victimKingPos); // Place Dummy

            // Find the move
            const moves = game.moves({ verbose: true });
            const killMove = moves.find((m) => m.to === victimKingPos);

            // Restore Board for execution
            game.remove(victimKingPos); // Remove Dummy
            game.put({ type: "k", color: victimTeam }, victimKingPos); // Put King back
            // Note: We DO NOT put the Killer's King back yet, to ensure the move is "legal" for the engine to execute geometry

            if (killMove) {
              // EXECUTE MURDER
              const killerPiece = game.remove(killMove.from);
              game.remove(victimKingPos); // Bye bye King

              if (killerPiece) {
                if (killMove.promotion) killerPiece.type = "q"; // Auto-promote to Queen for visual flair
                game.put(killerPiece, victimKingPos); // Place killer on throne
              }
            } else {
              // Fallback: If we can't find a legal attack line (very rare), just delete the King
              game.remove(victimKingPos);
            }

            // Now put the Killer's King back (if he wasn't the one attacking!)
            // If the King *was* the attacker (killMove.piece === 'k'), he is already moved above.
            if (killerKingPiece && killerKingPos) {
              // Only put back if square is empty (meaning the King didn't move away from it)
              if (!game.get(killerKingPos)) {
                game.put(killerKingPiece, killerKingPos);
              }
            }

            setReplayFen(game.fen());
            latestFenRef.current = game.fen();
          } else {
            // King already gone? Just show state.
            setReplayFen(moveLog.fen);
          }
        } catch (e) {
          setReplayFen(moveLog.fen);
        }

        setIsImpactFrame(true);
      } else {
        // --- STANDARD FRAME ---
        setIsImpactFrame(false);
        if (moveLog.fen) {
          setReplayFen(moveLog.fen);
          latestFenRef.current = moveLog.fen;
        }
      }

      // Schedule next
      currentStep++;
      const nextDelay = isSlowMo ? slowDelay : fastDelay;

      // Stop loop after final frame to freeze the state
      if (!isFinalFrame) {
        timer = setTimeout(playNextMove, nextDelay);
      }
    };

    // Start
    timer = setTimeout(playNextMove, 1000);

    return () => clearTimeout(timer);
  }, [history]);

  return { replayFen, isImpactFrame };
}
