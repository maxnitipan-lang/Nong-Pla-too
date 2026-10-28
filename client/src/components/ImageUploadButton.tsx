import { Button } from "@/components/ui/button";
import { prepareImage, type ImageKind } from "@/lib/imageUpload";
import { trpc } from "@/lib/trpc";
import { ImagePlus, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

/**
 * "เลือกรูป" button for /admin: picks a file, shrinks it in the browser,
 * uploads it and hands back its URL (/api/images/…).
 */
export function ImageUploadButton({
  kind,
  label,
  onUploaded,
  disabled,
}: {
  kind: ImageKind;
  label: string;
  onUploaded: (url: string) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = trpc.admin.images.upload.useMutation();

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await prepareImage(file, kind);
      const { url } = await upload.mutateAsync({ dataUrl });
      onUploaded(url);
      toast.success("อัปโหลดรูปแล้ว — อย่าลืมกดบันทึก");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={e => void pick(e.target.files?.[0])}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
        {busy ? "กำลังอัปโหลด…" : label}
      </Button>
    </>
  );
}
