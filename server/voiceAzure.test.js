import { afterEach, describe, expect, it, vi } from "vitest";

// Azure settings are read when server/voice.js loads, so each test imports a fresh copy.
async function loadVoice(env) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import("./voice.js");
}

const WAV = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(400)]);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Azure voice", () => {
  it("is used first and sends escaped SSML with the chosen voice", async () => {
    const fetchMock = vi.fn(async () => new Response(WAV, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const voice = await loadVoice({ AZURE_SPEECH_KEY: "k", AZURE_SPEECH_REGION: "southeastasia", GEMINI_API_KEY: "" });

    expect(voice.isVoiceConfigured()).toBe(true);
    const wav = await voice.synthesizeSpeech("ห้อง <A> & B");
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://southeastasia.tts.speech.microsoft.com/cognitiveservices/v1");
    expect(init.headers["Ocp-Apim-Subscription-Key"]).toBe("k");
    expect(init.body).toContain('name="th-TH-NiwatNeural"');
    expect(init.body).toContain("ห้อง &lt;A&gt; &amp; B");
  });

  it("falls back to Gemini when Azure fails", async () => {
    const fetchMock = vi.fn(async url =>
      String(url).includes("microsoft")
        ? new Response("busy", { status: 500 })
        : new Response(JSON.stringify({ outputs: [{ data: Buffer.alloc(300).toString("base64"), mime_type: "audio/l16;rate=24000" }] }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const voice = await loadVoice({ AZURE_SPEECH_KEY: "k", AZURE_SPEECH_REGION: "eastasia", GEMINI_API_KEY: "g", GEMINI_TTS: "1" });

    const wav = await voice.synthesizeSpeech("ทดสอบ");
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("generativelanguage"))).toBe(true);
  });

  it("is never paused by a Gemini quota error while Azure is set up", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(WAV, { status: 200 })));
    const voice = await loadVoice({ AZURE_SPEECH_KEY: "k", AZURE_SPEECH_REGION: "eastasia" });
    expect(voice.aiVoicePaused()).toBe(false);
  });
});
