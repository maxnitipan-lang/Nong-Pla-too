// Turning a chat reply into speakable text, shared by the browser (web/js/voice.js) and the
// server (server/voice.js pre-makes the AI voice for ready-made answers — the pieces must match
// exactly what the browser will ask for, or the pre-made audio is never used).

// ---------------------------------------------------------------- pronunciation

const DIGIT_WORDS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
/** "034-711440" → "ศูนย์ สาม สี่, เจ็ด หนึ่ง หนึ่ง สี่ สี่ ศูนย์" — phone numbers are read digit by digit. */
const spellDigits = s => s.split("-").map(part => Array.from(part, d => DIGIT_WORDS[Number(d)] ?? d).join(" ")).join(", ");

const MONTHS = {
  "ม.ค.": "มกราคม", "ก.พ.": "กุมภาพันธ์", "มี.ค.": "มีนาคม", "เม.ย.": "เมษายน", "พ.ค.": "พฤษภาคม", "มิ.ย.": "มิถุนายน",
  "ก.ค.": "กรกฎาคม", "ส.ค.": "สิงหาคม", "ก.ย.": "กันยายน", "ต.ค.": "ตุลาคม", "พ.ย.": "พฤศจิกายน", "ธ.ค.": "ธันวาคม",
};
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Thai abbreviations are read letter by letter (ปวช. = "ปอ วอ ชอ"), or as the full word.
 * Longest first, so "ปวส." is not eaten by a shorter entry.
 */
const THAI_ABBR = [
  ["อพ.สธ.", "ออ พอ สอ ทอ"],
  ["ทล.บ.", "เทคโนโลยีบัณฑิต"],
  ["สอฐ.", "สถาบันการอาชีวศึกษา"],
  ["ปวช.", "ปอ วอ ชอ"],
  ["ปวส.", "ปอ วอ สอ"],
  ["ปวช", "ปอ วอ ชอ"],
  ["ปวส", "ปอ วอ สอ"],
  ["อวท.", "ออ วอ ทอ"],
  ["กยศ.", "กอ ยอ สอ"],
  ["กยศ", "กอ ยอ สอ"],
  ["พ.ศ.", "พุทธศักราช"],
  ["รองฯ", "รองผู้อำนวยการ"],
  ["ผอ.", "ผู้อำนวยการ"],
  ["ดร.", "ดอกเตอร์"],
  ["มส.", "มอ สอ"],
  ["กศน.", "กอ สอ นอ"],
  ["กศน", "กอ สอ นอ"],
  ["ร.ด.", "รอ ดอ"],
  ["ม.ต้น", "มัธยมต้น"],
  ["ม.ปลาย", "มัธยมปลาย"],
  ["ฯลฯ", "และอื่น ๆ"],
];

/** English names inside Thai answers, as Thai speakers say them (a Thai voice mangles the spelling). */
const ENGLISH_WORDS = [
  ["Fix it Center", "ฟิกซ์อิทเซ็นเตอร์"],
  ["Google Maps", "กูเกิลแมปส์"],
  ["Google", "กูเกิล"],
  ["Android", "แอนดรอยด์"],
  ["iPhone", "ไอโฟน"],
  ["iPad", "ไอแพด"],
  ["Chrome", "โครม"],
  ["Safari", "ซาฟารี"],
  ["Edge", "เอดจ์"],
  ["Facebook", "เฟซบุ๊ก"],
  ["YouTube", "ยูทูบ"],
  ["LINE", "ไลน์"],
  ["Zoom", "ซูม"],
  ["code", "โค้ด"],
  ["online", "ออนไลน์"],
  ["Ontour", "ออนทัวร์"],
];

/** English letters as Thai speakers say them (voices often read "ICT" as a word). */
const ENGLISH_ABBR = {
  ICT: "ไอซีที", IT: "ไอที", AI: "เอไอ", CVM: "ซีวีเอ็ม", MC3: "เอ็มซีสาม", CNC: "ซีเอ็นซี", CAD: "แคด",
  PLC: "พีแอลซี", OVEC: "โอเว็ค", SSTC: "เอสเอสทีซี", GPS: "จีพีเอส", QR: "คิวอาร์", PDF: "พีดีเอฟ", WIFI: "ไวไฟ",
  ATM: "เอทีเอ็ม", USB: "ยูเอสบี", ID: "ไอดี", EV: "อีวี", CEO: "ซีอีโอ", DBT: "ดีบีที", PR: "พีอาร์",
};

