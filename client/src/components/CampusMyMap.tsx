import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Google My Maps embed.
 *
 * The embed URL can come from two places (the prop wins):
 *  1. `embedUrl` prop — the value stored in site settings and edited from the
 *     admin panel (`/admin/settings`).
 *  2. `VITE_MYMAPS_EMBED_URL` in `.env` — a build-time fallback.
 *
 * It is the "Embed on my site" URL from Google My Maps (Share → Embed → copy the
 * `src` of the <iframe>, it looks like `https://www.google.com/maps/d/embed?mid=...`).
 * No API key or billing needed.
 *
 * When neither is set, the illustrated fallback passed as `children` is shown
 * instead, so the page still works during development.
 */
export const MYMAPS_EMBED_URL: string = import.meta.env.VITE_MYMAPS_EMBED_URL || "";

/** Resolve the embed URL: the settings value wins, else the `.env` fallback. */
export const resolveMyMapUrl = (embedUrl?: string): string =>
  (embedUrl?.trim() || MYMAPS_EMBED_URL).trim();

export const isMyMapConfigured = (embedUrl?: string): boolean =>
  resolveMyMapUrl(embedUrl).length > 0;

type CampusMyMapProps = {
  className?: string;
  /** Illustrated fallback, rendered only when no embed URL is configured. */
  children?: ReactNode;
  title?: string;
  /** Overrides `VITE_MYMAPS_EMBED_URL` — pass the value from site settings. */
  embedUrl?: string;
  /**
   * Recenter the embedded map on this point. Google My Maps has no client API,
   * so this appends `&ll=&z=` and loads a fresh iframe — but the previous map
   * stays visible until the new one has finished loading, so there is no blank
   * flash.
   */
  focus?: { lat?: string | null; lng?: string | null } | null;
  /** Zoom level used when `focus` is set (default 18). */
  focusZoom?: number;
};

const IFRAME_PROPS = {
  loading: "lazy" as const,
  referrerPolicy: "no-referrer-when-downgrade" as const,
  allowFullScreen: true,
};

export function CampusMyMap({
  className,
  children,
  title = "แผนที่วิทยาลัยเทคนิคสมุทรสงคราม",
  embedUrl,
  focus,
  focusZoom = 18,
}: CampusMyMapProps) {
  const base = resolveMyMapUrl(embedUrl);

  const targetSrc = useMemo(() => {
    if (!base) return "";
    return focus?.lat && focus?.lng
      ? `${base}&ll=${focus.lat},${focus.lng}&z=${focusZoom}`
      : base;
  }, [base, focus?.lat, focus?.lng, focusZoom]);

  // Double-buffer the iframe: `shownSrc` stays on screen while `nextSrc` loads
  // underneath, then we swap once its onLoad fires. React keeps the loaded
  // iframe mounted (same key), so the swap does not reload it.
  const [shownSrc, setShownSrc] = useState(targetSrc);
  const [nextSrc, setNextSrc] = useState<string | null>(null);

  useEffect(() => {
    if (targetSrc && targetSrc !== shownSrc) setNextSrc(targetSrc);
  }, [targetSrc, shownSrc]);

  if (!base) {
    return <div className={cn("absolute inset-0", className)}>{children}</div>;
  }

  const iframeClass = cn(
    "absolute inset-0 h-full w-full border-0",
    className,
  );

  return (
    <div className="absolute inset-0">
      <iframe key={shownSrc} title={title} src={shownSrc} className={iframeClass} {...IFRAME_PROPS} />
      {nextSrc && nextSrc !== shownSrc && (
        <iframe
          key={nextSrc}
          title={title}
          src={nextSrc}
          // invisible + click-through until it has loaded
          className={cn(iframeClass, "pointer-events-none opacity-0")}
          onLoad={() => {
            setShownSrc(nextSrc);
            setNextSrc(null);
          }}
          {...IFRAME_PROPS}
        />
      )}
    </div>
  );
}
