import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown.js";

describe("renderMarkdown", () => {
  it("renders bold, lists and paragraphs", () => {
    expect(renderMarkdown("สวัสดี **ครับ**\n\n- ชั้น 1\n- ชั้น 2")).toBe("<p>สวัสดี <strong>ครับ</strong></p><ul><li>ชั้น 1</li><li>ชั้น 2</li></ul>");
  });

  it("keeps single line breaks", () => {
    expect(renderMarkdown("บรรทัดแรก\nบรรทัดสอง")).toBe("<p>บรรทัดแรก<br>บรรทัดสอง</p>");
  });

  it("makes http(s) links clickable", () => {
    expect(renderMarkdown("[เว็บ](https://www.sstc.ac.th)")).toContain('<a href="https://www.sstc.ac.th" target="_blank" rel="noreferrer">เว็บ</a>');
    expect(renderMarkdown("ดูที่ https://a.b/c")).toContain('<a href="https://a.b/c"');
  });

  it("escapes HTML and refuses javascript: links", () => {
    const out = renderMarkdown('<img src=x onerror="alert(1)"> [x](javascript:alert(1))');
    expect(out).not.toContain("<img");
    expect(out).not.toContain('href="javascript');
    expect(out).toContain("&lt;img");
  });
});
