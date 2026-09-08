import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { settingsInputSchema } from "@shared/adminSchemas";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell, DbBanner } from "./AdminShell";
import { NumberField, TextAreaField, TextField } from "./formKit";

type FormState = {
  collegeName: string;
  address: string;
  contactEmail: string;
  mapEmbedUrl: string;
  mapCenterLat: number;
  mapCenterLng: number;
};

export default function SettingsAdmin() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.admin.settings.get.useQuery();
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (!data) return;
    setForm({
      collegeName: data.collegeName,
      address: data.address,
      contactEmail: data.contactEmail,
      mapEmbedUrl: data.mapEmbedUrl,
      mapCenterLat: data.mapCenter.lat,
      mapCenterLng: data.mapCenter.lng,
    });
  }, [data]);

  const update = trpc.admin.settings.update.useMutation({
    onSuccess: () => {
      utils.admin.settings.get.invalidate();
      utils.admin.overview.invalidate();
      utils.campus.settings.invalidate();
      toast.success("บันทึกการตั้งค่าแล้ว");
    },
    onError: (e) => toast.error(e.message),
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const submit = () => {
    if (!form) return;
    const parsed = settingsInputSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
      return;
    }
    update.mutate(parsed.data);
  };

  return (
    <AdminShell section="settings" title="ตั้งค่าเว็บ">
      <DbBanner />
      {isLoading || !form ? (
        <p className="text-sm text-[var(--muted-foreground)]">กำลังโหลด…</p>
      ) : (
        <div className="space-y-5 rounded-2xl border border-[var(--border)] bg-card p-5 sm:p-6">
          <TextField
            label="ชื่อวิทยาลัย"
            value={form.collegeName}
            onChange={(v) => set("collegeName", v)}
          />
          <TextAreaField
            label="ที่อยู่"
            value={form.address}
            onChange={(v) => set("address", v)}
            rows={2}
          />
          <TextField
            label="อีเมลติดต่อ"
            value={form.contactEmail}
            onChange={(v) => set("contactEmail", v)}
            placeholder="info@smtc.ac.th"
          />
          <TextAreaField
            label="ลิงก์ฝัง Google My Maps"
            hint='Share → Embed → คัดลอกเฉพาะ src ของ <iframe> (ขึ้นต้นด้วย https://www.google.com/maps/d/embed?mid=) — เว้นว่างเพื่อใช้แผนที่วาด'
            value={form.mapEmbedUrl}
            onChange={(v) => set("mapEmbedUrl", v)}
            rows={2}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="ละติจูดจุดกึ่งกลาง"
              value={form.mapCenterLat}
              onChange={(v) => set("mapCenterLat", v)}
            />
            <NumberField
              label="ลองจิจูดจุดกึ่งกลาง"
              value={form.mapCenterLng}
              onChange={(v) => set("mapCenterLng", v)}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={submit} disabled={update.isPending}>
              {update.isPending ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
            </Button>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
