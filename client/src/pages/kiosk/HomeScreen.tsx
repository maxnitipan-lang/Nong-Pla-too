// Kiosk start page: น้องปลาทู with the big mic button, and the four menu tiles.
import { openVoiceAssistant } from "@/components/assistant/CampusAIWidget";
import { KIOSK_ASSETS } from "@/config/kioskAssets";
import { CAMPUS_OVERVIEW } from "@shared/campus";
import { Building2, ChevronRight, Compass, MapPin, Mic, Newspaper, Sparkles } from "lucide-react";

export type KioskScreenId = "home" | "places" | "news";

const MENU = [
  { id: "places", label: "ค้นหาสถานที่", sub: "ดูหมุดอาคารและเส้นทาง", icon: MapPin, color: "#075985" },
  { id: "news", label: "ข่าวสาร", sub: "ประกาศและกิจกรรม", icon: Newspaper, color: "#0e7490" },
  { id: "departments", label: "สาขาวิชา", sub: "ดูแผนกและกิจกรรม", icon: Building2, color: "#c28a19" },
  { id: "ask", label: "ถามด้วยเสียง", sub: "พูดคุยกับน้องปลาทู", icon: Mic, color: "#159ac5" },
] as const;

export function HomeScreen({
  buildingCount,
  onOpen,
}: {
  buildingCount: number;
  onOpen: (screen: KioskScreenId) => void;
}) {
  const choose = (id: (typeof MENU)[number]["id"]) => {
    if (id === "ask") openVoiceAssistant();
    else if (id === "news") onOpen("news");
    else onOpen("places"); // "สาขาวิชา" lives on the places screen too
  };

  return (
    <section className="grid flex-1 gap-6 py-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-stretch">
      {/* Left: the character and the mic */}
      <div className="relative overflow-hidden rounded-[30px] bg-[#dff3ef] p-6 sm:p-9">
        <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full border-[20px] border-white/60" />
        <div className="relative flex h-full flex-col justify-between">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-2 text-[10px] font-black tracking-[0.12em] text-[#287c78]">
              <Sparkles size={13} /> SMART CAMPUS ASSISTANT
            </div>
            <div className="mx-auto flex max-w-[370px] flex-col items-center text-center">
              <div className="relative flex h-52 w-52 items-center justify-center rounded-full bg-white/70 shadow-[0_18px_50px_rgba(16,41,58,0.12)]">
                <div className="absolute flex h-36 w-36 items-center justify-center rounded-[42%] bg-[var(--ink)] text-6xl shadow-inner">
                  ◉‿◉
                </div>
                <img
                  src={KIOSK_ASSETS.character.idle}
                  alt="น้องปลาทู ผู้ช่วยประชาสัมพันธ์"
                  className="relative z-10 h-44 w-44 rounded-[42%] object-cover"
                  onError={event => {
                    event.currentTarget.style.display = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={openVoiceAssistant}
                  className="absolute bottom-2 right-2 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-[#eb8b67] text-white shadow-lg ring-4 ring-white/70 transition-transform hover:scale-105 active:scale-95"
                  aria-label="แตะเพื่อพูดกับน้องปลาทู"
                >
                  <span className="absolute inset-0 animate-ping rounded-full bg-[#eb8b67] opacity-30" />
                  <Mic size={24} className="relative" />
                </button>
              </div>
              <div className="mt-5 rounded-3xl bg-white px-5 py-4 text-left shadow-sm">
                <p className="text-sm font-black leading-6 text-[var(--ink)]">
                  สวัสดีครับ ผมน้องปลาทู
                  <br />
                  แตะไมค์สีส้มแล้วพูดถามผมได้เลยครับ
                </p>
              </div>
            </div>
          </div>
          <div className="mt-7 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/70 p-4">
              <p className="text-2xl font-black text-[var(--ink)]">{buildingCount}</p>
              <p className="mt-1 text-[10px] font-bold text-[var(--muted-foreground)]">จุดสำคัญในวิทยาลัย</p>
            </div>
            <div className="rounded-2xl bg-white/70 p-4">
              <p className="text-2xl font-black text-[var(--ink)]">{CAMPUS_OVERVIEW.stats[1].value}</p>
              <p className="mt-1 text-[10px] font-bold text-[var(--muted-foreground)]">
                {CAMPUS_OVERVIEW.stats[1].label}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right: the menu */}
      <div className="rounded-[30px] bg-white p-5 shadow-[0_18px_55px_rgba(16,41,58,0.08)] sm:p-8">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black tracking-[0.16em] text-[#398e89]">WELCOME TO NONG PLATOO ONTOUR</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.05em] text-[var(--ink)] sm:text-4xl">
              เลือกเมนูที่สนใจได้เลยครับ
            </h1>
            <p className="mt-2 text-sm font-bold text-[var(--muted-foreground)]">ข้อมูลครบ จบในที่เดียว</p>
          </div>
          <span className="hidden rounded-2xl bg-[#fff3ed] px-3 py-2 text-[10px] font-black text-[#b85e46] sm:block">
            แตะง่าย
            <br />
            ไม่ต้องพิมพ์
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {MENU.map(({ id, label, sub, icon: Icon, color }) => (
            <button
              key={id}
              type="button"
              onClick={() => choose(id)}
              className="group flex min-h-[142px] items-center gap-4 rounded-[24px] p-5 text-left text-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg active:scale-[.98]"
              style={{ backgroundColor: color }}
            >
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/18">
                <Icon size={34} strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xl font-black">{label}</span>
                <span className="mt-2 block text-xs font-bold text-white/75">{sub}</span>
              </span>
              <ChevronRight size={24} className="shrink-0 opacity-70 transition-transform group-hover:translate-x-1" />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onOpen("places")}
          className="mt-5 flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[#b8ded7] text-sm font-black text-[#287c78] transition-colors hover:bg-[#eff9f6]"
        >
          <Compass size={19} /> เปิดแผนที่วิทยาลัยและดูหมุดทุกอาคาร
        </button>
      </div>
    </section>
  );
}
