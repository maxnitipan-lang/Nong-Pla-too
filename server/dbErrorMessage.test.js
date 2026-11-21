import { describe, expect, it } from "vitest";
import { describeDbError } from "./dbErrorMessage.js";

const wrapped = (cause) => Object.assign(new Error("Failed query: select `id` from `campus_news`\nparams: "), { cause });

describe("database error messages for the admin", () => {
  it("explains a wrong password without showing the user or address", () => {
    const cause = Object.assign(new Error("Access denied for user 'abc.root'@'1.2.3.4' (using password: YES)"), { code: "ER_ACCESS_DENIED_ERROR" });
    const text = describeDbError(wrapped(cause));
    expect(text).toMatch(/Access denied/);
    expect(text).toMatch(/DATABASE_URL/);
    expect(text).not.toMatch(/abc\.root|1\.2\.3\.4/);
  });
  it("explains a timeout", () => {
    expect(describeDbError(wrapped(Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" })))).toMatch(/ต่อฐานข้อมูลไม่ได้/);
  });
  it("leaves other errors alone", () => {
    expect(describeDbError(new Error("ดึงข่าวไม่สำเร็จ"))).toBeNull();
  });
});
