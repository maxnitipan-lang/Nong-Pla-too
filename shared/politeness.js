// Nong Platoo speaks like the voice it is using: a female voice (Premwadee, Kanya, Siri female,
// Google ไทย …) says "ค่ะ / คะ" and calls herself "หนู"; a male voice (Niwat …) says "ครับ" and "ผม".
// Answers are written in the male form ("ครับ", "ผม"); this turns them into the female form.

/** Hair words, where "ผม" is not "I". */
const HAIR = /(ทรง|เส้น|ตัด|สระ|ย้อม|หวี|ไดร์|ยืด|ดัด)ผม|ผม(ยาว|สั้น|หงอก|ร่วง|เปีย|ทรง)/g;

/** Polite question endings take "คะ", statements take "ค่ะ". */
const QUESTION_BEFORE = /(ไหม|มั้ย|หรือเปล่า|หรือยัง|หรือไม่|อะไร|ไหน|ยังไง|อย่างไร|เท่าไหร่|เท่าไร|กี่\S*|ทำไม|เมื่อไหร่|เมื่อไร|หรอ|เหรอ|ใช่ไหม|มีไหม|ดีไหม|ไหมคะ)\s*(นะ)?\s*$/;

/** "ครับ" → "ค่ะ" (or "คะ" in a question), "ผม" → "หนู". */
export function toFemaleSpeech(text) {
  const s = String(text ?? "");
  if (!/ครับ|ผม/.test(s)) return s;
  // Keep hair words safe while swapping "ผม".
  const kept = [];
  let t = s.replace(HAIR, (m) => {
    kept.push(m);
    return `\u0000${kept.length - 1}\u0000`;
  });
  t = t
    .replace(/ครับผม/g, "ค่ะ")
    .replace(/ครับ(?=\s*[?？])/g, "คะ")
    .replace(/ครับ/g, (m, offset, whole) => (QUESTION_BEFORE.test(whole.slice(0, offset)) ? "คะ" : "ค่ะ"))
    .replace(/นะค่ะ/g, "นะคะ") // "ลองดูนะคะ" is written with คะ
    .replace(/ผม/g, "หนู");
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => kept[Number(i)]);
}

/** The text for this voice: unchanged for a male voice, the female form for a female one. */
export const forVoice = (text, female) => (female ? toFemaleSpeech(text) : String(text ?? ""));
