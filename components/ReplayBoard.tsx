"use client";

import { Chessboard } from "react-chessboard";
import { useCinematicReplay } from "@/hooks/useCinematicReplay";
import { MoveLog } from "@/app/types";

export default function ReplayBoard({ history }: { history: MoveLog[] }) {
  const { replayFen, isImpactFrame } = useCinematicReplay(history);

  return (
    <div className="w-full h-full flex items-center justify-center relative overflow-hidden bg-black/40">
      {/* IMPACT FLASH */}
      {isImpactFrame && (
        <div className="absolute inset-0 bg-red-500/20 z-50 animate-flash pointer-events-none"></div>
      )}

      {/* BOARD CONTAINER */}
      <div
        className={`aspect-square h-[90%] rounded shadow-2xl transition-transform duration-100 ${
          isImpactFrame ? "animate-hard-shake" : ""
        }`}
      >
        <Chessboard
          position={replayFen}
          arePiecesDraggable={false}
          animationDuration={100} // Fast animations for replay
          customDarkSquareStyle={{ backgroundColor: "#1e293b" }}
          customLightSquareStyle={{ backgroundColor: "#334155" }}
        />
      </div>

      {/* REPLAY LABEL */}
      <div className="absolute top-4 left-4 text-xs font-bold text-red-500 tracking-widest animate-pulse bg-black/50 px-2 py-1 rounded">
        ● KILLCAM
      </div>

      <style jsx>{`
        @keyframes hardShake {
          0% {
            transform: translate(1px, 1px) rotate(0deg);
          }
          10% {
            transform: translate(-3px, -2px) rotate(-1deg);
          }
          20% {
            transform: translate(-3px, 0px) rotate(1deg);
          }
          30% {
            transform: translate(3px, 2px) rotate(0deg);
          }
          40% {
            transform: translate(1px, -1px) rotate(1deg);
          }
          50% {
            transform: translate(-1px, 2px) rotate(-1deg);
          }
          60% {
            transform: translate(-3px, 1px) rotate(0deg);
          }
          70% {
            transform: translate(3px, 1px) rotate(-1deg);
          }
          80% {
            transform: translate(-1px, -1px) rotate(1deg);
          }
          90% {
            transform: translate(1px, 2px) rotate(0deg);
          }
          100% {
            transform: translate(1px, -2px) rotate(-1deg);
          }
        }
        .animate-hard-shake {
          animation: hardShake 0.5s;
        }
        @keyframes flash {
          0% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }
        .animate-flash {
          animation: flash 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
