import type { ReactNode } from "react";
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

export const isMyMapConfigured = (embedUrl?: string): boolean =>
  (embedUrl ?? MYMAPS_EMBED_URL).length > 0;

type CampusMyMapProps = {
  className?: string;
  /** Illustrated fallback, rendered only when no embed URL is configured. */
  children?: ReactNode;
  title?: string;
  /** Overrides `VITE_MYMAPS_EMBED_URL` — pass the value from site settings. */
  embedUrl?: string;
};

export function CampusMyMap({
  className,
  children,
  title = "แผนที่วิทยาลัยเทคนิคสมุทรสงคราม",
  embedUrl,
}: CampusMyMapProps) {
  const url = (embedUrl ?? MYMAPS_EMBED_URL).trim();

  if (url.length > 0) {
    return (
      <iframe
        title={title}
        src={url}
        className={cn("absolute inset-0 h-full w-full border-0", className)}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
    );
  }

  return <div className={cn("absolute inset-0", className)}>{children}</div>;
}
