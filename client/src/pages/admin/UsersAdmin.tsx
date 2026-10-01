import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { newAdminAccountSchema } from "@shared/adminSchemas";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, STAFF_ROLES, USER_ROLES, type StaffRole, type UserRole } from "@shared/roles";
import { Copy, Eye, EyeOff, KeyRound, Trash2, UserPlus, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell, DbBanner } from "./AdminShell";
import { Field, TextField } from "./formKit";
import { Input } from "@/components/ui/input";

/** Readable random password (no look-alike characters). */
function randomPassword(length = 12): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Hidden by default so a screenshot of this dialog doesn't leak the password.
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Field label="รหัสผ่าน (อย่างน้อย 8 ตัว)">
            <div className="relative">
              <Input
                type={visible ? "text" : "password"}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                aria-label={visible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
              >
                {visible ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </Field>
        </div>
        <Button type="button" variant="outline" onClick={() => onChange(randomPassword())}>
          <Wand2 size={14} /> สุ่ม
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!value}
          onClick={() => navigator.clipboard?.writeText(value).then(() => toast.success("คัดลอกรหัสผ่านแล้ว"))}
          aria-label="คัดลอกรหัสผ่าน"
        >
          <Copy size={14} />
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
        ระบบเก็บรหัสแบบเข้ารหัส ดูย้อนหลังไม่ได้ — คัดลอกส่งให้เจ้าของบัญชีทางช่องทางส่วนตัวก่อนกดบันทึก
      </p>
    </div>
  );
}

