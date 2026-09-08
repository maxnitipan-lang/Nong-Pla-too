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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { newsInputSchema } from "@shared/adminSchemas";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminShell, DbBanner } from "./AdminShell";
import { ColorField, Field, NumberField, TextAreaField, TextField } from "./formKit";

type NewsRow = {
  id: string;
  tag: string;
  title: string;
  excerpt: string;
  date: string;
  time: string;
  accent: string;
  published: boolean;
  sortOrder: number;
};

type FormState = {
  id: string;
  tag: string;
  title: string;
  excerpt: string;
  dateLabel: string;
  timeLabel: string;
  accent: string;
  published: boolean;
  sortOrder: number;
};

const EMPTY: FormState = {
  id: "",
  tag: "",
  title: "",
  excerpt: "",
  dateLabel: "",
  timeLabel: "",
  accent: "#3c8f8d",
  published: true,
  sortOrder: 0,
};

export default function NewsAdmin() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.admin.news.list.useQuery();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const invalidate = () => {
    utils.admin.news.list.invalidate();
    utils.admin.overview.invalidate();
    utils.campus.news.invalidate();
  };

  const save = trpc.admin.news.save.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("บันทึกข่าวแล้ว");
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.admin.news.delete.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("ลบข่าวแล้ว");
      setDeleteId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY, sortOrder: data?.length ?? 0 });
    setOpen(true);
  };
  const openEdit = (n: NewsRow) => {
    setEditingId(n.id);
    setForm({
      id: n.id,
      tag: n.tag,
      title: n.title,
      excerpt: n.excerpt,
      dateLabel: n.date,
      timeLabel: n.time,
      accent: n.accent,
      published: n.published,
      sortOrder: n.sortOrder,
    });
    setOpen(true);
  };

  const submit = () => {
    const parsed = newsInputSchema.safeParse({ ...form, id: form.id.trim() });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
      return;
    }
    save.mutate(parsed.data);
  };

  const deleteTitle = useMemo(
    () => data?.find((n) => n.id === deleteId)?.title ?? "",
    [data, deleteId],
  );

  return (
    <AdminShell section="news" title="จัดการข่าวสาร">
      <DbBanner />
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate}>
          <Plus size={16} /> เพิ่มข่าว
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--muted-foreground)]">กำลังโหลด…</p>
      ) : (
        <div className="space-y-2">
          {data?.map((n) => (
            <div
              key={n.id}
              className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-card p-4"
            >
              <span
                className="h-10 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: n.accent }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-bold text-[var(--ink)]">{n.title}</p>
                  {!n.published && (
                    <span className="shrink-0 rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-bold text-[var(--muted-foreground)]">
                      ฉบับร่าง
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-[var(--muted-foreground)]">
                  {n.tag} · {n.date}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openEdit(n)}
                className="rounded-lg p-2 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                aria-label="แก้ไข"
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                onClick={() => setDeleteId(n.id)}
                className="rounded-lg p-2 text-[var(--destructive)] hover:bg-[var(--muted)]"
                aria-label="ลบ"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {!data?.length && (
            <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
              ยังไม่มีข่าว
            </p>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "แก้ไขข่าว" : "เพิ่มข่าว"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="รหัส (id)"
              hint="a-z, 0-9, - — เปลี่ยนภายหลังไม่ได้"
              value={form.id}
              onChange={(v) => set("id", v)}
              disabled={!!editingId}
              placeholder="open-house-2026"
            />
            <TextField label="ป้ายกำกับ" value={form.tag} onChange={(v) => set("tag", v)} />
          </div>
          <TextField label="หัวข้อ" value={form.title} onChange={(v) => set("title", v)} />
          <TextAreaField
            label="เนื้อหาย่อ"
            value={form.excerpt}
            onChange={(v) => set("excerpt", v)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="วันที่ (ข้อความ)"
              value={form.dateLabel}
              onChange={(v) => set("dateLabel", v)}
              placeholder="18 ก.ย. 2569"
            />
            <TextField
              label="เวลา / สถานะ"
              value={form.timeLabel}
              onChange={(v) => set("timeLabel", v)}
              placeholder="09:00–15:30 น."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField label="สีเน้น" value={form.accent} onChange={(v) => set("accent", v)} />
            <NumberField
              label="ลำดับการแสดง"
              value={form.sortOrder}
              onChange={(v) => set("sortOrder", v)}
              min={0}
            />
          </div>
          <Field label="การเผยแพร่">
            <div className="flex items-center gap-2">
              <Switch checked={form.published} onCheckedChange={(v) => set("published", v)} />
              <span className="text-sm text-[var(--muted-foreground)]">
                {form.published ? "เผยแพร่บนหน้าเว็บ" : "เก็บเป็นฉบับร่าง"}
              </span>
            </div>
          </Field>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบข่าว “{deleteTitle}”?</AlertDialogTitle>
            <AlertDialogDescription>การลบไม่สามารถย้อนกลับได้</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && remove.mutate({ id: deleteId })}
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
