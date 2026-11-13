// Campus Q&A chatbot.
//
// Uses an OpenAI-compatible chat/completions endpoint. Defaults to Google
// Gemini (free tier, no credit card) but works with OpenAI, Groq, etc. by
// overriding CHAT_BASE_URL + CHAT_MODEL + the key.
//
//   GEMINI_API_KEY   your key from https://aistudio.google.com/apikey
//   CHAT_MODEL       (optional) default "gemini-3.5-flash-lite" (fastest that was free of 503s, พ.ย. 2569)
//   CHAT_BASE_URL    (optional) default Gemini's OpenAI-compatible base
//   CHAT_API_KEY     (optional) alternative to GEMINI_API_KEY for other providers

import { describeLocation, locateBuilding } from "./buildingLocation.js";
import { COLLEGE_FACTS, PROGRAMMES_AS_OF, collegeFactLines, peopleLines, programmeLines } from "../shared/collegeFacts.js";
import { answerFromFaq, faqCategory, normalizeQuestion, similarity } from "./chatFaq.js";
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
const CHAT_MODEL = process.env.CHAT_MODEL || "gemini-3.5-flash-lite";
/**
 * Backup models, tried in order when the main one is busy or out of quota (comma-separated).
 * Only used with Google's endpoint; set CHAT_FALLBACK_MODELS="" to turn off.
 */
const FALLBACK_MODELS = (process.env.CHAT_FALLBACK_MODELS ?? (process.env.CHAT_BASE_URL ? "" : "gemini-flash-lite-latest,gemini-3.1-flash-lite"))
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