export default function UsersAdmin() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.admin.users.list.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<{ username: string; name: string; password: string; role: StaffRole }>({ username: "", name: "", password: "", role: "editor" });
  const [resetFor, setResetFor] = useState<{ openId: string; label: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [deleteFor, setDeleteFor] = useState<{ openId: string; label: string } | null>(null);

  const refresh = () => {
    utils.admin.users.list.invalidate();
    utils.admin.overview.invalidate();
  };

  const setRole = trpc.admin.users.setRole.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("อัปเดตสิทธิ์แล้ว");
    },
    onError: (e) => toast.error(e.message),
  });
  const create = trpc.admin.users.create.useMutation({
    onSuccess: () => {
      refresh();
      toast.success(`เพิ่ม "${form.username}" (${ROLE_LABELS[form.role]}) แล้ว`);
      setCreateOpen(false);
      setForm({ username: "", name: "", password: "", role: "editor" });
    },
    onError: (e) => toast.error(e.message),
  });
  const resetPassword = trpc.admin.users.resetPassword.useMutation({
    onSuccess: () => {
      toast.success("เปลี่ยนรหัสผ่านแล้ว — เจ้าของบัญชีต้องเข้าสู่ระบบใหม่");
      setResetFor(null);
      setNewPassword("");
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.admin.users.delete.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("ลบบัญชีแล้ว");
      setDeleteFor(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const submitCreate = () => {
    const parsed = newAdminAccountSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
      return;
    }
    create.mutate(parsed.data);
  };

  return (
    <AdminShell section="users" title="ผู้ใช้และสิทธิ์">
      <DbBanner />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-xs leading-6 text-[var(--muted-foreground)]">
          เพิ่มคนเข้าส่วนผู้ดูแลเป็นรายคน (ชื่อผู้ใช้ + รหัสผ่าน) และกำหนดสิทธิ์: <b>ผู้ดูแล</b> — ทำได้ทุกอย่างรวมถึงจัดการผู้ใช้ ·{" "}
          <b>ผู้แก้ไข</b> — แก้อาคาร ทางเดิน ข่าว ตั้งค่า · <b>ดูอย่างเดียว</b> — เปิดดูได้ แก้ไม่ได้
          · บัญชีหลักใน .env (ADMIN_USERNAME / ADMIN_PASSWORD) ไม่แสดงในรายการนี้
        </p>
        <Button onClick={() => { setForm({ username: "", name: "", password: randomPassword(), role: "editor" }); setCreateOpen(true); }}>
          <UserPlus size={16} /> เพิ่มผู้ใช้
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--muted-foreground)]">กำลังโหลด…</p>
      ) : !data?.length ? (
        <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
          ยังไม่มีผู้ใช้ในฐานข้อมูล
        </p>
      ) : (
        <div className="space-y-2">
          {data.map((u) => {
            const isSelf = u.openId === user?.openId;
            const label = u.name ?? u.username ?? u.email ?? u.openId;
            return (
              <div
                key={u.openId}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-card p-4"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--secondary)] text-sm font-bold text-[var(--secondary-foreground)]">
                  {label.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[var(--ink)]">
                    {u.name ?? "(ไม่มีชื่อ)"} {isSelf && <span className="text-[var(--muted-foreground)]">· คุณ</span>}
                    {u.username && (
                      <span className="ml-2 rounded-full bg-[#e8f0fe] px-2 py-0.5 text-[10px] font-bold text-[#1a73e8]">
                        ชื่อผู้ใช้: {u.username}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-[var(--muted-foreground)]">
                    {u.username ? "เข้าสู่ระบบด้วยรหัสผ่าน" : u.email ?? u.openId} · เข้าสู่ระบบล่าสุด{" "}
                    {new Date(u.lastSignedIn).toLocaleDateString("th-TH")}
                  </p>
                </div>
                <Select
                  value={u.role}
                  onValueChange={(role) =>
                    setRole.mutate({ openId: u.openId, role: role as UserRole })
                  }
                  disabled={isSelf || setRole.isPending}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...USER_ROLES].reverse().map((r) => (
                      <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {u.username && (
                  <button
                    type="button"
                    onClick={() => { setNewPassword(randomPassword()); setResetFor({ openId: u.openId, label }); }}
                    className="rounded-lg p-2 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                    aria-label="เปลี่ยนรหัสผ่าน"
                    title="เปลี่ยนรหัสผ่าน"
                  >
                    <KeyRound size={15} />
                  </button>
                )}
                {!isSelf && (
                  <button
                    type="button"
                    onClick={() => setDeleteFor({ openId: u.openId, label })}
                    className="rounded-lg p-2 text-[var(--destructive)] hover:bg-[var(--muted)]"
                    aria-label="ลบบัญชี"
                    title="ลบบัญชี"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>เพิ่มผู้ใช้ส่วนผู้ดูแล</DialogTitle>
            <DialogDescription>เข้าสู่ระบบที่ /admin ด้วยชื่อผู้ใช้และรหัสผ่านนี้ ได้สิทธิ์ตามที่เลือกด้านล่าง</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <TextField
              label="ชื่อผู้ใช้ (ใช้ตอนเข้าสู่ระบบ)"
              hint="a-z, 0-9, . _ - เช่น somchai"
              value={form.username}
              onChange={(v) => setForm((f) => ({ ...f, username: v }))}
              placeholder="somchai"
            />
            <TextField
              label="ชื่อที่แสดง"
              value={form.name}
              onChange={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder="เช่น ครูสมชาย งานประชาสัมพันธ์"
            />
            <PasswordField value={form.password} onChange={(v) => setForm((f) => ({ ...f, password: v }))} />
            <div>
              <p className="mb-2 text-xs font-bold text-[var(--ink)]">สิทธิ์</p>
              <div className="space-y-2">
                {STAFF_ROLES.map((r) => (
                  <label
                    key={r}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${form.role === r ? "border-[var(--ink)] bg-[var(--secondary)]" : "border-[var(--border)]"}`}
                  >
                    <input type="radio" name="role" checked={form.role === r} onChange={() => setForm((f) => ({ ...f, role: r }))} className="mt-1" />
                    <span>
                      <span className="block font-bold text-[var(--ink)]">{ROLE_LABELS[r]}</span>
                      <span className="block text-xs text-[var(--muted-foreground)]">{ROLE_DESCRIPTIONS[r]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>ยกเลิก</Button>
            <Button onClick={submitCreate} disabled={create.isPending}>
              {create.isPending ? "กำลังบันทึก…" : "เพิ่มผู้ใช้"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetFor} onOpenChange={(v) => !v && setResetFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>เปลี่ยนรหัสผ่าน · {resetFor?.label}</DialogTitle>
            <DialogDescription>เจ้าของบัญชีจะถูกออกจากระบบทุกเครื่อง และต้องใช้รหัสใหม่นี้</DialogDescription>
          </DialogHeader>
          <PasswordField value={newPassword} onChange={setNewPassword} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetFor(null)}>ยกเลิก</Button>
            <Button
              onClick={() => resetFor && resetPassword.mutate({ openId: resetFor.openId, password: newPassword })}
              disabled={resetPassword.isPending || newPassword.length < 8}
            >
              บันทึกรหัสใหม่
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteFor} onOpenChange={(v) => !v && setDeleteFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบบัญชี “{deleteFor?.label}”?</AlertDialogTitle>
            <AlertDialogDescription>บัญชีนี้จะเข้าหน้าผู้ดูแลไม่ได้อีก การลบย้อนกลับไม่ได้</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteFor && remove.mutate({ openId: deleteFor.openId })}
              className="bg-[var(--destructive)] text-white hover:bg-[var(--destructive)]/90"
            >
              ลบ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminShell>
  );
}
