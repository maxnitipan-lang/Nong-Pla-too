import { useEffect, useRef, useState } from "react";

/**
 * True after `ms` without any touch, click, key or scroll. Used by the kiosk to
 * wipe the previous visitor's session and show the attract screen.
 */
export function useIdle(ms: number): [idle: boolean, wake: () => void] {
  const [idle, setIdle] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const arm = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setIdle(true), ms);
  };

  useEffect(() => {
    const activity = () => {
      setIdle(false);
      arm();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, activity, { passive: true }));
    arm();
    return () => {
      events.forEach((e) => window.removeEventListener(e, activity));
      window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms]);

  return [
    idle,
    () => {
      setIdle(false);
      arm();
    },
  ];
}
