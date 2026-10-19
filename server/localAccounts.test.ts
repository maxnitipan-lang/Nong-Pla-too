import { beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

beforeAll(() => {
  process.env.JWT_SECRET ||= "test-secret-for-vitest";
});

const { hashPassword, verifyPassword, mintUserToken, verifyUserToken, usernameToOpenId } = await import(
  "./_core/localAccounts"
);

describe("local admin accounts", () => {
  it("hashes with a random salt and verifies only the right password", () => {
    const a = hashPassword("correct horse");
    const b = hashPassword("correct horse");
    expect(a).not.toBe(b); // salted
    expect(a).not.toContain("correct horse");
    expect(verifyPassword("correct horse", a)).toBe(true);
    expect(verifyPassword("wrong", a)).toBe(false);
    expect(verifyPassword("anything", null)).toBe(false);
  });

  it("signs session cookies that die when the password changes", () => {
    const hash = hashPassword("pw-12345678");
    const token = mintUserToken("local:somchai", hash);
    expect(verifyUserToken(token, hash)).toBe(true);
    expect(verifyUserToken(token, hashPassword("pw-12345678"))).toBe(false); // new hash → old cookie invalid
    const [id, issued, sig] = token.split(".");
    const forged = `${Buffer.from("local:admin").toString("base64url")}.${issued}.${sig}`;
    expect(verifyUserToken(forged, hash)).toBe(false);
    expect(id).toBeTruthy();
  });

  it("normalises usernames", () => {
    expect(usernameToOpenId(" SomChai ")).toBe("local:somchai");
  });

  it("rejects a username login that doesn't exist (no DB)", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {}, socket: { remoteAddress: "127.0.0.9" } } as unknown as TrpcContext["req"],
      res: { cookie: () => undefined } as unknown as TrpcContext["res"],
    };
    await expect(
      appRouter.createCaller(ctx).auth.adminLogin({ username: "nobody", password: "whatever-123" }),
    ).rejects.toThrow(/ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง/);
  });

  it("only admins can create accounts", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    await expect(
      appRouter.createCaller(ctx).admin.users.create({ username: "somchai", name: "สมชาย", password: "12345678" }),
    ).rejects.toThrow(/10002/);
  });
});
