import { trpc } from "@/lib/trpc";
import { Building2, MapPin, Newspaper, ShieldCheck, Users } from "lucide-react";
import { Link } from "wouter";
import { AdminShell, DbBanner } from "./AdminShell";

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  href,
}: {
  icon: typeof Building2;
  label: string;
  value: string | number;
  hint?: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-[var(--border)] bg-card p-5 transition-shadow hover:shadow-[0_12px_30px_rgba(16,41,58,0.08)]"
    >
      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
        <Icon size={16} />
        <span className="text-xs font-bold uppercase tracking-[0.1em]">{label}</span>
      </div>
      <p className="mt-3 font-display text-3xl font-bold text-[var(--ink)]">{value}</p>
      {hint && <p className="mt-1 text-xs text-[var(--muted-foreground)]">{hint}</p>}
    </Link>
  );
}

export default function AdminOverview() {
  const { data, isLoading } = trpc.admin.overview.useQuery();

  return (
    <AdminShell section="overview" title="ภาพรวมระบบ">
      <DbBanner />
      {isLoading || !data ? (
        <p className="text-sm text-[var(--muted-foreground)]">กำลังโหลด…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            icon={Building2}
            label="อาคาร"
            value={data.buildingCount}
            hint="อาคารทั้งหมดในระบบ"
            href="/admin/buildings"
          />
          <StatCard
            icon={Newspaper}
            label="ข่าวสาร"
            value={data.newsCount}
            hint={`เผยแพร่อยู่ ${data.publishedNewsCount} เรื่อง`}
            href="/admin/news"
          />
          <StatCard
            icon={Users}
            label="ผู้ใช้"
            value={data.userCount}
            hint={`ผู้ดูแล ${data.adminCount} คน`}
            href="/admin/users"
          />
          <StatCard
            icon={MapPin}
            label="แผนที่"
            value={data.mapConfigured ? "เชื่อมต่อแล้ว" : "ยังไม่ตั้งค่า"}
            hint="Google My Maps embed"
            href="/admin/settings"
          />
          <StatCard
            icon={ShieldCheck}
            label="ฐานข้อมูล"
            value={data.databaseConfigured ? "พร้อมใช้งาน" : "ยังไม่เชื่อมต่อ"}
            hint={data.databaseConfigured ? "บันทึกข้อมูลได้" : "โหมดอ่านอย่างเดียว"}
            href="/admin/settings"
          />
        </div>
      )}
    </AdminShell>
  );
}
