import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AdminShell, DbBanner } from "./AdminShell";

export default function UsersAdmin() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.admin.users.list.useQuery();

  const setRole = trpc.admin.users.setRole.useMutation({
    onSuccess: () => {
      utils.admin.users.list.invalidate();
      utils.admin.overview.invalidate();
      toast.success("อัปเดตสิทธิ์แล้ว");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <AdminShell section="users" title="ผู้ใช้และสิทธิ์">
      <DbBanner />
      {isLoading ? (
        <p className="text-sm text-[var(--muted-foreground)]">กำลังโหลด…</p>
      ) : !data?.length ? (
        <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
          ยังไม่มีผู้ใช้ในฐานข้อมูล — ผู้ใช้จะปรากฏที่นี่หลังเข้าสู่ระบบครั้งแรก
        </p>
      ) : (
        <div className="space-y-2">
          {data.map((u) => {
            const isSelf = u.openId === user?.openId;
            return (
              <div
                key={u.openId}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-card p-4"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--secondary)] text-sm font-bold text-[var(--secondary-foreground)]">
                  {(u.name ?? u.email ?? "?").charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[var(--ink)]">
                    {u.name ?? "(ไม่มีชื่อ)"} {isSelf && <span className="text-[var(--muted-foreground)]">· คุณ</span>}
                  </p>
                  <p className="truncate text-[11px] text-[var(--muted-foreground)]">
                    {u.email ?? u.openId} · เข้าสู่ระบบล่าสุด{" "}
                    {new Date(u.lastSignedIn).toLocaleDateString("th-TH")}
                  </p>
                </div>
                <Select
                  value={u.role}
                  onValueChange={(role) =>
                    setRole.mutate({ openId: u.openId, role: role as "user" | "admin" })
                  }
                  disabled={isSelf || setRole.isPending}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">ผู้ใช้</SelectItem>
                    <SelectItem value="admin">ผู้ดูแล</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}
