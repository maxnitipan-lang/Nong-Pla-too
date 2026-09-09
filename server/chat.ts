// Campus Q&A chatbot.
//
// Uses an OpenAI-compatible chat/completions endpoint. Defaults to Google
// Gemini (free tier, no credit card) but works with OpenAI, Groq, etc. by
// overriding CHAT_BASE_URL + CHAT_MODEL + the key.
//
//   GEMINI_API_KEY   your key from https://aistudio.google.com/apikey
//   CHAT_MODEL       (optional) default "gemini-flash-lite-latest"
//   CHAT_BASE_URL    (optional) default Gemini's OpenAI-compatible base
//   CHAT_API_KEY     (optional) alternative to GEMINI_API_KEY for other providers

import { getCampusBuildings, getCampusNews, getCampusSettings } from "./db";

const CHAT_BASE_URL =
  process.env.CHAT_BASE_URL ||
  "https://generativelanguage.googleapis.com/v1beta/openai";
// flash-lite has the most generous free-tier quota (the newest full models are
// capped at ~20 requests/day on the free tier).
const CHAT_MODEL = process.env.CHAT_MODEL || "gemini-flash-lite-latest";
const CHAT_API_KEY = process.env.CHAT_API_KEY || process.env.GEMINI_API_KEY || "";

const ROUTE_TOOL = "show_walking_route";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatAnswer = {
  reply: string;
  /** When set, the client opens the walking-route map for this building. */
  routeToBuildingId: string | null;
};

/** Whether an API key is configured. */
export const isChatConfigured = (): boolean => CHAT_API_KEY.length > 0;

function buildSystemPrompt(
  buildings: Awaited<ReturnType<typeof getCampusBuildings>>,
  news: Awaited<ReturnType<typeof getCampusNews>>,
  settings: Awaited<ReturnType<typeof getCampusSettings>>,
): string {
  const buildingLines = buildings
    .map(
      (b) =>
        `- id:${b.id} | ชื่อ: ${b.name} | กลุ่ม: ${b.category} | ${b.floors} ชั้น | รายละเอียด: ${b.description}`,
    )
    .join("\n");

  const newsLines = news
    .map((n) => `- [${n.date}] ${n.title}${n.link ? ` — ${n.link}` : ""}`)
    .join("\n");

  return [
    `คุณคือ "น้องปลาทู" ผู้ช่วยตอบคำถามประจำ "${settings.collegeName}" สำหรับนักเรียน ผู้ปกครอง และผู้มาติดต่อ`,
    'บุคลิก: แทนตัวเองว่า "น้องปลาทู" เสมอ (ห้ามใช้ ผม/ดิฉัน/ฉัน/เรา) และลงท้ายประโยคด้วย "ครับ" เสมอ (ห้ามใช้ ค่ะ/นะคะ) พูดจาเป็นกันเองแต่สุภาพ',
    'เมื่อผู้ใช้ทักทาย (เช่น "สวัสดี" "หวัดดี" "hello") ให้ตอบทำนองว่า: "สวัสดีครับ ยินดีต้อนรับสู่' +
      settings.collegeName +
      'ครับ มีอะไรให้น้องปลาทูช่วยไหมครับ"',
    `ที่อยู่วิทยาลัย: ${settings.address}`,
    settings.contactEmail ? `อีเมลติดต่อ: ${settings.contactEmail}` : "",
    "",
    "== รายชื่ออาคาร/หน่วยงาน (แต่ละบรรทัดขึ้นต้นด้วย id ของอาคาร) ==",
    "หมายเหตุ: ชื่ออาคารสาขาวิชาส่วนใหญ่ = สาขาวิชาที่อยู่ในอาคารนั้น เวลาตอบให้พูดชื่อครั้งเดียว ห้ามพูดซ้ำแบบ 'อาคาร X มีสาขา X'",
    buildingLines || "(ยังไม่มีข้อมูล)",
    "",
    "== ข่าวสารล่าสุด ==",
    newsLines || "(ยังไม่มีข่าว)",
    "",
    "== กติกาการตอบ ==",
    "1. ตอบเป็นภาษาไทย สุภาพ กระชับ ตรงประเด็น",
    "2. ใช้เฉพาะข้อมูลข้างต้น ห้ามแต่งชื่ออาคาร แผนก หรือข่าวที่ไม่มีในรายการ",
    `3. ถ้าไม่มีข้อมูลให้บอกตรง ๆ ว่าไม่ทราบ และแนะนำให้ติดต่อวิทยาลัย${
      settings.contactEmail ? ` ที่ ${settings.contactEmail}` : ""
    }`,
    `4. ถ้าผู้ใช้ขอเส้นทาง / วิธีไป / นำทาง ไปอาคารใดอาคารหนึ่ง ให้เรียกฟังก์ชัน ${ROUTE_TOOL} พร้อม buildingId (id จากรายการด้านบน) ของอาคารนั้น แทนการอธิบายเส้นทางด้วยข้อความ`,
    "5. ตอบสั้น กระชับ อ่านง่าย:",
    "   - ถ้ามีหลายรายการ (ตั้งแต่ 2 ข้อขึ้นไป) ให้ทำเป็น bullet list ขึ้นต้นบรรทัดด้วย '- ' ห้ามเขียนต่อกันยาว ๆ ในย่อหน้าเดียว",
    "   - เกริ่นนำ 1 บรรทัดสั้น ๆ ก่อนลิสต์ แล้วขึ้นบรรทัดใหม่",
    "   - แต่ละย่อหน้าไม่เกิน 2 ประโยค เว้นบรรทัดว่างระหว่างย่อหน้า",
    "   - ใช้ **ตัวหนา** เฉพาะชื่ออาคารหรือคำสำคัญ ใช้พอประมาณ",
  ]
    .filter(Boolean)
    .join("\n");
}

