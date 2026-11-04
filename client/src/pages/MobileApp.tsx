import { PlatooApp } from "@/platoo/PlatooApp";

/** The phone app ("/app", installable as a PWA): GPS distance and live turn-by-turn navigation. */
export default function MobileApp() {
  return <PlatooApp mode="phone" />;
}