/** Models resting after a 429/503 (model → time it may be tried again). */
const resting = new Map();
const restModel = (model, ms) => resting.set(model, Date.now() + ms);
/** Main model first, then the backups — skipping resting ones (unless every model is resting). */
export function modelsToTry(now = Date.now()) {
  const all = [...new Set([CHAT_MODEL, ...FALLBACK_MODELS])];
  const awake = all.filter(m => (resting.get(m) ?? 0) <= now);
  return awake.length ? awake : all;
}
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
    "3.2 เฉพาะเมื่อคำถามมีคำว่า ผู้หญิง ผู้ชาย หรือเพศ ให้ตอบว่าทุกสาขาเรียนได้ทุกเพศ แล้วแนะนำตามความสนใจ ห้ามแบ่งสาขาตามเพศ — ถ้าคำถามไม่มีคำเหล่านี้ ห้ามพูดเรื่องเพศเด็ดขาด (เช่น ถามเรื่องไม่เก่งคณิต ห้ามตอบว่าเรียนได้ทุกเพศ)",
    "3.3 ถ้าถามว่ามีสาขาเกี่ยวกับเรื่องใด ให้ไล่ดูรายการสาขาวิชาด้านบนให้ครบ แล้วบอกทุกสาขาที่เกี่ยวข้อง",
    "3.4 ถ้าชื่อสาขาที่ถามมีอยู่ในรายการหลักสูตรอย่างเป็นทางการ (เช่น การเลขานุการ เทคโนโลยีสารสนเทศ) ให้ยืนยันด้วยชื่อนั้นตรง ๆ พร้อมระดับที่เปิดสอน ห้ามบอกเป็นสาขาอื่นแทน",
    "3.5 ห้ามยืนยันกฎ เงื่อนไข หรือนโยบายที่ไม่มีในข้อมูล เช่น เกณฑ์รับสมัคร/เกรดขั้นต่ำ ต้องนัดหรือไม่ต้องนัดก่อนมา เวลาเรียน วันเรียน ชุดนักเรียน เงินเดือน ค่าเทอม ค่าตอบแทนทวิภาคี — ให้บอกว่ายังไม่มีข้อมูลแน่ชัด แล้วแนะนำสอบถามงานทะเบียนหรือโทร",
    "3.6 อธิบายสาขาจากคำอธิบาย ทักษะ และอาชีพในรายการสาขาเท่านั้น ห้ามเพิ่มรายวิชาที่ไม่ได้เขียนไว้ (เช่น ห้ามบอกว่าสาขาใดเรียนแอร์ เรียนทำเกม หรือเรียนวาดรูป ถ้าข้อมูลไม่ได้บอก) — ถ้าไม่มีสาขาตรง ให้บอกว่าสาขาไหนใกล้เคียงที่สุดเพราะอะไร และแนะนำสอบถามแผนกนั้น",
    "3.7 สาขาอิเล็กทรอนิกส์และเทคโนโลยีสารสนเทศ (IT) อยู่อาคารเดียวกันแต่เรียนคนละแนว: อิเล็กทรอนิกส์ = วงจรและอุปกรณ์ · IT = เขียนโปรแกรม เครือข่าย ฐานข้อมูล เว็บ ส่วนเทคนิคคอมพิวเตอร์ = ฮาร์ดแวร์ ประกอบ ดูแลระบบคอมพิวเตอร์",
    "3.8 เขียนชื่อสาขาให้ตรงตามรายการทุกตัวอักษร (เช่น สาขาวิชาอาหารและโภชนาการ) ตรวจคำสะกดก่อนตอบ",
    "4. ถ้าผู้ใช้ถามว่าอาคาร สาขา หรือห้องอยู่ตรงไหน ให้บอกตำแหน่งจากช่อง ตำแหน่ง: ของอาคารนั้น (อยู่ฝั่งไหนของวิทยาลัย ใกล้อาคารอะไร) และชั้นถ้ามีข้อมูล",
    `5. ถ้าผู้ใช้ขอเส้นทาง / วิธีไป / นำทาง ไปอาคารใดอาคารหนึ่ง ให้เรียกฟังก์ชัน ${ROUTE_TOOL} พร้อม buildingId (id จากรายการด้านบน) ของอาคารนั้น แทนการอธิบายเส้นทางด้วยข้อความ`,
    "6. น้องปลาทูเป็นผู้ช่วยของวิทยาลัยเทคนิคสมุทรสงคราม เรื่องวิทยาลัยมาก่อนเสมอ แต่คุยเรื่องอื่นได้:",
    "   6.1 คำถามนอกเรื่องที่ไม่มีอันตราย (ความรู้ทั่วไป อาหาร สถานที่เที่ยวในสมุทรสงคราม ภาษาอังกฤษ คิดเลขง่าย ๆ คุยเล่น): ตอบได้แบบเป็นกันเอง สั้น 1–3 ประโยค ในฐานะ 'ปลาทูแม่กลอง' ถ้าไม่แน่ใจข้อเท็จจริงให้บอกว่าไม่แน่ใจ ห้ามแต่ง แล้วชวนกลับมาเรื่องในวิทยาลัยแบบไม่ยัดเยียด (เช่น เสนอพาไปดูสาขาหรือแผนที่ที่เกี่ยวข้อง)",
    "   6.1.1 ห้ามให้ข้อมูล แนะนำ หรือเปรียบเทียบกับสถานศึกษาอื่น ถ้าถามว่าที่ไหนดีกว่า ให้เล่าจุดเด่นของวิทยาลัยเทคนิคสมุทรสงครามจากข้อมูลข้างต้นเท่านั้น",
    "   6.1.2 ทักทาย ขอบคุณ หรือถามเกี่ยวกับตัวน้องปลาทู ตอบสั้น ๆ เป็นกันเองได้ 1 ประโยค แล้วชวนกลับมาเรื่องในวิทยาลัย",
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
const EN_BUSY_REPLY = "Many people are asking Nong Platoo right now. Please wait a moment and ask again.";
const EN_DOWN_REPLY = `Sorry, Nong Platoo can't answer right now. Please try again, or call the college at ${COLLEGE_FACTS.phone}.`;
/** English version: added to the system prompt. */
const ENGLISH_RULE = `

LANGUAGE: The visitor asked in English. Always reply in clear, simple English, even though the data above is in Thai. Never reply in Thai. Translate building and department names, and keep the Thai name in brackets the first time, e.g. "Building 85 (อาคาร 85 ปี)". Use "Nong Platoo" for yourself. Do not add "sir" or "madam" (that is not how the Thai ครับ translates).`;
/** In English, only the English ready answers fit (the rest are Thai). */
const englishReady = (ready, options) => !ready || options.lang !== "en" || /^en-/.test(ready.faqId ?? "") ? ready : null;
const DOWN_REPLY = `ขออภัยครับ ตอนนี้น้องปลาทูตอบคำถามนี้ไม่ได้ชั่วคราว ลองถามใหม่อีกครั้ง หรือโทรสอบถามวิทยาลัย ${COLLEGE_FACTS.phone} ได้เลยครับ`;

