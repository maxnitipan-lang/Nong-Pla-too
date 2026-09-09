import { useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { trpc } from "@/lib/trpc";

type CampusChatProps = {
  /** Called when the bot decides to show a walking route to a building. */
  onShowRoute?: (buildingId: string) => void;
};

/**
 * Floating "น้องปลาทู" chatbot. Only renders when the server has an AI key
 * configured (`trpc.chat.configured`). Answers from the campus building / news
 * data via `trpc.chat.ask`; a directions request calls `onShowRoute` so the
 * page can draw the route on the main map.
 */
export function CampusChat({ onShowRoute }: CampusChatProps) {
  const { data: configured } = trpc.chat.configured.useQuery(undefined, {
    staleTime: Infinity,
  });
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleSend = async (content: string) => {
    const next: Message[] = [...messages, { role: "user", content }];
    setMessages(next);

    const controller = new AbortController();
    abortRef.current = controller;
    setPending(true);
    try {
      const { reply, routeToBuildingId } = await utils.client.chat.ask.mutate(
        { messages: next },
        { signal: controller.signal },
      );
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      if (routeToBuildingId) {
        setOpen(false);
        onShowRoute?.(routeToBuildingId);
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "หยุดแล้วครับ — ถามใหม่ได้เลย" },
        ]);
      } else {
        const message =
          error instanceof Error ? error.message : "ไม่ทราบสาเหตุ";
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `ขออภัย ระบบยังตอบไม่ได้ตอนนี้\n(${message})`,
          },
        ]);
      }
    } finally {
      setPending(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => abortRef.current?.abort();

  if (!configured) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="เปิดแชตถามน้องปลาทู"
          className="fixed bottom-5 right-5 z-[1200] flex h-14 items-center gap-2 rounded-full bg-[var(--ink)] px-5 text-sm font-bold text-white shadow-[0_10px_30px_rgba(16,41,58,0.28)] transition-transform hover:-translate-y-0.5"
        >
          <Sparkles size={18} /> ถามน้องปลาทู
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-[1200] flex h-[560px] max-h-[calc(100dvh-2.5rem)] w-[calc(100vw-2.5rem)] max-w-[400px] flex-col overflow-hidden rounded-[20px] border border-[var(--border)] bg-white shadow-[0_20px_60px_rgba(16,41,58,0.25)]">
          <div className="flex items-center justify-between bg-[var(--ink)] px-4 py-3 text-white">
            <span className="flex items-center gap-2 text-sm font-bold">
              <Sparkles size={16} /> น้องปลาทู · ผู้ช่วยประจำวิทยาลัย
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="ปิด"
              className="rounded-lg p-1 transition-colors hover:bg-white/10"
            >
              <X size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <AIChatBox
              messages={messages}
              onSendMessage={handleSend}
              onStop={handleStop}
              isLoading={pending}
              height="100%"
              placeholder="ถามน้องปลาทูเกี่ยวกับวิทยาลัย…"
              emptyStateMessage="สวัสดีครับ น้องปลาทูเองครับ ถามเรื่องอาคาร สาขา ข่าวสาร หรือขอเส้นทางได้เลย"
              suggestedPrompts={[
                "ขอเส้นทางไปสาขาช่างยนต์",
                "สาขาการบัญชีอยู่อาคารไหน",
                "มีข่าวกิจกรรมอะไรล่าสุด",
                "อาคารเรียนสายอุตสาหกรรมมีสาขาอะไรบ้าง",
              ]}
            />
          </div>
        </div>
      )}
    </>
  );
}
