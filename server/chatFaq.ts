// Ready-made answers, checked before the AI is called.
//
// A question that matches one of these is answered instantly and costs no AI
// tokens:
//   1. "Where is X / how do I get to X" — when the question names exactly one
//      building or department, answer from the building list and open the route.
//   2. The Q&A set in shared/data/chatFaq.json (greetings, college info,
//      off-topic questions…) — matched by similarity, so small wording changes
//      still hit.
// Anything else goes to the AI as before.

import faqData from "../shared/data/chatFaq.json";
import type { CampusBuilding, CampusSettings } from "@shared/campus";
import { describeLocation, locateBuilding } from "./buildingLocation";

export type FaqEntry = {
  id: string;
  category: string;
  questions: string[];
  answer: string;
  routeTo?: string;
};

export type FaqAnswer = {
  reply: string;
  routeToBuildingId: string | null;
  /** Which ready-made answer was used (for logs / tests). */
  faqId: string;
};

const ENTRIES = (faqData as { entries: FaqEntry[] }).entries;

/** Minimum similarity (0–1) for a Q&A entry to count as the same question. */
export const FAQ_MIN_SCORE = 0.72;
/** Longer messages are usually real questions with details — leave them to the AI. */
const MAX_LENGTH = 80;

/** Lower-case, drop spaces/punctuation/polite particles and unify common Thai variants. */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/น้องปลาทู|ปลาทู/g, "")
    .replace(/ที่ไหน|ตรงไหน|แถวไหน/g, "ไหน")
    .replace(/อย่างไร|ยังไง|ไง/g, "ยังไง")
    .replace(/มั้ย|มั๊ย|ไหม/g, "ไหม")
    .replace(/ครับผม|ครับ|คับ|ค่ะ|คะ|จ้ะ|จ้า|จ๊ะ|นะ|หน่อย|ด้วย|ๆ/g, "")
    .replace(/[\s.,!?'"“”‘’()\-–—/:;]+/g, "");
}

function bigrams(text: string): string[] {
  const chars = Array.from(text);
  if (chars.length < 2) return chars;
  return chars.slice(0, -1).map((c, i) => c + chars[i + 1]);
}

/** Dice similarity of character pairs — works for Thai, which has no spaces between words. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const left = bigrams(a);
  const right = new Map<string, number>();
  for (const g of bigrams(b)) right.set(g, (right.get(g) ?? 0) + 1);
  let shared = 0;
  for (const g of left) {
    const n = right.get(g) ?? 0;
    if (n > 0) {
      shared++;
      right.set(g, n - 1);
    }
  }
  return (2 * shared) / (left.length + bigrams(b).length);
}

function fill(template: string, settings: CampusSettings): string {
  return template
    .replace(/\{collegeName\}/g, settings.collegeName)
    .replace(/\{address\}/g, settings.address)
    .replace(/\{email\}/g, settings.contactEmail || "ของวิทยาลัย");
}

// ---------------------------------------------------------------- buildings

/** Words that mean "where is it / take me there". */
const LOCATION_INTENT = /ไหน|ยังไง|ทางไป|นำทาง|พาไป|ไป|เส้นทาง/;
/** Generic words stripped from names so "สาขาวิชาช่างยนต์" also matches "ช่างยนต์". */
const GENERIC = /^(สาขาวิชา|สาขา|หมวดวิชา|อาคาร|ตึก|งาน|ฝ่าย|ห้อง)/;

/** Names people may use for a building: full name, pin name, its parts, departments inside. */
function buildingKeys(building: CampusBuilding): string[] {
  const names = [
    building.name,
    ...building.shortName.split("/"),
    ...(building.departments ?? []).map((d) => d.name),
    ...building.floorsDetail.flatMap((f) => f.rooms),
  ];
  const keys = new Set<string>();
  const add = (key: string) => {
    if (key.length >= 3) keys.add(key);
    const core = key.replace(GENERIC, "");
    if (core.length >= 3) keys.add(core);
  };
  for (const name of names) {
    const key = normalizeQuestion(name);
    add(key);
    // "เมคคาทรอนิกส์และหุ่นยนต์" → also "เมคคาทรอนิกส์", "หุ่นยนต์" (short parts like "อาหาร" are too vague)
    for (const part of key.replace(GENERIC, "").split("และ")) if (part.length >= 6 && part !== key) add(part);
  }
  return Array.from(keys);
}

/**
 * The single building the question is about, or null when none fits or it is
 * ambiguous — e.g. "ก่อสร้าง" is part of two buildings' names, so let the AI ask.
 */
export function findBuildingInQuestion(question: string, buildings: CampusBuilding[]): CampusBuilding | null {
  return findBuildingMatch(question, buildings)?.building ?? null;
}

/** Like findBuildingInQuestion, plus the (normalised) words that matched. */
function findBuildingMatch(question: string, buildings: CampusBuilding[]): { building: CampusBuilding; key: string } | null {
  const text = normalizeQuestion(question);
  const keysById = new Map(buildings.map((b) => [b.id, buildingKeys(b)]));
  let best: { building: CampusBuilding; key: string } | null = null;
  let tie = false;
  for (const building of buildings) {
    const key = keysById
      .get(building.id)!
      .filter((k) => text.includes(k))
      .sort((x, y) => y.length - x.length)[0];
    if (!key) continue;
    if (!best || key.length > best.key.length) {
      best = { building, key };
      tie = false;
    } else if (key.length === best.key.length) {
      tie = true;
    }
  }
  if (!best || tie) return null;
  const winner = best;
  // Another building has a longer name that contains the matched words → the question is not specific enough.
  const ambiguous = buildings.some(
    (b) => b.id !== winner.building.id && keysById.get(b.id)!.some((k) => k !== winner.key && k.includes(winner.key))
  );
  return ambiguous ? null : winner;
}

/** The department or room the matched words refer to, when it is not just the building itself. */
function matchedPlace(building: CampusBuilding, key: string): { name: string; floor: number | null } | null {
  if (normalizeQuestion(building.name).includes(key)) return null;
  const department = (building.departments ?? []).find((d) => normalizeQuestion(d.name).includes(key));
  if (department) return { name: department.name, floor: department.floor };
  for (const floor of building.floorsDetail) {
    const room = floor.rooms.find((r) => normalizeQuestion(r).includes(key));
    if (room) return { name: room, floor: floor.level };
  }
  return null;
}

/** "…อาคาร 1" + "ครับ" reads better with a space after a number or English word. */
const politely = (text: string) => `${text}${/[0-9A-Za-z.)]$/.test(text) ? " " : ""}ครับ`;

function buildingAnswer(
  question: string,
  buildings: CampusBuilding[],
  kiosk: CampusSettings["kiosk"]
): FaqAnswer | null {
  const text = normalizeQuestion(question);
  if (!LOCATION_INTENT.test(text)) return null;
  const match = findBuildingMatch(question, buildings);
  if (!match) return null;
  const { building, key } = match;
  const routable = Boolean(building.latitude && building.longitude);
  const where = describeLocation(locateBuilding(building, buildings, kiosk)) || `อยู่ในกลุ่ม${building.category}`;
  const place = matchedPlace(building, key);
  // The built-in data only lists floor 1 for every building — mention a floor once real per-floor
  // data has been entered (more than one floor listed), or when it is above floor 1.
  const floorKnown = building.floorsDetail.length > 1 || (place?.floor ?? 0) > 1;
  const floor = place?.floor && building.floors > 1 && floorKnown ? ` ชั้น ${place.floor}` : "";
  const sentences = [
    politely(place ? `${place.name} อยู่ที่ **${building.name}**${floor} ซึ่ง${where}` : `**${building.name}** ${where}`),
    routable ? "ผมเปิดเส้นทางเดินให้บนแผนที่แล้วครับ" : "",
  ];
  return {
    reply: sentences.filter(Boolean).join(" "),
    routeToBuildingId: routable ? building.id : null,
    faqId: `building:${building.id}`,
  };
}

// ---------------------------------------------------------------- Q&A set

/** Best-matching Q&A entry and its score. */
export function bestFaqMatch(question: string): { entry: FaqEntry; score: number } | null {
  const text = normalizeQuestion(question);
  if (!text) return null;
  let best: { entry: FaqEntry; score: number } | null = null;
  for (const entry of ENTRIES) {
    for (const q of entry.questions) {
      const score = similarity(text, normalizeQuestion(q));
      if (!best || score > best.score) best = { entry, score };
    }
  }
  return best;
}

/** A ready-made answer for the latest question, or null to ask the AI. */
export function answerFromFaq(
  question: string,
  buildings: CampusBuilding[],
  settings: CampusSettings,
  /** The kiosk location when asked on the kiosk — answers then say how far it is from here. */
  kiosk: CampusSettings["kiosk"] = null
): FaqAnswer | null {
  const trimmed = question.trim();
  if (!trimmed || trimmed.length > MAX_LENGTH) return null;

  const match = bestFaqMatch(trimmed);
  if (match && match.score >= FAQ_MIN_SCORE) {
    const routeTo = match.entry.routeTo && buildings.some((b) => b.id === match.entry.routeTo) ? match.entry.routeTo : null;
    return { reply: fill(match.entry.answer, settings), routeToBuildingId: routeTo, faqId: match.entry.id };
  }
  return buildingAnswer(trimmed, buildings, kiosk);
}
