import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** QR code drawn locally (no external service), as an SVG that stays sharp at any size. */
export function QrCode({ value, className, label }: { value: string; className?: string; label?: string }) {
  const [svg, setSvg] = useState<string>("");
  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#10293a", light: "#ffffff" } })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(""));
    return () => {
      alive = false;
    };
  }, [value]);
  return (
    <div
      role="img"
      aria-label={label ?? `QR code: ${value}`}
      className={cn("aspect-square w-full rounded-xl bg-white p-1 [&>svg]:h-full [&>svg]:w-full", className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** Link the phone app opens straight into navigation to `buildingId`. */
export function phoneRouteUrl(buildingId?: string, startNavigation = true): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  if (!buildingId) return `${origin}/app?openExternalBrowser=1`;
  return `${origin}/app?place=${encodeURIComponent(buildingId)}${startNavigation ? "&go=1" : ""}&openExternalBrowser=1`;
}
