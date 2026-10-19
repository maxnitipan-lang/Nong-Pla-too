import { trpc } from "@/lib/trpc";
import { parseMyMapsCsv, parseMyMapsKml, type ImportedMapBuilding } from "@shared/myMaps";
import { CheckCircle2, FileDown, FileUp, MapPinned, RotateCcw, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

export function MyMapsImport({ onImported }: { onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ImportedMapBuilding[]>([]);
  const [fileName, setFileName] = useState("");
  const [isReading, setIsReading] = useState(false);
  const importBuildings = trpc.admin.buildings.import.useMutation({ onSuccess: (result) => { toast.success(`นำเข้าอาคาร ${result.imported} รายการแล้ว`); setItems([]); setFileName(""); onImported(); }, onError: (error) => toast.error(error.message) });

  const readFile = async (file: File) => {
    setIsReading(true);
    try {
      const content = await file.text();
      const parsed = file.name.toLowerCase().endsWith(".kml") ? parseMyMapsKml(content) : parseMyMapsCsv(content);
      setItems(parsed); setFileName(file.name);
      if (!parsed.length) toast.error("ไม่พบรายการที่มีพิกัดในไฟล์นี้");
      else toast.success(`พบข้อมูล ${parsed.length} รายการ กรุณาตรวจสอบก่อนนำเข้า`);
    } finally { setIsReading(false); }
  };

  return <section className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-[var(--border)] sm:p-7">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#398e89]">GOOGLE MY MAPS IMPORT</p><h2 className="mt-2 text-xl font-black text-[var(--ink)]">นำเข้าข้อมูลอาคารและพิกัด</h2><p className="mt-2 max-w-2xl text-xs leading-6 text-[var(--muted-foreground)]">อัปโหลดไฟล์ CSV หรือ KML ที่ Export จาก Google My Maps ระบบจะอ่านชื่อและพิกัดมาให้ตรวจสอบก่อนบันทึก ส่วนชั้น ห้อง สาขาวิชา และ Gallery จะตั้งเป็นสถานะรอข้อมูลจากแบ็กเอนด์</p></div><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#e8f3f1] text-[#287c78]"><MapPinned size={20} /></div></div>
    <div className="mt-6 grid gap-3 md:grid-cols-2"><button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#b8dbd6] bg-[#f7fbfa] text-center transition-colors hover:border-[#398e89] hover:bg-[#eef8f6]" disabled={isReading}><UploadCloud className="text-[#398e89]" size={24} /><span className="text-xs font-black text-[var(--ink)]">{isReading ? "กำลังอ่านไฟล์..." : "เลือกไฟล์ CSV หรือ KML"}</span><span className="text-[10px] text-[var(--muted-foreground)]">รองรับไฟล์จาก Google My Maps</span></button><div className="rounded-2xl bg-[#f8faf8] p-4 text-xs leading-6 text-[var(--muted-foreground)]"><p className="font-black text-[var(--ink)]">ขั้นตอนเตรียมไฟล์</p><p className="mt-1">Google My Maps → เมนูเพิ่มเติม → Export to KML/KMZ หรือ Export CSV → นำไฟล์มาอัปโหลดที่นี่</p><p className="mt-2 text-[10px]">หมายเหตุ: ไฟล์ KMZ ให้แตกไฟล์เป็น KML ก่อนในเวอร์ชันนี้</p></div></div>
    <input ref={inputRef} type="file" accept=".csv,.kml,text/csv,application/vnd.google-earth.kml+xml" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); event.target.value = ""; }} />
    {items.length > 0 && <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--border)]"><div className="flex flex-col justify-between gap-3 bg-[#f8faf8] p-4 sm:flex-row sm:items-center"><div><p className="text-xs font-black text-[var(--ink)]">ตัวอย่างข้อมูล: {fileName}</p><p className="mt-1 text-[10px] text-[var(--muted-foreground)]">พบ {items.length} รายการ · ตรวจสอบชื่อและพิกัดก่อนบันทึก</p></div><div className="flex gap-2"><button type="button" onClick={() => { setItems([]); setFileName(""); }} className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3 py-2 text-[11px] font-black"><RotateCcw size={13} /> ล้าง</button><button type="button" onClick={() => importBuildings.mutate({ items })} disabled={importBuildings.isPending} className="flex items-center gap-1.5 rounded-full bg-[var(--ink)] px-3 py-2 text-[11px] font-black text-white disabled:opacity-50"><CheckCircle2 size={13} /> {importBuildings.isPending ? "กำลังบันทึก..." : "นำเข้าและบันทึก"}</button></div></div><div className="max-h-72 overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-white text-[10px] font-black text-[var(--muted-foreground)]"><tr><th className="px-4 py-3">ชื่อ</th><th className="px-4 py-3">Latitude</th><th className="px-4 py-3">Longitude</th><th className="px-4 py-3">ประเภท</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-t border-[var(--border)]"><td className="px-4 py-3 font-bold text-[var(--ink)]">{item.name}</td><td className="px-4 py-3 font-mono text-[10px]">{item.latitude.toFixed(8)}</td><td className="px-4 py-3 font-mono text-[10px]">{item.longitude.toFixed(8)}</td><td className="px-4 py-3">{item.category}</td></tr>)}</tbody></table></div></div>}
    <div className="mt-5 flex items-center gap-2 text-[10px] text-[var(--muted-foreground)]"><FileDown size={14} className="text-[#398e89]" /> หลังนำเข้าแล้ว แก้ไขจำนวนชั้น ห้อง สาขาวิชา และ Gallery ต่อได้ในเมนูอาคารและตำแหน่ง</div>
  </section>;
}
