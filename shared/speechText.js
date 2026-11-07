// Turning a chat reply into speakable text, shared by the browser (web/js/voice.js) and the
// server (server/voice.js pre-makes the AI voice for ready-made answers — the pieces must match
// exactly what the browser will ask for, or the pre-made audio is never used).

export function cleanForSpeech(text) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [label](url) → label
    .replace(/https?:\/\/\S+/g, " ") // bare URLs
    .replace(/[*_#>`~|]/g, " ")
    .replace(/^\s*[-•]\s+/gm, "") // bullets
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
export function speechPieces(text, max = 110) {
  const sentences = String(text)
    .split(/(?<=ครับ|ค่ะ|[.!?。])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const pieces = [];
  for (const sentence of sentences) {
    for (const part of chunk(sentence, max)) {
      const last = pieces.at(-1);
      // Join very short bits ("ได้เลยครับ") to the previous piece, except the first one.
      if (last && pieces.length > 1 && last.length + part.length < 50) pieces[pieces.length - 1] = `${last} ${part}`;
      else pieces.push(part);
    }
  }
  return pieces.length ? pieces : [String(text)];
}


/** Said straight away while a voice answer is being prepared (their audio is made in advance). */
export const WAIT_PHRASES = ["รอสักครู่นะครับ", "เดี๋ยวน้องปลาทูหาให้นะครับ", "ขอคิดแป๊บนึงนะครับ"];

/** The kiosk greeting, also made in advance. */
export const GREETING_PHRASE = "สวัสดีครับ ผมน้องปลาทู ยินดีต้อนรับสู่วิทยาลัยเทคนิคสมุทรสงครามครับ";