/** "ข่าวล่าสุดมีอะไรบ้าง" — answered straight from the news list (instant, no AI needed). */
function newsAnswer(question, news) {
  const q = question.replace(/\s+/g, "");
  if (!/ข่าว|ประกาศ|กิจกรรม/.test(q) || !/ล่าสุด|อะไรบ้าง|มีอะไร|ใหม่|วันนี้|เร็ว|ช่วงนี้/.test(q) || !news.length) return null;
  const items = news.slice(0, 3).map(n => `- ${n.title}${n.date ? ` (${n.date})` : ""}`);
  return ["ข่าวล่าสุดของวิทยาลัยครับ", ...items, "", "ดูข่าวทั้งหมดพร้อมรูปได้ที่เมนูข่าวสารครับ"].join("\n");
}

/**
 * Answer a chat message. If the AI service fails (busy, quota, network), the visitor gets a
 * polite reply instead of a "server error" — only a missing API key is reported as an error.
 */
/** Looser ready-answer match, for when the AI cannot answer. */
async function closeReadyAnswer(history, options) {
  const question = history.filter(m => m.role === "user").at(-1)?.content ?? "";
  const [buildings, settings] = await Promise.all([getCampusBuildings(), getCampusSettings()]);
  const ready = englishReady(answerFromFaq(question, buildings, settings, options.atKiosk ? settings.kiosk : null, CLOSE_SCORE), options);
  if (!ready || NOT_CLOSE.has(faqCategory(ready.faqId)) || TEMPLATE_ID.test(ready.faqId)) return null;
  const reply = options.spoken
    ? ready.reply.replace(/\*\*/g, "").replace(/\n\s*[-•]\s+/g, " · ").replace(/\n+/g, " ").trim()
    : ready.reply;
  return { reply, routeToBuildingId: ready.routeToBuildingId, action: ready.action ?? null, faqId: ready.faqId, source: "faq-close" };
}

/** When the AI is busy, accept a ready answer this close (normally 0.72). */
const CLOSE_SCORE = 0.55;
/** Small talk is only right for the exact small-talk question — never as a "close enough" answer. */
const NOT_CLOSE = new Set(["ทักทาย", "คุยเล่น", "เกี่ยวกับน้องปลาทู"]);
/** Answers built from templates (per department, per building …) — only for a near-exact question. */
const TEMPLATE_ID = /^(interest|compare|dept|office-head|division|building|teachers|person)[-:]/;

// ---------------------------------------------------------------- remembered AI answers

/** AI answers kept for repeat questions: the same question gets the same answer, instantly and free. */
const AI_CACHE_MS = 6 * 60 * 60 * 1000;
const AI_CACHE_MAX = 400;
const aiCache = new Map(); // key → { question, digits, answer, at }

/** "แล้วปวสล่ะ", "อันนั้นอยู่ไหน" only make sense after the earlier messages — never remembered. */
const FOLLOW_UP = /^(แล้ว|และ|ส่วน)|ล่ะ|อันนั้น|อันนี้|ที่ว่า|ข้างบน|เมื่อกี้|นั้น(ล่ะ|หรือ)|มันคือ/;

