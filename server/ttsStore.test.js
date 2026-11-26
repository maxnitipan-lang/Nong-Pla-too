import { afterEach, describe, expect, it, vi } from "vitest";

const WAV = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(400)]);
const geminiOk = () =>
  new Response(JSON.stringify({ outputs: [{ data: Buffer.alloc(300).toString("base64"), mime_type: "audio/l16;rate=24000" }] }), { status: 200 });

// voice.js reads its settings when it loads, so each test imports a fresh copy with a fake store.
async function loadVoice(store) {
  vi.resetModules();
  vi.stubEnv("AZURE_SPEECH_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "g");
  vi.stubEnv("GEMINI_TTS", "1");
  vi.stubEnv("TTS_VOICE", "");
  vi.doMock("./ttsStore.js", () => store);
  return import("./voice.js");
}

afterEach(() => {
  vi.doUnmock("./ttsStore.js");
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("voice clips kept in the database", () => {
  it("plays a stored clip without asking Google again", async () => {
    const fetchMock = vi.fn(async () => geminiOk());
    vi.stubGlobal("fetch", fetchMock);
    const store = { loadSpeech: vi.fn(async () => WAV), saveSpeech: vi.fn(async () => undefined) };
    const voice = await loadVoice(store);

    const wav = await voice.synthesizeSpeech("สวัสดีครับ");
    expect(wav).toBe(WAV);
    expect(store.loadSpeech).toHaveBeenCalledWith("gemini:gemini-3.8-flash-tts:Aoede", "สวัสดีครับ");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves a newly made clip under the voice that made it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => geminiOk()));
    const store = { loadSpeech: vi.fn(async () => null), saveSpeech: vi.fn(async () => undefined) };
    const voice = await loadVoice(store);

    const wav = await voice.synthesizeSpeech("ไปห้องสมุดครับ");
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(store.saveSpeech).toHaveBeenCalledWith("gemini:gemini-3.8-flash-tts:Aoede", "ไปห้องสมุดครับ", wav);
  });

  it("gives each voice and sentence its own key", async () => {
    vi.resetModules();
    const { clipKey } = await import("./ttsStore.js");
    expect(clipKey("gemini:m:Aoede", "ก")).toMatch(/^[a-f0-9]{64}$/);
    expect(clipKey("gemini:m:Aoede", "ก")).not.toBe(clipKey("gemini:m:Leda", "ก"));
  });
});
