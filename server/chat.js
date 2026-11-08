// Campus Q&A chatbot.
//
// Uses an OpenAI-compatible chat/completions endpoint. Defaults to Google
// Gemini (free tier, no credit card) but works with OpenAI, Groq, etc. by
// overriding CHAT_BASE_URL + CHAT_MODEL + the key.
//
//   GEMINI_API_KEY   your key from https://aistudio.google.com/apikey
//   CHAT_MODEL       (optional) default "gemini-3.1-flash-lite"
//   CHAT_BASE_URL    (optional) default Gemini's OpenAI-compatible base
//   CHAT_API_KEY     (optional) alternative to GEMINI_API_KEY for other providers

import { describeLocation, locateBuilding } from "./buildingLocation.js";
import { COLLEGE_FACTS, PROGRAMMES_AS_OF, collegeFactLines, peopleLines, programmeLines } from "../shared/collegeFacts.js";
import { answerFromFaq } from "./chatFaq.js";
import { fixWrongKeyboard } from "../shared/thaiKeyboard.js";
import { cleanForSpeech } from "../shared/speechText.js";
import { prepareSpeech } from "./voice.js";
import { withDepartmentInfo } from "../shared/departmentInfo.js";
import { staffLines } from "../shared/staffDirectory.js";
import { getCampusBuildings, getCampusNews, getCampusSettings } from "./db.js";

const CHAT_BASE_URL = process.env.CHAT_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai";
// A pinned flash-lite model: generous free-tier quota AND consistently fast
// (~3-5s). The "-latest" alias has been resolving to a build that takes
// 30-60s per reply, which makes the chat look hung.
const CHAT_MODEL = process.env.CHAT_MODEL || "gemini-3.1-flash-lite";
const CHAT_API_KEY = process.env.CHAT_API_KEY || process.env.GEMINI_API_KEY || "";

const ROUTE_TOOL = "show_walking_route";

/** Whether an API key is configured. */
export const isChatConfigured = () => CHAT_API_KEY.length > 0;

/** One line per department: where it is, what students learn, careers (for "which department…" questions). */
function departmentLines(buildings) {
  const seen = new Set();
  const lines = [];
  for (const b of buildings) {
    for (const raw of b.departments ?? []) {
      if (!/^สาขา/.test(raw.name ?? "") || seen.has(raw.name)) continue;
      seen.add(raw.name);
      const d = withDepartmentInfo(raw);
      lines.push(
        [
          `- ${d.name}`,
          `อยู่ที่: ${b.name}`,
          d.programmes &&
            `เปิดสอน: ${Object.entries(d.programmes)
              .map(([level, names]) => (names.length ? `${level} ${names.join(", ")}` : `${level} ไม่เปิดสอน`))
              .join(" / ")}`,
          d.description && `เรียน: ${d.description}`,
          d.careers?.length && `อาชีพ: ${d.careers.join(", ")}`,
        ]
          .filter(Boolean)
          .join(" | ")
      );
    }
  }
  return lines.join("\n");
}

/** Questions about people (teachers, who to contact): only then is the long staff list sent. */
const ABOUT_PEOPLE = /ครู|อาจารย์|ใคร|หัวหน้า|ติดต่อ|ชื่อ|ทุน|ผู้อำนวยการ|ผอ|รอง|ดูแล|รับผิดชอบ|พบ|คุยกับ/;