const LETTERS = {
  a: "เอ", b: "บี", c: "ซี", d: "ดี", e: "อี", f: "เอฟ", g: "จี", h: "เอช", i: "ไอ", j: "เจ", k: "เค", l: "แอล", m: "เอ็ม",
  n: "เอ็น", o: "โอ", p: "พี", q: "คิว", r: "อาร์", s: "เอส", t: "ที", u: "ยู", v: "วี", w: "ดับเบิลยู", x: "เอ็กซ์", y: "วาย", z: "แซด",
};
const ADDRESS_WORDS = { com: "คอม", gmail: "จีเมล", net: "เน็ต", org: "ออร์ก", go: "โก" };

/** Make abbreviations, numbers and addresses sound right when read aloud. */
export function pronounce(text) {
  let t = String(text);
  // Web and email addresses: "dot", "at", short parts spelled letter by letter ("sstc" = เอส เอส ที ซี).
  const part = p => ADDRESS_WORDS[p.toLowerCase()] ?? (p.length <= 4 ? Array.from(p.toLowerCase(), c => LETTERS[c] ?? c).join(" ") : p);
  const address = s => s.split(/([@.])/).map(p => (p === "@" ? " แอท " : p === "." ? " ดอท " : part(p))).join("");
  t = t.replace(/[\w.-]+@[\w-]+(\.[\w-]+)+/g, address);
  t = t.replace(/\bwww\.([\w-]+(\.[\w-]+)+)/gi, (_, rest) => `ดับเบิลยูดับเบิลยูดับเบิลยู ดอท ${address(rest)}`);
  // Phone numbers and hotlines: digit by digit.
  t = t.replace(/\b0\d{1,2}-\d{3}-?\d{3,4}\b|\b0\d{8,9}\b/g, spellDigits);
  t = t.replace(/(?<!\d)(1323|1669|1300|1155|191|199|1323)(?!\d)/g, spellDigits);
  // Times: "08:00 น." → "8 นาฬิกา", "16:30" → "16 นาฬิกา 30 นาที".
  t = t.replace(/(?<!\d)(\d{1,2}):(\d{2})(\s*น\.)?/g, (_, h, m) => `${Number(h)} นาฬิกา${m === "00" ? "" : ` ${Number(m)} นาที`}`);
  // Dates: "19 ต.ค. 69" → "19 ตุลาคม 2569".
  for (const [abbr, month] of Object.entries(MONTHS))
    t = t.replace(new RegExp(`${escapeRe(abbr)}(\\s*)(\\d{2,4})?`, "g"), (_, sp, y) =>
      y ? `${month} ${y.length === 2 ? `25${y}` : y}` : `${month}${sp}`);
  // ม.3 / ม.6 = "มอ สาม" (a school year), not "metre".
  t = t.replace(/ม\.\s*(\d)/g, "มอ $1");
  // "13.30 น." → "13 นาฬิกา 30 นาที".
  t = t.replace(/(?<![\d.])(\d{1,2})\.(\d{2})\s*น\./g, (_, h, m) => `${Number(h)} นาฬิกา${m === "00" ? "" : ` ${Number(m)} นาที`}`);
  // "ภาคเรียนที่ 1/2568" → "ภาคเรียนที่ 1 ปีการศึกษา 2568".
  t = t.replace(/(ภาคเรียนที่|เทอม)\s*(\d)\s*\/\s*(\d{4})/g, "$1 $2 ปีการศึกษา $3");
  // Address and title short forms: อ.เมือง = อำเภอ, จ. = จังหวัด, ต. = ตำบล, อ.สมชาย = อาจารย์, ร.2 = รัชกาลที่ 2.
  t = t.replace(/(?<![ก-๙])อ\.\s*(?=เมือง|อัมพวา|บางคนที)/g, "อำเภอ")
    .replace(/(?<![ก-๙])จ\.\s*(?=[ก-๙])/g, "จังหวัด")
    .replace(/(?<![ก-๙])ต\.\s*(?=[ก-๙])/g, "ตำบล")
    .replace(/(?<![ก-๙])อ\.\s*(?=[ก-๙])/g, "อาจารย์")
    .replace(/(?<![ก-๙])ร\.\s*(\d)/g, "รัชกาลที่ $1");
  // The shop "7-11" is a name, not a range.
  t = t.replace(/(?<!\d)7-?(?:11|Eleven)(?!\d)/gi, "เซเว่นอีเลฟเว่น");
  // "89%" → "89 เปอร์เซ็นต์"; "2D / 3D" → "ทูดี / ทรีดี".
  t = t.replace(/(\d)\s*%/g, "$1 เปอร์เซ็นต์").replace(/\b2D\b/g, "ทูดี").replace(/\b3D\b/g, "ทรีดี");
  for (const [word, spoken] of ENGLISH_WORDS) t = t.replace(new RegExp(`\\b${escapeRe(word)}\\b`, "g"), spoken);
  // Grades: "ติด 0 / ร / มส." → read the letters.
  t = t.replace(/(?<![ก-๙])ร(?=\s*\/)/g, "รอ");
  for (const [abbr, spoken] of THAI_ABBR) t = t.replace(new RegExp(`${escapeRe(abbr)}(?![ก-๙])`, "g"), ` ${spoken} `);
  // Only words already in capitals ("ICT"), so "Fix it Center" keeps its "it".
  t = t.replace(/\bWi-?Fi\b/gi, "ไวไฟ").replace(/\b[A-Z][A-Z0-9]{1,5}\b/g, w => ENGLISH_ABBR[w] ?? w);
  // "1/2568" (term/year) → "1 ทับ 2568"; separators become pauses.
  t = t.replace(/(\d)\s*\/\s*(\d)/g, "$1 ทับ $2").replace(/\s*[·•]\s*/g, ", ").replace(/\s+\/\s+/g, " หรือ ");
  // Ranges: "8 นาฬิกา–16 นาฬิกา", "จันทร์–ศุกร์" → "… ถึง …".
  // Only between numbers, times or days — "ทางเข้า–ออก" is "in and out", not "in to out".
  t = t.replace(/(\d|นาฬิกา|นาที|จันทร์|อังคาร|พุธ|พฤหัสบดี|พฤหัส|ศุกร์|เสาร์|อาทิตย์)\s*[–—]\s*(?=[\dก-๙])/g, "$1 ถึง ")
    .replace(/(\d)-(\d)(?!\d*-)/g, "$1 ถึง $2")
    .replace(/\s*[–—]\s*/g, " ");
  return t.replace(/\s{2,}/g, " ").trim();
}