function cacheSlot(history, options) {
  const users = history.filter(m => m.role === "user");
  const question = users.at(-1)?.content?.trim() ?? "";
  if (question.length < 4 || (users.length > 1 && FOLLOW_UP.test(question))) return null;
  const key = normalizeQuestion(question);
  if (!key) return null;
  const mode = `${options.spoken ? "s" : "t"}${options.atKiosk ? "k" : "p"}${options.lang === "en" ? "e" : ""}`;
  return { key: `${mode}|${key}`, mode, question: key, digits: key.match(/\d+/g)?.join(",") ?? "" };
}

function cachedAnswer(slot) {
  if (!slot) return null;
  const now = Date.now();
  let hit = aiCache.get(slot.key);
  if (!hit) {
    // Nearly the same words ("ช่างไฟฟ้ากับอิเล็กทรอนิกส์ต่างกันยังไงครับ" / "…ต่างกันไง"), same numbers.
    for (const [key, entry] of aiCache)
      if (key.startsWith(`${slot.mode}|`) && entry.digits === slot.digits && similarity(entry.question, slot.question) >= 0.9) {
        hit = entry;
        break;
      }
  }
  if (!hit || now - hit.at > AI_CACHE_MS) return null;
  return { ...hit.answer, source: "ai-cache" };
}

function rememberAnswer(slot, answer) {
  if (!slot || answer.source !== "ai") return;
  if (aiCache.size >= AI_CACHE_MAX) aiCache.delete(aiCache.keys().next().value);
  aiCache.set(slot.key, { question: slot.question, digits: slot.digits, answer, at: Date.now() });
}

/** Forget remembered AI answers (e.g. after the buildings or news change in admin). */
export function clearAiAnswerCache() {
  aiCache.clear();
}

/** "where is the library": English letters, no Thai — and not Thai typed on an English keyboard. */
function isEnglishQuestion(text) {
  const t = String(text ?? "").trim();
  return /[a-z]{2,}/i.test(t) && !/[฀-๿]/.test(t) && !fixWrongKeyboard(t);
}

export async function askCampusChat(history, options = {}) {
  // Asked in English → answered in English (ready English answers first, then the AI).
  if (!options.lang && isEnglishQuestion(history.filter(m => m.role === "user").at(-1)?.content)) options = { ...options, lang: "en" };
  try {
    const slot = cacheSlot(history, options);
    const remembered = cachedAnswer(slot);
    if (remembered) {
      if (options.aiVoice) prepareSpeech(cleanForSpeech(remembered.reply));
      return remembered;
    }
    const answer = await answerChat(history, options);
    rememberAnswer(slot, answer);
    // The browser will read this aloud with the AI voice: start making that voice now.
    if (options.aiVoice) prepareSpeech(cleanForSpeech(answer.reply));
    return answer;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[Chat] AI answer failed:", message);
    if (/GEMINI_API_KEY/.test(message)) {
      return { reply: NO_AI_REPLY, routeToBuildingId: null, source: "fallback" };
    }
    // The AI is busy or down: a ready answer that is only roughly the same question beats
    // "ask again later" ("พาไปกินข้าวกันหน่อย" → the canteen answer).
    const close = await closeReadyAnswer(history, options).catch(() => null);
    if (close) return close;
    const en = options.lang === "en";
    return { reply: /429|ถามบ่อย|หนาแน่น|โควตา/.test(message) ? (en ? EN_BUSY_REPLY : BUSY_REPLY) : en ? EN_DOWN_REPLY : DOWN_REPLY, routeToBuildingId: null, source: "fallback" };
  }
}