function buildSystemPrompt(buildings, news, settings, spoken = false, kiosk = null, aboutPeople = false) {
  const buildingLines = buildings
    .map(b => {
      // Rooms per floor + kiosk departments, so "สาขา X อยู่ไหน" can be answered.
      const floors = b.floorsDetail
        .filter(f => f.rooms.length)
        .map(f => `${f.label}: ${f.rooms.join(", ")}`)
        .join(" / ");
      const departments = (b.departments ?? [])
        .filter(d => d.name && !b.floorsDetail.some(f => f.rooms.includes(d.name)))
        .map(d => `${d.name} (ชั้น ${d.floor})`)
        .join(", ");
      // Where it is on campus, worked out from the coordinates (side of campus, neighbours, distance from the kiosk).
      const where = describeLocation(locateBuilding(b, buildings, kiosk));
      return [
        `- id:${b.id} | ชื่อ: ${b.name} | กลุ่ม: ${b.category} | ${b.floors} ชั้น | รายละเอียด: ${b.description}`,
        where && `ตำแหน่ง: ${where}`,
        floors && `ห้อง/หน่วยงาน: ${floors}`,
        departments && `สาขา: ${departments}`,
      ]
        .filter(Boolean)
        .join(" | ");
    })
    .join("\n");

  const newsLines = news.map(n => `- [${n.date}] ${n.title}${n.link ? ` — ${n.link}` : ""}`).join("\n");

  return [
    `คุณคือ "น้องปลาทู" ผู้ช่วยตอบคำถามประจำ "${settings.collegeName}" สำหรับนักเรียน ผู้ปกครอง และผู้มาติดต่อ`,
    'บุคลิก: เป็นผู้ชาย แทนตัวเองว่า "ผม" หรือ "น้องปลาทู" (ห้ามใช้ ดิฉัน/ฉัน/หนู) และลงท้ายประโยคด้วย "ครับ" เสมอ (ห้ามใช้ ค่ะ/นะคะ) พูดจาเป็นกันเองแต่สุภาพ',
    'เมื่อผู้ใช้ทักทาย (เช่น "สวัสดี" "หวัดดี" "hello") ให้ตอบทำนองว่า: "สวัสดีครับ ยินดีต้อนรับสู่' +
      settings.collegeName +
      'ครับ มีอะไรให้น้องปลาทูช่วยไหมครับ"',
    `ที่อยู่วิทยาลัย: ${settings.address}`,
    settings.contactEmail ? `อีเมลติดต่อ: ${settings.contactEmail}` : "",
    "",
    "== ข้อมูลวิทยาลัย (จากเว็บไซต์วิทยาลัย) ==",
    ...collegeFactLines(),
    ...peopleLines(),
    ...(aboutPeople ? staffLines() : ["(รายชื่อครูและหัวหน้างานมีในระบบ แต่ไม่ได้แนบมากับคำถามนี้)"]),
    "",
    "== รายชื่ออาคาร/หน่วยงาน (แต่ละบรรทัดขึ้นต้นด้วย id ของอาคาร) ==",
    "หมายเหตุ: ชื่ออาคารสาขาวิชาส่วนใหญ่ = สาขาวิชาที่อยู่ในอาคารนั้น เวลาตอบให้พูดชื่อครั้งเดียว ห้ามพูดซ้ำแบบ 'อาคาร X มีสาขา X'",
    buildingLines || "(ยังไม่มีข้อมูล)",
    "",
    "== สาขาวิชาที่เปิดสอน (ทุกสาขาเรียนได้ทั้งชายและหญิง) ==",
    departmentLines(buildings) || "(ยังไม่มีข้อมูล)",
    "",
    `== หลักสูตรที่เปิดสอนอย่างเป็นทางการ (ข้อมูล ณ ${PROGRAMMES_AS_OF}) — ใช้ชื่อตามนี้เมื่อถามว่าเปิดสอนอะไร ==`,
    ...programmeLines(),
    "",
    "== ข่าวสารล่าสุด ==",
    newsLines || "(ยังไม่มีข่าว)",
    "",
    "== กติกาการตอบ ==",
    "1. ตอบเป็นภาษาไทย สุภาพ กระชับ ตรงประเด็น",
    "1.1 พูดเหมือนรุ่นพี่ใจดีที่คุยกับน้องหรือผู้ปกครองต่อหน้า ไม่ใช่ประกาศทางการ:",
    "   - ใช้ภาษาพูดทั่วไป เช่น 'อยู่ตึก…เลยครับ' 'ได้ครับ' 'ลองดู…นะครับ' แทน 'สามารถติดต่อสอบถามได้ที่' 'ทั้งนี้' 'ดังนี้ครับ' 'ในขณะนี้'",
    "   - ประโยคแรกตอบคำถามทันที ห้ามเกริ่นยาว ห้ามขึ้นต้นด้วย 'สำหรับ…' หรือ 'ต้องขออภัยด้วยครับ'",
    "   - ใส่ 'ครับ' ท้ายประโยคหลักพอ ไม่ต้องทุกประโยค และไม่เรียกตัวเองว่า 'น้องปลาทู' ทุกครั้ง ใช้ 'ผม' ได้",
    "   - ถ้าคุยต่อเนื่อง ให้อ้างถึงสิ่งที่ถามก่อนหน้าได้อย่างเป็นธรรมชาติ เช่น 'ส่วนช่างยนต์ที่ถามเมื่อกี้…'",
    "2. ใช้เฉพาะข้อมูลข้างต้น ห้ามแต่งชื่ออาคาร แผนก ข่าว ตัวเลข หรือบอกว่าหน่วยงานใดอยู่อาคารไหน ถ้ารายการอาคารไม่ได้ระบุไว้ (เช่น ห้ามเดาว่าฝ่ายกิจการนักเรียน ฝ่ายวิชาการ หรือห้องสมุดอยู่อาคาร 85 ปี) — ถ้าไม่รู้ว่าอยู่ไหน ให้แนะนำถามที่งานทะเบียนแทน",
    `3. ถ้าไม่มีข้อมูล ให้บอกสั้น ๆ 1 ประโยคว่าน้องปลาทูยังไม่มีข้อมูลเรื่องนี้ แล้วแนะนำทางเดียวที่ตรงที่สุด (เช่น สอบถามงานทะเบียน หรือโทร ${COLLEGE_FACTS.phone}) ห้ามขอโทษซ้ำหลายรอบ`,
    "3.1 ใส่เบอร์โทร/อีเมลเฉพาะเมื่อไม่มีข้อมูลตอบ หรือผู้ใช้ถามช่องทางติดต่อเท่านั้น ห้ามต่อท้ายทุกคำตอบ และห้ามปิดท้ายด้วย 'มีอะไรให้ช่วยอีกไหมครับ' ทุกครั้ง",
    "3.2 เฉพาะเมื่อคำถามพูดถึงเพศ (ผู้หญิง ผู้ชาย) ให้ตอบว่าทุกสาขาเรียนได้ทุกเพศ แล้วแนะนำตามความสนใจ ห้ามแบ่งสาขาตามเพศ — ถ้าคำถามไม่ได้พูดถึงเพศ ไม่ต้องพูดเรื่องนี้",
    "3.3 ถ้าถามว่ามีสาขาเกี่ยวกับเรื่องใด ให้ไล่ดูรายการสาขาวิชาด้านบนให้ครบ แล้วบอกทุกสาขาที่เกี่ยวข้อง",
    "3.4 ถ้าชื่อสาขาที่ถามมีอยู่ในรายการหลักสูตรอย่างเป็นทางการ (เช่น การเลขานุการ เทคโนโลยีสารสนเทศ) ให้ยืนยันด้วยชื่อนั้นตรง ๆ พร้อมระดับที่เปิดสอน ห้ามบอกเป็นสาขาอื่นแทน",
    "4. ถ้าผู้ใช้ถามว่าอาคาร สาขา หรือห้องอยู่ตรงไหน ให้บอกตำแหน่งจากช่อง ตำแหน่ง: ของอาคารนั้น (อยู่ฝั่งไหนของวิทยาลัย ใกล้อาคารอะไร) และชั้นถ้ามีข้อมูล",
    `5. ถ้าผู้ใช้ขอเส้นทาง / วิธีไป / นำทาง ไปอาคารใดอาคารหนึ่ง ให้เรียกฟังก์ชัน ${ROUTE_TOOL} พร้อม buildingId (id จากรายการด้านบน) ของอาคารนั้น แทนการอธิบายเส้นทางด้วยข้อความ`,
    "6. คำถามนอกเรื่องวิทยาลัย แบ่งเป็น 2 แบบ:",
    "   6.1 คุยเล่น/คำถามทั่วไปที่ไม่มีอันตราย (ทักทาย ถามความรู้สึก ความรู้ทั่วไปง่าย ๆ เช่น ปลาทูกินกับอะไร สมุทรสงครามมีที่เที่ยวอะไร คำศัพท์ภาษาอังกฤษสั้น ๆ): ตอบได้แบบเป็นกันเอง สนุก มีอารมณ์ขันเล็กน้อยในฐานะ 'ปลาทูแม่กลอง' 1–2 ประโยค แล้วชวนกลับมาเรื่องในวิทยาลัยแบบไม่ยัดเยียด (เช่น เสนอพาไปดูสาขาหรือแผนที่) ถ้าไม่แน่ใจข้อเท็จจริง ให้บอกว่าไม่แน่ใจ ห้ามแต่ง",
    "   6.2 เรื่องที่ไม่ควรตอบ: ทำการบ้าน/ข้อสอบ/รายงานแทน, การเมือง, ศาสนา, การพนัน/หวย, การลงทุน, เรื่องผู้ใหญ่, ความรุนแรง, ข้อมูลส่วนตัวของบุคคล: ปฏิเสธอย่างสุภาพและอบอุ่น 1 ประโยค ไม่ตำหนิผู้ถาม แล้วเสนอสิ่งที่ช่วยได้แทน (เช่น การบ้านแนะนำให้ปรึกษาครู)",
    "   6.3 ถ้าผู้ใช้ดูเครียด เศร้า หรือท้อ ให้ตอบอย่างเห็นใจ ให้กำลังใจสั้น ๆ และแนะนำให้คุยกับครูที่ปรึกษาหรือฝ่ายกิจการนักเรียน; ถ้าพูดถึงการทำร้ายตัวเอง ให้แนะนำโทรสายด่วนสุขภาพจิต 1323 ทันที",
    // Lists and bold are for the screen; spoken answers follow the voice rules below instead.
    ...(spoken
      ? ["7. ตอบสั้น กระชับ เป็นประโยคพูดต่อเนื่อง ไม่เกิน 3 ประโยค (ดูกติกาโหมดเสียงด้านล่าง)"]
      : [
          "7. ตอบสั้น กระชับ อ่านง่าย ทั้งคำตอบไม่เกิน 5 บรรทัด:",
          "   - ถ้ามีหลายรายการ (ตั้งแต่ 2 ข้อขึ้นไป) ให้ทำเป็น bullet list ขึ้นต้นบรรทัดด้วย '- ' ห้ามเขียนต่อกันยาว ๆ ในย่อหน้าเดียว",
          "   - เกริ่นนำ 1 บรรทัดสั้น ๆ ก่อนลิสต์ แล้วขึ้นบรรทัดใหม่",
          "   - แต่ละย่อหน้าไม่เกิน 2 ประโยค เว้นบรรทัดว่างระหว่างย่อหน้า",
          "   - ใช้ **ตัวหนา** เฉพาะชื่ออาคารหรือคำสำคัญ ใช้พอประมาณ",
        ]),
    spoken
      ? [
          "",
          "== โหมดสนทนาด้วยเสียง (คำตอบจะถูกอ่านออกเสียงบนตู้/มือถือ) ==",
          "- ตอบสั้นแบบพูดคุย ไม่เกิน 3 ประโยค (ประมาณ 50 คำ) เหมือนคุยกับคนตรงหน้า ประโยคแรกให้สั้นและตอบตรงคำถามทันที ห้ามขึ้นต้นด้วยคำทักทายถ้าผู้ใช้ไม่ได้ทักทาย ถ้ามีหลายรายการให้บอกไม่เกิน 3 รายการแล้วถามว่าอยากรู้อันไหนเพิ่ม",
          "- ห้ามใช้ markdown, bullet, ตัวหนา, ลิงก์ URL, อีโมจิ หรือสัญลักษณ์พิเศษ",
          "- เขียนตัวเลขและหน่วยให้อ่านออกเสียงได้เป็นธรรมชาติ เช่น '200 เมตร' ไม่ใช่ '200 ม.'",
          "- ถ้าคำถามฟังไม่ชัดหรือกำกวม ให้ถามกลับสั้น ๆ ว่าหมายถึงอะไร",
          "- ประโยคแรกให้สั้นมาก (ไม่เกิน 8 คำ) เช่น 'ได้เลยครับ' 'อยู่ตึก ICT ครับ' แล้วค่อยขยายในประโยคถัดไป — เสียงจะเริ่มพูดได้เร็วขึ้น",
          "- เขียนให้ฟังลื่นเหมือนคนพูด: ใช้คำเชื่อมอย่าง 'แล้วก็' 'ส่วน' 'ถ้า…ก็…' แทนการไล่รายการ และไม่ใช้วงเล็บ",
        ].join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Send the conversation to the model and return the assistant answer. */
const NO_AI_REPLY =
  "น้องปลาทูตอบคำถามนี้ไม่ได้ตอนนี้ครับ ลองถามเรื่องพื้นฐาน เช่น \"ไปงานทะเบียนยังไง\" \"มีสาขาอะไรบ้าง\" หรือ \"เบอร์โทรวิทยาลัย\" ได้เลยครับ";
const BUSY_REPLY = "ตอนนี้มีคนถามน้องปลาทูเยอะมากครับ รอสักครู่แล้วถามใหม่อีกครั้งนะครับ";
const DOWN_REPLY = `ขออภัยครับ ตอนนี้น้องปลาทูตอบคำถามนี้ไม่ได้ชั่วคราว ลองถามใหม่อีกครั้ง หรือโทรสอบถามวิทยาลัย ${COLLEGE_FACTS.phone} ได้เลยครับ`;

/** "ข่าวล่าสุดมีอะไรบ้าง" — answered straight from the news list (instant, no AI needed). */
function newsAnswer(question, news) {
  const q = question.replace(/\s+/g, "");
  if (!/ข่าว|ประกาศ|กิจกรรมล่าสุด/.test(q) || !/ล่าสุด|อะไรบ้าง|มีอะไร|ใหม่|วันนี้/.test(q) || !news.length) return null;
  const items = news.slice(0, 3).map(n => `- ${n.title}${n.date ? ` (${n.date})` : ""}`);
  return ["ข่าวล่าสุดของวิทยาลัยครับ", ...items, "", "ดูข่าวทั้งหมดพร้อมรูปได้ที่เมนูข่าวสารครับ"].join("\n");
}

/**
 * Answer a chat message. If the AI service fails (busy, quota, network), the visitor gets a
 * polite reply instead of a "server error" — only a missing API key is reported as an error.
 */
export async function askCampusChat(history, options = {}) {
  try {
    const answer = await answerChat(history, options);
    // The browser will read this aloud with the AI voice: start making that voice now.
    if (options.aiVoice) prepareSpeech(cleanForSpeech(answer.reply));
    return answer;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[Chat] AI answer failed:", message);
    if (/GEMINI_API_KEY/.test(message)) {
      return { reply: NO_AI_REPLY, routeToBuildingId: null, source: "fallback" };
    }
    return { reply: /429|ถามบ่อย|หนาแน่น|โควตา/.test(message) ? BUSY_REPLY : DOWN_REPLY, routeToBuildingId: null, source: "fallback" };
  }
}

async function answerChat(history, options) {
  // "g[njv" = "เบื่อ" typed with the keyboard on English: answer the Thai, and say so.
  const lastIndex = history.findLastIndex(m => m.role === "user");
  const fixed = lastIndex >= 0 ? fixWrongKeyboard(history[lastIndex].content) : null;
  if (fixed) {
    history = history.map((m, i) => (i === lastIndex ? { ...m, content: fixed } : m));
    const answer = await answerChat(history, options);
    return { ...answer, reply: `(น้องปลาทูเข้าใจว่าพิมพ์ว่า "${fixed}" — แป้นพิมพ์เป็นภาษาอังกฤษอยู่นะครับ)

${answer.reply}` };
  }
  const [buildings, news, settings] = await Promise.all([getCampusBuildings(), getCampusNews(), getCampusSettings()]);

  // Greetings, common and off-topic questions, "where is X": answer from the
  // ready-made set — instant, and no AI tokens spent.
  const lastUser = history.filter(m => m.role === "user").at(-1)?.content ?? "";
  const kiosk = options.atKiosk ? settings.kiosk : null;
  const ready = answerFromFaq(lastUser, buildings, settings, kiosk);
  if (ready) {
    // Spoken: no bold or bullet marks (they're read out or sound odd) — list lines become one sentence.
    const reply = options.spoken
      ? ready.reply.replace(/\*\*/g, "").replace(/\n\s*[-•]\s+/g, " · ").replace(/\n+/g, " ").trim()
      : ready.reply;
    return { reply, routeToBuildingId: ready.routeToBuildingId, action: ready.action ?? null, faqId: ready.faqId, source: "faq" };
  }
  const latestNews = newsAnswer(lastUser, news);
  if (latestNews) return { reply: latestNews, routeToBuildingId: null, action: "open-news", source: "news" };

  if (!CHAT_API_KEY) {
    throw new Error("ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในไฟล์ .env — ขอ key ฟรีที่ https://aistudio.google.com/apikey");
  }
  const byId = new Map(buildings.map(b => [b.id, b]));
  const routableIds = buildings.filter(b => b.latitude && b.longitude).map(b => b.id);

  // Keep only the last few user/assistant turns; the system prompt is rebuilt
  // fresh so the model always has current building/news data.
  const turns = history.filter(m => m.role === "user" || m.role === "assistant").slice(-10);

  const requestBody = JSON.stringify({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: buildSystemPrompt(buildings, news, settings, options.spoken, kiosk, turns.some(m => m.role === "user" && ABOUT_PEOPLE.test(m.content))) },
      ...turns,
    ],
    temperature: 0.3,
    // Spoken replies are read aloud: keep them short so the voice starts and ends quickly.
    max_tokens: options.spoken ? 300 : 800,
    tools: routableIds.length
      ? [
          {
            type: "function",
            function: {
              name: ROUTE_TOOL,
              description: "แสดงแผนที่เส้นทางเดินไปยังอาคารในเว็บ ใช้เมื่อผู้ใช้ขอเส้นทาง วิธีไป หรือการนำทางไปอาคาร",
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
    if (attempt > 0) await new Promise(r => setTimeout(r, 500 * attempt));

    let res;
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
      let data;
      try {
        data = await res.json();
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

      const toolCall = message?.tool_calls?.find(c => c.function?.name === ROUTE_TOOL);
      if (toolCall) {
        let buildingId = null;
        try {
          buildingId = JSON.parse(toolCall.function?.arguments ?? "{}")?.buildingId;
        } catch {
          buildingId = null;
        }
        const target = buildingId ? byId.get(buildingId) : undefined;
        if (target) {
          return {
            reply: message?.content?.trim() || `เปิดแผนที่เส้นทางเดินไป "${target.name}" ให้แล้วครับ 👇`,
            routeToBuildingId: target.id,
            source: "ai",
          };
        }
      }

      // The model sometimes doubles the polite ending ("นะครับครับ").
      let content = message?.content?.trim().replace(/(ครับ)(\s*ครับ)+/g, "$1");
      // Spoken answers are read aloud: no bold, no list markers, no blank lines.
      if (content && options.spoken) content = content.replace(/\*\*/g, "").replace(/^\s*[-•]\s+/gm, "").replace(/\n{2,}/g, "\n");
      if (!content) throw new Error("AI ไม่ได้ตอบกลับข้อความ");
      return { reply: content, routeToBuildingId: null, source: "ai" };
    }

    lastStatus = res.status;
    if (res.status === 429) {
      throw new Error("ถามบ่อยเกินไป (เกินโควตาต่อนาทีของ AI ฟรี) — รอสักครู่แล้วลองใหม่");
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
      throw new Error(`บริการ AI ตอบกลับผิดพลาด (${res.status})${apiMessage ? `: ${apiMessage}` : ""}`);
    }
  }

  if (lastStatus) {
    throw new Error(`บริการ AI มีผู้ใช้งานหนาแน่น (${lastStatus}) — กรุณาลองใหม่อีกครั้งในอีกสักครู่`);
  }
  throw new Error(`เชื่อมต่อบริการ AI ไม่ได้ (${lastNetworkError}) — กรุณาลองใหม่อีกครั้ง`);
}
