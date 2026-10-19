// Full-screen "touch to start" shown when nobody has used the kiosk for a while.
import { QrCode, phoneRouteUrl } from "@/components/common/QrCode";
import { KIOSK_ASSETS } from "@/config/kioskAssets";

export function AttractScreen({ onWake, collegeName }: { onWake: () => void; collegeName: string }) {
  return (
    <button
      type="button"
      onClick={onWake}
      className="fixed inset-0 z-[2000] flex flex-col items-center justify-center gap-8 bg-[radial-gradient(circle_at_50%_35%,#e4f6f1,#cfe9e2_60%,#b9ddd4)] p-8 text-center text-[var(--ink)]"
      aria-label="แตะหน้าจอเพื่อเริ่มใช้งาน"
    >
      <div className="relative flex h-64 w-64 items-center justify-center rounded-full bg-white/70 shadow-[0_25px_70px_rgba(16,41,58,0.18)] [animation:npt-float_3.2s_ease-in-out_infinite]">
        <div className="absolute flex h-44 w-44 items-center justify-center rounded-[42%] bg-[var(--ink)] text-7xl text-white">
          ◉‿◉
        </div>
        <img
          src={KIOSK_ASSETS.character.idle}
          alt=""
          className="relative h-56 w-56 rounded-[42%] object-cover"
          onError={e => {
            e.currentTarget.style.display = "none";
          }}
        />
      </div>
      <div>
        <p className="text-5xl font-black tracking-[-0.04em]">สวัสดีครับ ผมน้องปลาทู</p>
        <p className="mt-3 text-xl font-bold text-[var(--muted-foreground)]">
          ผู้ช่วยนำทางและประชาสัมพันธ์ {collegeName}
        </p>
      </div>
      <p className="animate-pulse rounded-full bg-[var(--ink)] px-10 py-5 text-2xl font-black text-white shadow-xl">
        👆 แตะหน้าจอเพื่อเริ่มใช้งาน
      </p>
      <div className="flex items-center gap-4 rounded-3xl bg-white/80 p-4 shadow-sm">
        <QrCode value={phoneRouteUrl()} className="w-28" label="QR เปิดแอปน้องปลาทูบนมือถือ" />
        <p className="max-w-[240px] text-left text-sm font-bold leading-6">
          <span className="block text-base font-black">ใช้บนมือถือก็ได้</span>
          สแกนเพื่อเปิดแอปน้องปลาทู นำทางด้วย GPS ได้ทั้งวิทยาลัย
        </p>
      </div>
      <style>{"@keyframes npt-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}"}</style>
    </button>
  );
}
