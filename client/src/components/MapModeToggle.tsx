import { useState } from "react";
import { cn } from "@/lib/utils";

export type MapMode = "2d" | "3d";

const KEY = "nongplatoo.mapMode";

/** 2D / 3D choice, remembered on this device (3D by default). */
export function useMapMode(): [MapMode, (mode: MapMode) => void] {
  const [mode, setMode] = useState<MapMode>(() => {
    try {
      return localStorage.getItem(KEY) === "2d" ? "2d" : "3d";
    } catch {
      return "3d";
    }
  });
  const set = (next: MapMode) => {
    setMode(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode / kiosk lockdown — just don't remember it */
    }
  };
  return [mode, set];
}

/** Segmented "2D | 3D" switch that sits on top of the map. */
export function MapModeToggle({ mode, onChange, className }: { mode: MapMode; onChange: (mode: MapMode) => void; className?: string }) {
  return (
    <div className={cn("absolute bottom-7 right-4 z-[1000] flex rounded-full bg-white/95 p-1 shadow-[0_6px_16px_rgba(8,44,74,0.18)] backdrop-blur", className)} role="group" aria-label="รูปแบบแผนที่">
      {(["2d", "3d"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          className={cn(
            "min-h-10 rounded-full px-4 text-xs font-black transition-colors",
            mode === m ? "bg-[var(--ink)] text-white" : "text-[#287c78] hover:bg-[#e4f4f0]",
          )}
        >
          {m === "2d" ? "2D" : "3D"}
        </button>
      ))}
    </div>
  );
}
