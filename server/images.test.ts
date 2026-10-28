import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { MAX_IMAGE_BYTES, parseImageDataUrl } from "./images";

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function as(role: "viewer" | "editor"): TrpcContext {
  return {
    user: {
      id: 9,
      openId: `local:${role}-img`,
      name: role,
      email: null,
      loginMethod: "password",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("image upload", () => {
  it("accepts PNG, JPEG and WebP data URLs", () => {
    expect(parseImageDataUrl(PNG_1PX)).toMatchObject({ mime: "image/png" });
  });

  it("rejects other files and oversized pictures", () => {
    expect(() => parseImageDataUrl("data:text/html;base64,PGgxPg==")).toThrow(/ไม่ใช่รูปภาพ/);
    expect(() => parseImageDataUrl("data:image/gif;base64,R0lGODlh")).toThrow(/PNG, JPG หรือ WebP/);
    const huge = `data:image/png;base64,${"A".repeat(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8)}`;
    expect(() => parseImageDataUrl(huge)).toThrow(/ใหญ่เกินไป/);
  });

  it("is not allowed for viewers", async () => {
    await expect(appRouter.createCaller(as("viewer")).admin.images.upload({ dataUrl: PNG_1PX })).rejects.toThrow(
      /ดูได้อย่างเดียว/
    );
  });

  it("explains that a database is needed when there is none", async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await expect(appRouter.createCaller(as("editor")).admin.images.upload({ dataUrl: PNG_1PX })).rejects.toThrow(
        /ฐานข้อมูล/
      );
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL = saved;
    }
  });
});
