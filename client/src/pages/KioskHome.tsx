import { isMobileDevice } from "@/lib/voice";
import { PlatooApp } from "@/platoo/PlatooApp";

/**
 * "/" is the kiosk. A phone that lands here (typed the address, followed a shared
 * link) gets the phone app instead — unless the URL says ?kiosk=1 (for testing
 * the kiosk on a small screen).
 */
function shouldUsePhoneApp(): boolean {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).get("kiosk") === "1") return false;
  return isMobileDevice() && window.matchMedia("(max-width: 820px)").matches;
}

export default function KioskHome() {
  if (shouldUsePhoneApp()) {
    window.location.replace(`/app${window.location.search}`);
    return null;
  }
  return <PlatooApp mode="kiosk" />;
}
