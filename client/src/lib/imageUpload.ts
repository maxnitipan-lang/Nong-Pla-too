// Shrink a picture in the browser before uploading it, so a phone photo of
// several MB becomes a small file that loads fast on the kiosk.
//   logo  → square, centre-cropped, 256×256
//   photo → longest side 1280 px, JPEG

export type ImageKind = "logo" | "photo";

const LOGO_SIZE = 256;
const PHOTO_MAX = 1280;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("เปิดไฟล์รูปนี้ไม่ได้ — ลองใช้ไฟล์ JPG หรือ PNG"));
    };
    img.src = url;
  });
}

/** WebP when the browser can make it (much smaller), otherwise PNG/JPEG. */
function encode(canvas: HTMLCanvasElement, kind: ImageKind): string {
  const webp = canvas.toDataURL("image/webp", kind === "logo" ? 0.9 : 0.82);
  if (webp.startsWith("data:image/webp")) return webp;
  return kind === "logo" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.82);
}

/** Resize `file` for its use and return it as a data URL ready to upload. */
export async function prepareImage(file: File, kind: ImageKind): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("กรุณาเลือกไฟล์รูปภาพ");
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์นี้ย่อรูปไม่ได้");
  ctx.imageSmoothingQuality = "high";

  if (kind === "logo") {
    // Centre square crop, white behind transparent parts so it looks right on any pin colour.
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    canvas.width = canvas.height = LOGO_SIZE;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, LOGO_SIZE, LOGO_SIZE);
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      LOGO_SIZE,
      LOGO_SIZE
    );
  } else {
    const scale = Math.min(1, PHOTO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }
  return encode(canvas, kind);
}