type OpenAiChoice = {
  finish_reason?: string;
  message?: {
    content?: string | null;
    tool_calls?: {
      function?: { name?: string; arguments?: string };
    }[];
  };
};

/** Send the conversation to the model and return the assistant answer. */
export async function askCampusChat(history: ChatMessage[]): Promise<ChatAnswer> {
  if (!CHAT_API_KEY) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในไฟล์ .env — ขอ key ฟรีที่ https://aistudio.google.com/apikey",
    );
  }

  const [buildings, news, settings] = await Promise.all([
    getCampusBuildings(),
    getCampusNews(),
    getCampusSettings(),
  ]);
  const byId = new Map(buildings.map((b) => [b.id, b]));
  const routableIds = buildings
    .filter((b) => b.latitude && b.longitude)
    .map((b) => b.id);

  // Keep only the last few user/assistant turns; the system prompt is rebuilt
  // fresh so the model always has current building/news data.
  const turns = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-10);

  const requestBody = JSON.stringify({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: buildSystemPrompt(buildings, news, settings) },
      ...turns,
    ],
    temperature: 0.3,
    max_tokens: 800,
    tools: routableIds.length
      ? [
          {
            type: "function",
            function: {
              name: ROUTE_TOOL,
              description:
                "แสดงแผนที่เส้นทางเดินไปยังอาคารในเว็บ ใช้เมื่อผู้ใช้ขอเส้นทาง วิธีไป หรือการนำทางไปอาคาร",
              parameters: {
                type: "object",
                properties: {
                  buildingId: { type: "string", enum: routableIds },
                },
                required: ["buildingId"],
              },
            },
          },
        ]
      : undefined,
  });

  let lastStatus = 0;
  let lastNetworkError = "";
  // 503 = transient capacity, worth a quick retry. 429 = per-minute quota, retrying
  // in-request won't help so fail fast with a clear message.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * attempt));

    let res: Response;
    // Gemini can hold the connection open without ever responding; without a
    // timeout the tRPC call hangs forever and the chat spinner never clears.
    // The signal also aborts a stalled body read below.
    const signal = AbortSignal.timeout(30_000);
    try {
      res = await fetch(`${CHAT_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CHAT_API_KEY}`,
        },
        body: requestBody,
        signal,
      });
    } catch (error) {
      lastNetworkError = signal.aborted
        ? "หมดเวลารอ AI ตอบกลับ"
        : error instanceof Error
          ? error.message
          : "unknown network error";
      continue;
    }

    if (res.ok) {
      let data: { choices?: OpenAiChoice[] };
      try {
        data = (await res.json()) as { choices?: OpenAiChoice[] };
      } catch (error) {
        lastNetworkError = signal.aborted
          ? "หมดเวลารอ AI ตอบกลับ"
          : error instanceof Error
            ? error.message
            : "unknown parse error";
        continue;
      }
      const choice = data?.choices?.[0];
      const message = choice?.message;

      const toolCall = message?.tool_calls?.find(
        (c) => c.function?.name === ROUTE_TOOL,
      );
      if (toolCall) {
        let buildingId: string | null = null;
        try {
          buildingId = JSON.parse(toolCall.function?.arguments ?? "{}")
            ?.buildingId;
        } catch {
          buildingId = null;
        }
        const target = buildingId ? byId.get(buildingId) : undefined;
        if (target) {
          return {
            reply:
              message?.content?.trim() ||
              `เปิดแผนที่เส้นทางเดินไป "${target.name}" ให้แล้วครับ 👇`,
            routeToBuildingId: target.id,
          };
        }
      }

      const content = message?.content?.trim();
      if (!content) throw new Error("AI ไม่ได้ตอบกลับข้อความ");
      return { reply: content, routeToBuildingId: null };
    }

    lastStatus = res.status;
    if (res.status === 429) {
      throw new Error(
        "ถามบ่อยเกินไป (เกินโควตาต่อนาทีของ AI ฟรี) — รอสักครู่แล้วลองใหม่",
      );
    }
    if (res.status !== 503) {
      const detail = await res.text().catch(() => "");
      let apiMessage = "";
      try {
        const parsed = JSON.parse(detail.replace(/^\[|\]$/g, ""));
        apiMessage = parsed?.error?.message ?? "";
      } catch {
        apiMessage = detail.slice(0, 200);
      }
      throw new Error(
        `บริการ AI ตอบกลับผิดพลาด (${res.status})${apiMessage ? `: ${apiMessage}` : ""}`,
      );
    }
  }

  if (lastStatus) {
    throw new Error(
      `บริการ AI มีผู้ใช้งานหนาแน่น (${lastStatus}) — กรุณาลองใหม่อีกครั้งในอีกสักครู่`,
    );
  }
  throw new Error(
    `เชื่อมต่อบริการ AI ไม่ได้ (${lastNetworkError}) — กรุณาลองใหม่อีกครั้ง`,
  );
}
