import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const INSTALL_DISMISSED_KEY = "nong-platoo-install-dismissed";

const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
const isIos = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

/** "Install the app" — Chrome's install prompt, or the Share → Add to Home Screen steps on iPhone. */
export function InstallCard() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "1" || isStandalone();
    } catch {
      return isStandalone();
    }
  });
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  if (dismissed || (!prompt && !isIos())) return null;
  const dismiss = () => {
    try {
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };
  return (
    <div className="install-card">
      <img src="/icons/icon-192.png" alt="" />
      <div>
        <strong>ติดตั้งแอปน้องปลาทู</strong>
        {prompt ? "เปิดได้จากหน้าจอโฮม เต็มจอ ใช้ได้แม้สัญญาณไม่ดี" : <>แตะ <Share size={13} className="inline" /> แชร์ แล้วเลือก "เพิ่มไปยังหน้าจอโฮม"</>}
      </div>
      {prompt && (
        <button
          type="button"
          className="install-go"
          onClick={async () => {
            await prompt.prompt();
            await prompt.userChoice;
            setPrompt(null);
            dismiss();
          }}
        >
          <Download size={14} className="inline" /> ติดตั้ง
        </button>
      )}
      <button type="button" onClick={dismiss} aria-label="ไม่ต้องติดตั้ง">
        <X size={16} />
      </button>
    </div>
  );
}
