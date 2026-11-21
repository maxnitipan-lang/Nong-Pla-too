// Database errors arrive wrapped ("Failed query: select … params:"), with the real reason
// ("Access denied …", "connect ETIMEDOUT") hidden in `.cause`. This finds that reason and says it
// in Thai for the admin, without the database user name, host or IP address.

/** The error itself and every `.cause` under it. */
function chain(error) {
  const out = [];
  for (let e = error; e && out.length < 6; e = e.cause) out.push(e);
  return out;
}

/** A short Thai explanation of a database failure, or null when the error is not about the database. */
export function describeDbError(error) {
  const parts = chain(error);
  const codes = parts.map((e) => String(e?.code ?? ""));
  const text = parts.map((e) => String(e?.message ?? "")).join(" | ");
  const has = (code, pattern) => codes.includes(code) || pattern.test(text);

  if (has("ER_ACCESS_DENIED_ERROR", /access denied for user/i))
    return "ฐานข้อมูลไม่ยอมให้เข้าสู่ระบบ (Access denied) — ชื่อผู้ใช้หรือรหัสผ่านใน DATABASE_URL ไม่ถูกต้องหรือถูกเปลี่ยนแล้ว: ขอ connection string ใหม่จาก TiDB Cloud แล้วแก้ DATABASE_URL ใน Render (และ .env)";
  if (has("ENOTFOUND", /getaddrinfo|ENOTFOUND/i))
    return "หาเซิร์ฟเวอร์ฐานข้อมูลไม่เจอ — ชื่อโฮสต์ใน DATABASE_URL ผิด หรือฐานข้อมูลถูกลบไปแล้ว";
  if (has("ETIMEDOUT", /ETIMEDOUT|connect timeout|ECONNREFUSED|ECONNRESET/i))
    return "ต่อฐานข้อมูลไม่ได้ (หมดเวลา / ถูกปฏิเสธการเชื่อมต่อ) — ฐานข้อมูลอาจถูกหยุดชั่วคราว ลองเปิดหน้า TiDB Cloud ดูสถานะ";
  if (has("ER_NO_SUCH_TABLE", /doesn't exist|no such table/i))
    return "ฐานข้อมูลยังไม่มีตารางที่ต้องใช้ — รัน pnpm db:push กับฐานข้อมูลนี้";
  if (has("ER_BAD_DB_ERROR", /unknown database/i))
    return "ไม่พบชื่อฐานข้อมูลที่ระบุใน DATABASE_URL";
  if (/^Failed query:/i.test(String(error?.message ?? ""))) {
    const reason = parts.slice(1).map((e) => String(e?.message ?? "")).find(Boolean);
    return `อ่าน/เขียนฐานข้อมูลไม่สำเร็จ${reason ? `: ${reason.replace(/'[^']*'@'[^']*'/g, "").slice(0, 160)}` : ""}`;
  }
  return null;
}
