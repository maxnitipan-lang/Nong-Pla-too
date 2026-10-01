import { Building2, ChevronRight, ExternalLink, LayoutDashboard, LogOut, MapPinned, Menu, Newspaper, PanelLeftClose, PanelLeftOpen, Settings2 } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

export type AdminSection = "dashboard" | "buildings" | "news" | "import";

export function DashboardWithCollapsibleSidebar({ activeSection, onSectionChange, buildingCount, newsCount, userName, onLogout }: { activeSection: AdminSection; onSectionChange: (section: AdminSection) => void; buildingCount: number; newsCount: number; userName?: string | null; onLogout: () => void }) {
  const [open, setOpen] = useState(true);
  const options = [
    { id: "dashboard" as const, title: "ภาพรวมระบบ", icon: LayoutDashboard },
    { id: "buildings" as const, title: "อาคารและตำแหน่ง", icon: Building2, count: buildingCount },
    { id: "news" as const, title: "ข่าวสารวิทยาลัย", icon: Newspaper, count: newsCount },
    { id: "import" as const, title: "นำเข้า My Maps", icon: MapPinned },
  ];

  return <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white p-3 shadow-sm transition-all duration-300 ease-out md:flex ${open ? "w-64" : "w-[76px]"}`}>
    <div className="mb-6 border-b border-slate-200 pb-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl p-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-content-center rounded-xl bg-gradient-to-br from-[#123b52] to-[#3c8f8d] text-sm font-black text-white shadow-sm">PL</div>
          {open && <div className="min-w-0"><p className="truncate text-sm font-black text-slate-900">PLato Admin</p><p className="truncate text-[10px] font-medium text-slate-500">{userName ?? "ผู้ดูแลระบบ"}</p></div>}
        </div>
        {open && <MapPinned className="h-4 w-4 shrink-0 text-[#398e89]" />}
      </div>
    </div>

    {open && <p className="px-3 pb-2 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">จัดการเว็บไซต์</p>}
    <nav className="space-y-1">
      {options.map(({ id, title, icon: Icon, count }) => {
        const selected = activeSection === id;
        return <button key={id} type="button" onClick={() => onSectionChange(id)} className={`relative flex h-11 w-full items-center rounded-xl transition-all duration-200 ${selected ? "bg-[#e8f3f1] text-[#1d716e] shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>
          <span className="grid h-full w-12 shrink-0 place-content-center"><Icon className="h-[17px] w-[17px]" /></span>
          {open && <span className="truncate text-left text-xs font-extrabold">{title}</span>}
          {open && count !== undefined && <span className={`absolute right-3 rounded-full px-2 py-0.5 text-[10px] font-black ${selected ? "bg-[#398e89] text-white" : "bg-slate-100 text-slate-500"}`}>{count}</span>}
        </button>;
      })}
    </nav>

    <div className="mt-8 border-t border-slate-200 pt-4">
      {open && <p className="px-3 pb-2 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">ทางลัด</p>}
      <Link href="/" className="flex h-11 items-center rounded-xl text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900">
        <span className="grid h-full w-12 shrink-0 place-content-center"><ExternalLink className="h-[17px] w-[17px]" /></span>
        {open && <span className="text-xs font-extrabold">ดูหน้า Nong Platoo Ontour</span>}
      </Link>
      <button type="button" onClick={() => onSectionChange("dashboard")} className="flex h-11 w-full items-center rounded-xl text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900">
        <span className="grid h-full w-12 shrink-0 place-content-center"><Settings2 className="h-[17px] w-[17px]" /></span>
        {open && <span className="text-xs font-extrabold">ตั้งค่าเนื้อหา</span>}
      </button>
    </div>

    <div className="mt-auto space-y-1">
      <button type="button" onClick={onLogout} className="flex h-11 w-full items-center rounded-xl text-slate-500 transition-colors hover:bg-[#fff1eb] hover:text-[#c46242]">
        <span className="grid h-full w-12 shrink-0 place-content-center"><LogOut className="h-[17px] w-[17px]" /></span>
        {open && <span className="text-xs font-extrabold">ออกจากระบบ</span>}
      </button>
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex h-11 w-full items-center rounded-xl border-t border-slate-200 pt-1 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900" aria-label={open ? "ย่อเมนู" : "ขยายเมนู"}>
        <span className="grid h-full w-12 shrink-0 place-content-center">{open ? <PanelLeftClose className="h-[17px] w-[17px]" /> : <PanelLeftOpen className="h-[17px] w-[17px]" />}</span>
        {open && <><span className="text-xs font-extrabold">ย่อเมนู</span><ChevronRight className="ml-auto mr-3 h-4 w-4 rotate-180" /></>}
      </button>
    </div>
  </aside>;
}

export function AdminMobileBar({ activeSection, onSectionChange, onLogout }: { activeSection: AdminSection; onSectionChange: (section: AdminSection) => void; onLogout: () => void }) {
  return <div className="sticky top-0 z-40 flex items-center gap-2 border-b border-slate-200 bg-white/95 p-3 backdrop-blur md:hidden">
    <Menu className="ml-1 h-5 w-5 text-[#398e89]" />
    <select value={activeSection} onChange={(event) => onSectionChange(event.target.value as AdminSection)} className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700">
      <option value="dashboard">ภาพรวมระบบ</option><option value="buildings">อาคารและตำแหน่ง</option><option value="news">ข่าวสารวิทยาลัย</option><option value="import">นำเข้า My Maps</option>
    </select>
    <button type="button" onClick={onLogout} className="rounded-xl bg-slate-900 px-3 py-2.5 text-[11px] font-extrabold text-white">ออก</button>
  </div>;
}
