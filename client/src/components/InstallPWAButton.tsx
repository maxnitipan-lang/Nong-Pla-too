import { Download } from "lucide-react";
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

declare global { interface Window { __platoInstallPrompt?: InstallPromptEvent; } }

export function InstallPWAButton() {
  const [canInstall, setCanInstall] = useState(false);
  useEffect(() => {
    const onBeforeInstall = (event: Event) => { event.preventDefault(); window.__platoInstallPrompt = event as InstallPromptEvent; setCanInstall(true); };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    const onInstalled = () => setCanInstall(false);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onBeforeInstall); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  if (!canInstall) return null;
  return <button type="button" onClick={async () => { const prompt = window.__platoInstallPrompt; if (!prompt) return; await prompt.prompt(); await prompt.userChoice; window.__platoInstallPrompt = undefined; setCanInstall(false); }} className="flex min-h-10 items-center gap-2 rounded-full bg-[#5bb9b0] px-3 text-[10px] font-black text-[var(--ink)] shadow-sm transition-transform hover:-translate-y-0.5" aria-label="ติดตั้ง Nong Platoo Ontour เป็นแอป"><Download size={15} /> ติดตั้งแอป</button>;
}
