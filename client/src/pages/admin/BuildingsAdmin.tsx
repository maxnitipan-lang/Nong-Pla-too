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
import { trpc } from "@/lib/trpc";
import type { CampusBuilding } from "@shared/campus";
import { CAMPUS_CATEGORIES, buildingInputSchema } from "@shared/adminSchemas";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminShell, DbBanner } from "./AdminShell";
import {
  ColorField,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from "./formKit";

type FloorRow = { label: string; rooms: string };

type FormState = {
  id: string;
  name: string;
  shortName: string;
  category: string;
  description: string;
  floors: number;
  accent: string;
  latitude: string;
  longitude: string;
  mapX: number;
  mapY: number;
  mapWidth: number;
  mapHeight: number;
  sortOrder: number;
  floorRows: FloorRow[];
};

const EMPTY: FormState = {
  id: "",
  name: "",
  shortName: "",
  category: "สายอุตสาหกรรม",
  description: "",
  floors: 1,
  accent: "#123b52",
  latitude: "",
  longitude: "",
  mapX: 50,
  mapY: 50,
  mapWidth: 18,
  mapHeight: 17,
  sortOrder: 0,
  floorRows: [{ label: "ชั้น 1", rooms: "" }],
};

function toForm(b: CampusBuilding, index: number): FormState {
  return {
    id: b.id,
    name: b.name,
    shortName: b.shortName,
    category: b.category,
    description: b.description,
    floors: b.floors,
    accent: b.accent,
    latitude: b.latitude ?? "",
    longitude: b.longitude ?? "",
    mapX: b.x,
    mapY: b.y,
    mapWidth: b.width,
    mapHeight: b.height,
    sortOrder: index,
    floorRows: (b.floorsDetail.length ? b.floorsDetail : [{ level: 1, label: "ชั้น 1", rooms: [] }]).map(
      (f) => ({ label: f.label, rooms: f.rooms.join(", ") }),
    ),
  };
}

function buildPayload(form: FormState) {
  return {
    id: form.id.trim(),
    name: form.name,
    shortName: form.shortName,
    category: form.category,
    description: form.description,
    floors: form.floors,
    latitude: form.latitude,
    longitude: form.longitude,
    accent: form.accent,
    mapX: form.mapX,
    mapY: form.mapY,
    mapWidth: form.mapWidth,
    mapHeight: form.mapHeight,
    sortOrder: form.sortOrder,
    floorDetails: form.floorRows.map((row, i) => ({
      level: i + 1,
      label: row.label.trim() || `ชั้น ${i + 1}`,
      rooms: row.rooms
        .split(/[,\n]/)
        .map((r) => r.trim())
        .filter(Boolean),
    })),
  };
}

export default function BuildingsAdmin() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.admin.buildings.list.useQuery();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const invalidate = () => {
    utils.admin.buildings.list.invalidate();
    utils.admin.overview.invalidate();
    utils.campus.buildings.invalidate();
  };

  const save = trpc.admin.buildings.save.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("บันทึกอาคารแล้ว");
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.admin.buildings.delete.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("ลบอาคารแล้ว");
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
  const openEdit = (b: CampusBuilding, index: number) => {
    setEditingId(b.id);
    setForm(toForm(b, index));
    setOpen(true);
  };

  const submit = () => {
    const parsed = buildingInputSchema.safeParse(buildPayload(form));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
      return;
    }
    save.mutate(parsed.data);
  };

  const deleteName = useMemo(
    () => data?.find((b) => b.id === deleteId)?.name ?? "",
    [data, deleteId],
  );

  return (
    <AdminShell section="buildings" title="จัดการอาคาร">
      <DbBanner />
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate}>
          <Plus size={16} /> เพิ่มอาคาร
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--muted-foreground)]">กำลังโหลด…</p>
      ) : (
        <div className="space-y-2">
          {data?.map((b, index) => (
            <div
              key={b.id}
              className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-card p-4"
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                style={{ backgroundColor: b.accent }}
              >
                <Building2 size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[var(--ink)]">{b.name}</p>
                <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                  {b.category} · {b.floors} ชั้น · <code>{b.id}</code>
                </p>
              </div>
              <button
                type="button"
                onClick={() => openEdit(b, index)}
                className="rounded-lg p-2 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                aria-label="แก้ไข"
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                onClick={() => setDeleteId(b.id)}
                className="rounded-lg p-2 text-[var(--destructive)] hover:bg-[var(--muted)]"
                aria-label="ลบ"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {!data?.length && (
            <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
              ยังไม่มีอาคาร
            </p>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "แก้ไขอาคาร" : "เพิ่มอาคาร"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="รหัส (id)"
              hint="ใช้ a-z, 0-9, - เท่านั้น — เปลี่ยนภายหลังไม่ได้"
              value={form.id}
              onChange={(v) => set("id", v)}
              disabled={!!editingId}
              placeholder="library"
            />
            <SelectField
              label="ประเภท"
              value={form.category}
              onChange={(v) => set("category", v)}
              options={CAMPUS_CATEGORIES}
            />
            <TextField label="ชื่ออาคาร" value={form.name} onChange={(v) => set("name", v)} />
            <TextField
              label="ชื่อย่อ"
              value={form.shortName}
              onChange={(v) => set("shortName", v)}
            />
          </div>

          <TextAreaField
            label="คำอธิบาย"
            value={form.description}
            onChange={(v) => set("description", v)}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField
              label="จำนวนชั้น"
              value={form.floors}
              onChange={(v) => set("floors", v)}
              min={1}
            />
            <NumberField
              label="ลำดับการแสดง"
              value={form.sortOrder}
              onChange={(v) => set("sortOrder", v)}
              min={0}
            />
            <ColorField label="สีหมุด" value={form.accent} onChange={(v) => set("accent", v)} />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--ink)]">รายละเอียดแต่ละชั้น</span>
              <button
                type="button"
                onClick={() =>
                  set("floorRows", [
                    ...form.floorRows,
                    { label: `ชั้น ${form.floorRows.length + 1}`, rooms: "" },
                  ])
                }
                className="text-xs font-bold text-[#287c78]"
              >
                + เพิ่มชั้น
              </button>
            </div>
            <div className="space-y-2">
              {form.floorRows.map((row, i) => (
                <div key={i} className="rounded-xl border border-[var(--border)] p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <input
                      value={row.label}
                      onChange={(e) => {
                        const next = [...form.floorRows];
                        next[i] = { ...row, label: e.target.value };
                        set("floorRows", next);
                      }}
                      className="h-8 flex-1 rounded-md border border-[var(--border)] bg-card px-2 text-sm"
                      placeholder={`ชั้น ${i + 1}`}
                    />
                    {form.floorRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          set(
                            "floorRows",
                            form.floorRows.filter((_, j) => j !== i),
                          )
                        }
                        className="rounded-md p-1.5 text-[var(--destructive)] hover:bg-[var(--muted)]"
                        aria-label="ลบชั้น"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <input
                    value={row.rooms}
                    onChange={(e) => {
                      const next = [...form.floorRows];
                      next[i] = { ...row, rooms: e.target.value };
                      set("floorRows", next);
                    }}
                    className="h-8 w-full rounded-md border border-[var(--border)] bg-card px-2 text-sm"
                    placeholder="ห้องเรียน 1, ห้องพักครู, ห้องประชุม"
                  />
                </div>
              ))}
            </div>
          </div>

          <details className="rounded-xl border border-[var(--border)] p-3">
            <summary className="cursor-pointer text-xs font-bold text-[var(--ink)]">
              ตำแหน่งบนแผนที่วาด + พิกัดจริง (ไม่บังคับ)
            </summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <NumberField label="ตำแหน่ง X (%)" value={form.mapX} onChange={(v) => set("mapX", v)} />
              <NumberField label="ตำแหน่ง Y (%)" value={form.mapY} onChange={(v) => set("mapY", v)} />
              <NumberField
                label="กว้าง (%)"
                value={form.mapWidth}
                onChange={(v) => set("mapWidth", v)}
              />
              <NumberField
                label="สูง (%)"
                value={form.mapHeight}
                onChange={(v) => set("mapHeight", v)}
              />
              <TextField
                label="ละติจูด"
                value={form.latitude}
                onChange={(v) => set("latitude", v)}
              />
              <TextField
                label="ลองจิจูด"
                value={form.longitude}
                onChange={(v) => set("longitude", v)}
              />
            </div>
          </details>

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
            <AlertDialogTitle>ลบอาคาร “{deleteName}”?</AlertDialogTitle>
            <AlertDialogDescription>
              การลบไม่สามารถย้อนกลับได้ ข้อมูลอาคารนี้จะหายไปจากหน้าเว็บทันที
            </AlertDialogDescription>
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
