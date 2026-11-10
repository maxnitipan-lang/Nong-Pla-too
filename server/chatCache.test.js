import { afterEach, describe, expect, it, vi } from "vitest";

// The AI key and model are read when server/chat.js loads, so each test imports a fresh copy.
async function loadChat() {
  vi.resetModules();
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("DATABASE_URL", "");
  return import("./chat.js");
}

function fakeAi(reply = "สองสาขานี้ต่างกันที่ไฟฟ้ากำลังเน้นระบบไฟในอาคาร ส่วนอิเล็กทรอนิกส์เน้นวงจรครับ") {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: reply } }] }), { status: 200 })
  );
  vi.stubGlobal("fetch", fetchMock);
  // Only calls to the AI count (other parts of the server may fetch too).
  return { get calls() { return fetchMock.mock.calls.filter(([url]) => String(url).includes("chat/completions")).length; } };
}

const ask = (chat, ...questions) =>
  chat.askCampusChat(questions.map((content, i) => ({ role: i % 2 ? "assistant" : "user", content })));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("remembered AI answers", () => {
  it("asks the AI once; the same question again is answered from memory", async () => {
    const chat = await loadChat();
    const fetchMock = fakeAi();
    const first = await ask(chat, "สาขาไหนเหมาะกับคนชอบดนตรี");
    const second = await ask(chat, "สาขาไหนเหมาะกับคนชอบดนตรี");
    expect(first.source).toBe("ai");
    expect(second.source).toBe("ai-cache");
    expect(second.reply).toBe(first.reply);
    expect(fetchMock.calls).toBe(1);
  });

  it("nearly the same words also hit the memory", async () => {
    const chat = await loadChat();
    const fetchMock = fakeAi();
    await ask(chat, "สาขาไหนเหมาะกับคนชอบดนตรี");
    const again = await ask(chat, "สาขาไหนเหมาะกับคนชอบดนตรีครับ");
    expect(again.source).toBe("ai-cache");
    expect(fetchMock.calls).toBe(1);
  });

  it("a follow-up that depends on the conversation is not taken from memory", async () => {
    const chat = await loadChat();
    const fetchMock = fakeAi("ปวส. ก็มีครับ");
    await ask(chat, "สาขาไหนเหมาะกับคนชอบวาดรูป", "แนะนำเทคโนโลยีธุรกิจดิจิทัลครับ", "แล้วปวสล่ะ");
    await ask(chat, "สาขาไหนเหมาะกับคนชอบเขียนโปรแกรม", "แนะนำเทคนิคคอมพิวเตอร์ครับ", "แล้วปวสล่ะ");
    expect(fetchMock.calls).toBe(2);
  });

  it("forgets everything after an admin change", async () => {
    const chat = await loadChat();
    const fetchMock = fakeAi();
    await ask(chat, "สาขาไหนเหมาะกับคนชอบดนตรี");
    chat.clearAiAnswerCache();
    await ask(chat, "สาขาไหนเหมาะกับคนชอบดนตรี");
    expect(fetchMock.calls).toBe(2);
  });

  it("tries the next model when the main one is busy (503)", async () => {
    const chat = await loadChat();
    const models = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      if (!String(url).includes("chat/completions")) return new Response("{}", { status: 404 });
      const model = JSON.parse(init.body).model;
      models.push(model);
      return models.length === 1
        ? new Response("busy", { status: 503 })
        : new Response(JSON.stringify({ choices: [{ message: { content: "ตอบจากรุ่นสำรองครับ" } }] }), { status: 200 });
    }));
    const answer = await ask(chat, "สาขาไหนเหมาะกับคนชอบดนตรี");
    expect(answer.reply).toBe("ตอบจากรุ่นสำรองครับ");
    expect(models).toHaveLength(2);
    expect(models[0]).not.toBe(models[1]);
  });
});
