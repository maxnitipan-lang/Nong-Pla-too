// Dark bar at the top of the kiosk: name, online status, light/dark switch, home button.
import { useTheme } from "@/contexts/ThemeContext";
import { Home, Moon, Sun } from "lucide-react";

export function KioskHeader({ online, onHome }: { online: boolean; onHome: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const nextMode = theme === "dark" ? "สว่าง" : "มืด";
  return (
    <header className="kiosk-header flex items-center justify-between rounded-[24px] bg-[var(--ink)] px-5 py-4 text-white shadow-[0_16px_40px_rgba(16,41,58,0.18)] sm:px-7">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#3c8f8d] font-black">P</div>
        <div>
          <p className="font-display text-lg font-black">Nong Platoo Ontour</p>
          <p className="text-[10px] font-bold text-white/60">น้องปลาทู · ผู้ช่วยประชาสัมพันธ์อัจฉริยะ</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!online && (
          <span className="flex items-center gap-1.5 rounded-full bg-[#fff3ed] px-3 py-2 text-[10px] font-black text-[#b85e46]">
            ออฟไลน์ · ข้อมูลล่าสุด
          </span>
        )}
        <span className="hidden items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-[10px] font-black sm:flex">
          <span className="h-2 w-2 rounded-full bg-[#78d3a2]" /> พร้อมให้บริการ
        </span>
        {toggleTheme && (
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-10 items-center gap-2 rounded-full bg-white/10 px-3 text-xs font-black transition-colors hover:bg-white/20"
            aria-label={`สลับเป็นโหมด${nextMode}`}
            title={`สลับเป็นโหมด${nextMode}`}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            <span className="hidden sm:inline">โหมด{nextMode}</span>
          </button>
        )}
        <button
          type="button"
          onClick={onHome}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"
          aria-label="หน้าแรก"
        >
          <Home size={17} />
        </button>
      </div>
    </header>
  );
}
