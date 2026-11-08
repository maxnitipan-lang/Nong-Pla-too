// Text typed while the keyboard was left on English, e.g. "g[njv" → "เบื่อ" (Thai Kedmanee
// layout). Used by the chat and the map search, which run on kiosks where the keyboard
// language is easy to get wrong.

const KEYS =
  // unshifted
  "`_1ๅ2/3-4ภ5ถ6ุ7ึ8ค9ต0จ-ข=ช" +
  "qๆwไeำrพtะyัuีiรoนpย[บ]ล\\ฃ" +
  "aฟsหdกfดgเh้j่kาlส;ว'ง" +
  "zผxปcแvอbิnืmท,ม.ใ/ฝ" +
  // shifted
  "~%!+@๑#๒$๓%๔^ู&฿*๕(๖)๗_๘+๙" +
  "Q๐W\"EฎRฑTธYํU๊IณOฯPญ{ฐ},|ฅ" +
  "AฤSฆDฏFโGฌH็J๋KษLศ:ซ\"." +
  "Z(X)CฉVฮBฺN์M?<ฒ>ฬ?ฦ";

const MAP = new Map();
for (let i = 0; i + 1 < KEYS.length; i += 2) if (!MAP.has(KEYS[i])) MAP.set(KEYS[i], KEYS[i + 1]);

const THAI = /[฀-๿]/;

/** Map each key to the Thai character on the same key (spaces kept). */
export function englishKeysToThai(text) {
  return Array.from(String(text), (ch) => MAP.get(ch) ?? ch).join("");
}

/**
 * The Thai text the visitor most likely meant, or null if the text looks like real
 * English (or already has Thai in it). Typed-in-English Thai is full of keys like
 * [ ] ; ' , . / and of consonant runs no English word has.
 */
export function fixWrongKeyboard(text) {
  const t = String(text ?? "").trim();
  if (!t || THAI.test(t) || !/[a-z;'\[\],./]/i.test(t)) return null;
  // Web addresses and emails are typed on purpose.
  if (/^(https?:\/\/|www\.)|@[a-z0-9-]+\.[a-z]|\.(com|net|org|ac\.th|co\.th|go\.th|th)\b/i.test(t)) return null;
  const converted = englishKeysToThai(t);
  const thaiChars = Array.from(converted).filter((c) => THAI.test(c)).length;
  const letters = Array.from(t).filter((c) => !/\s/.test(c)).length;
  if (thaiChars < letters * 0.8) return null;
  // Real English has vowels; wrong-layout Thai mostly does not (or has punctuation keys).
  const words = t.split(/\s+/);
  const englishish = words.filter((w) => /^[a-z]+$/i.test(w) && /[aeiouy]/i.test(w) && w.length >= 2).length;
  if (englishish === words.length && !/[;'\[\],./]/.test(t)) return null;
  // English words joined by symbols ("<script>alert(1)</script>", "e-mail", "www.sstc.ac.th"):
  // most letters sit in runs that look like English words.
  const runs = t.match(/[a-z]+/gi) ?? [];
  const inEnglishRuns = runs.filter((r) => r.length >= 3 && /[aeiou]/i.test(r)).reduce((n, r) => n + r.length, 0);
  const allLetters = runs.reduce((n, r) => n + r.length, 0);
  if (allLetters && inEnglishRuns / allLetters >= 0.6) return null;
  return converted;
}