async function answerChat(history, options) {
  // "g[njv" = "เบื่อ" typed with the keyboard on English: answer the Thai, and say so.
  const lastIndex = history.findLastIndex(m => m.role === "user");
  const fixed = lastIndex >= 0 && options.lang !== "en" ? fixWrongKeyboard(history[lastIndex].content) : null;
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
  const ready = englishReady(answerFromFaq(lastUser, buildings, settings, kiosk), options);
  if (ready) {
    // Spoken: no bold or bullet marks (they're read out or sound odd) — list lines become one sentence.
    const reply = options.spoken
      ? ready.reply.replace(/\*\*/g, "").replace(/\n\s*[-•]\s+/g, " · ").replace(/\n+/g, " ").trim()
      : ready.reply;
    return { reply, routeToBuildingId: ready.routeToBuildingId, action: ready.action ?? null, faqId: ready.faqId, source: "faq" };
  }
  const latestNews = options.lang === "en" ? null : newsAnswer(lastUser, news);
  if (latestNews) return { reply: latestNews, routeToBuildingId: null, action: "open-news", source: "news" };

  if (!CHAT_API_KEY) {
    throw new Error("ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในไฟล์ .env — ขอ key ฟรีที่ https://aistudio.google.com/apikey");
  }
  const byId = new Map(buildings.map(b => [b.id, b]));
  const routableIds = buildings.filter(b => b.latitude && b.longitude).map(b => b.id);

  // Keep only the last few user/assistant turns; the system prompt is rebuilt
  // fresh so the model always has current building/news data.
  const turns = history.filter(m => m.role === "user" || m.role === "assistant").slice(-10);

  const payload = {
    messages: [
      { role: "system", content: buildSystemPrompt(buildings, news, settings, options.spoken, kiosk, turns.some(m => m.role === "user" && ABOUT_PEOPLE.test(m.content))) + (options.lang === "en" ? ENGLISH_RULE : "") },
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
  };

  let lastStatus = 0;
  let lastNetworkError = "";
  // Google's free tier counts each model separately, and one model can be overloaded (503)
  // while others answer fine — so a busy / out-of-quota model hands over to the next one.
  const models = modelsToTry();
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const isLast = i === models.length - 1;

    let res;
    // Gemini can hold the connection open without ever responding; without a
    // timeout the tRPC call hangs forever and the chat spinner never clears.
    // The signal also aborts a stalled body read below. Shorter while backups remain.
    const signal = AbortSignal.timeout(isLast ? 30_000 : 15_000);
    try {
      res = await fetch(`${CHAT_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CHAT_API_KEY}`,
        },
        body: JSON.stringify({ ...payload, model }),
        signal,
      });
    } catch (error) {
      lastNetworkError = signal.aborted
        ? "หมดเวลารอ AI ตอบกลับ"
        : error instanceof Error
          ? error.message
          : "unknown network error";
      restModel(model, 2 * 60_000);
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
            reply:
              message?.content?.trim() ||
              (options.lang === "en"
                ? `I've opened the walking route to "${target.name}" on the map 👇`
                : `เปิดแผนที่เส้นทางเดินไป "${target.name}" ให้แล้วครับ 👇`),
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
    // Busy (503), out of quota (429) or a hiccup (500): rest this model and try the next one.
    if (res.status === 429 || res.status === 503 || res.status === 500 || (res.status === 404 && !isLast)) {
      restModel(model, res.status === 404 ? 60 * 60_000 : res.status === 429 ? 10 * 60_000 : 2 * 60_000);
      console.warn(`[Chat] ${model} answered ${res.status}${isLast ? "" : " — trying the next model"}`);
      continue;
    }
    {
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

  if (lastStatus === 429) {
    throw new Error("ถามบ่อยเกินไป (เกินโควตาของ AI ฟรีทุกรุ่น) — รอสักครู่แล้วลองใหม่");
  }
  if (lastStatus) {
    throw new Error(`บริการ AI มีผู้ใช้งานหนาแน่น (${lastStatus}) — กรุณาลองใหม่อีกครั้งในอีกสักครู่`);
  }
  throw new Error(`เชื่อมต่อบริการ AI ไม่ได้ (${lastNetworkError}) — กรุณาลองใหม่อีกครั้ง`);
}
