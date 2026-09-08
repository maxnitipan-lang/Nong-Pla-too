import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Building2,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Newspaper,
  Settings,
  ShieldAlert,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";

export type AdminSection = "overview" | "buildings" | "news" | "users" | "settings";

const NAV: { section: AdminSection; label: string; path: string; icon: typeof Building2 }[] = [
  { section: "overview", label: "ภาพรวม", path: "/admin", icon: LayoutDashboard },
  { section: "buildings", label: "อาคาร", path: "/admin/buildings", icon: Building2 },
  { section: "news", label: "ข่าวสาร", path: "/admin/news", icon: Newspaper },
  { section: "users", label: "ผู้ใช้และสิทธิ์", path: "/admin/users", icon: Users },
  { section: "settings", label: "ตั้งค่าเว็บ", path: "/admin/settings", icon: Settings },
];

function CenteredCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] p-6">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-card p-8 text-center shadow-sm">
        {children}
      </div>
    </div>
  );
}

export function AdminShell({
  section,
  title,
  children,
}: {
  section: AdminSection;
  title: string;
  children: ReactNode;
}) {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();

  if (loading) {
    return (
      <CenteredCard>
        <p className="text-sm text-[var(--muted-foreground)]">กำลังตรวจสอบสิทธิ์…</p>
      </CenteredCard>
    );
  }

  if (!user) {
    return (
      <CenteredCard>
        <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-[var(--muted-foreground)]" />
        <h1 className="text-lg font-bold text-[var(--ink)]">ต้องเข้าสู่ระบบก่อน</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          ส่วนผู้ดูแลระบบเปิดให้เฉพาะบัญชีที่ได้รับสิทธิ์เท่านั้น
        </p>
        <button
          type="button"
          onClick={() => startLogin()}
          className="mt-6 h-11 w-full rounded-full bg-[var(--ink)] text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
        >
          เข้าสู่ระบบ
        </button>
      </CenteredCard>
    );
  }

  if (user.role !== "admin") {
    return (
      <CenteredCard>
        <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-[var(--destructive)]" />
        <h1 className="text-lg font-bold text-[var(--ink)]">ไม่มีสิทธิ์เข้าถึง</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          บัญชี <span className="font-semibold">{user.email ?? user.name}</span>{" "}
          ยังไม่ได้รับสิทธิ์ผู้ดูแลระบบ
        </p>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="mt-6 h-11 w-full rounded-full border border-[var(--border)] text-sm font-bold text-[var(--ink)]"
        >
          กลับหน้าแรก
        </button>
      </CenteredCard>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] lg:flex">
      <aside className="border-b border-[var(--border)] bg-card lg:min-h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--ink)] text-xs font-bold text-white">
            SM
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--ink)]">ผู้ดูแลระบบ</p>
            <p className="text-[11px] text-[var(--muted-foreground)]">Campus Guide</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0">
          {NAV.map((item) => {
            const active = item.section === section;
            const Icon = item.icon;
            return (
              <Link
                key={item.section}
                href={item.path}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                  active
                    ? "bg-[var(--ink)] text-white"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
                )}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden border-t border-[var(--border)] p-3 lg:block">
          <a
            href="/"
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
          >
            <ExternalLink size={14} /> เปิดหน้าเว็บจริง
          </a>
          <button
            type="button"
            onClick={logout}
            className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--destructive)] hover:bg-[var(--muted)]"
          >
            <LogOut size={14} /> ออกจากระบบ
          </button>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:px-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-[-0.03em] text-[var(--ink)]">
              {title}
            </h1>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              เข้าสู่ระบบเป็น {user.name ?? user.email}
            </p>
          </div>
          <a
            href="/"
            className="flex items-center gap-1.5 text-xs font-bold text-[#287c78] lg:hidden"
          >
            <ExternalLink size={13} /> หน้าเว็บ
          </a>
        </header>
        {children}
      </main>
    </div>
  );
}

export function DbBanner() {
  const { data } = trpc.admin.overview.useQuery(undefined, { retry: false });
  if (!data || data.databaseConfigured) return null;
  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-[var(--accent)] bg-[var(--accent)]/15 px-4 py-3 text-sm text-[var(--accent-foreground)]">
      <ShieldAlert size={18} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold">ยังไม่ได้เชื่อมต่อฐานข้อมูล</p>
        <p className="mt-0.5 text-[13px] leading-6">
          ตอนนี้แสดงข้อมูลตัวอย่างแบบอ่านอย่างเดียว การบันทึกจะยังไม่ทำงานจนกว่าจะตั้งค่า{" "}
          <code className="rounded bg-black/5 px-1">DATABASE_URL</code> แล้วรัน{" "}
          <code className="rounded bg-black/5 px-1">pnpm db:push</code>
        </p>
      </div>
    </div>
  );
}