export function cleanForSpeech(text) {
  return pronounce(text)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [label](url) → label
    .replace(/https?:\/\/\S+/g, " ") // bare URLs
    .replace(/[*_#>`~|⋮…]/g, " ")
    .replace(/^\s*[-•]\s+/gm, "") // bullets
    .replace(/\s+-\s+/g, ", ") // "ปวช. - ปวส." in one line: a pause, not "ลบ"
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/(\d)\s*ม\.(?!\S)/g, "$1 เมตร")
    .replace(/(\d)\s*กม\./g, "$1 กิโลเมตร")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Chrome cuts utterances off after ~15 s, so speak long text in pieces split at spaces. */
export function chunk(text, max = 160) {
  const parts = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(" ", max);
    if (cut < max * 0.5) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/**
 * Split a reply into short pieces for the AI voice: after each "ครับ", sentence mark or
 * line break, merged so no piece is tiny, and long ones cut at a space (~110 characters).
 * A short first piece means the first sound comes sooner.
 */
export function speechPieces(text, max = 110, restMax = 220) {
  const sentences = String(text)
    .split(/(?<=ครับ|ค่ะ|[.!?。])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const pieces = [];
  for (const sentence of sentences) {
    // The first piece stays short (the voice starts sooner); after that, sentences are joined
    // into longer pieces (fewer gaps between requests, so it sounds like one smooth answer).
    const limit = pieces.length === 0 ? max : restMax;
    for (const part of chunk(sentence, limit)) {
      const last = pieces.at(-1);
      if (last && pieces.length > 1 && last.length + part.length + 1 <= restMax) pieces[pieces.length - 1] = `${last} ${part}`;
      else pieces.push(part);
    }
  }
  return pieces.length ? pieces : [String(text)];
}


/** The kiosk greeting, also made in advance. */
export const GREETING_PHRASE = "สวัสดีครับ ผมน้องปลาทู ยินดีต้อนรับสู่วิทยาลัยเทคนิคสมุทรสงครามครับ";
