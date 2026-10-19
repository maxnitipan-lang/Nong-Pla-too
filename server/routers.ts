import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { adminRouter } from "./adminRouter";
import { askCampusChat, isChatConfigured } from "./chat";
import { getCampusBuildings, getCampusNews, getCampusSettings, getUserRowByOpenId, getWalkNetwork, upsertUser } from "./db";
import {
  USER_COOKIE_MAX_AGE_MS,
  USER_COOKIE_NAME,
  clearLoginFailures,
  isLocalLoginAvailable,
  isLoginBlocked,
  mintUserToken,
  recordLoginFailure,
  usernameToOpenId,
  verifyPassword,
} from "./_core/localAccounts";
import { getWalkingRoute } from "./walkingRoute";
import {
  ADMIN_COOKIE_MAX_AGE_MS,
  ADMIN_COOKIE_NAME,
  isPasswordAdminEnabled,
  mintAdminToken,
  verifyAdminPassword,
} from "./_core/adminSession";
import { getSessionCookieOptions } from "./_core/cookies";
import { isStaff } from "@shared/roles";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

/** Username of the built-in owner account (password = ADMIN_PASSWORD). */
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();

/** Personal accounts need a DB and a signing secret. */
const isLocalLoginConfigured = () => Boolean(process.env.DATABASE_URL) && isLocalLoginAvailable();

const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const appRouter = router({
  system: systemRouter,
  admin: adminRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(ADMIN_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(USER_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    /** Whether the /admin page should show a password form (ADMIN_PASSWORD set). */
    // Also true when personal accounts exist — the form serves both kinds of login.
    adminLoginEnabled: publicProcedure.query(() => isPasswordAdminEnabled() || isLocalLoginConfigured()),

    /**
     * Old API: { password } checks the shared ADMIN_PASSWORD.
     * New: { username, password } signs in a personal account from the admin panel.
     */
    adminLogin: publicProcedure
      .input(
        z.object({
          username: z.string().trim().min(1, "กรอกชื่อผู้ใช้").max(64),
          password: z.string().min(1).max(200),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        if (isLoginBlocked(ctx.req)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "ใส่รหัสผิดหลายครั้งเกินไป — รอ 15 นาทีแล้วลองใหม่",
          });
        }
        const cookieOptions = getSessionCookieOptions(ctx.req);

        // The owner account from .env (ADMIN_USERNAME + ADMIN_PASSWORD) — always an admin,
        // so there is a way in even before any account exists in the database.
        const isOwner = input.username.trim().toLowerCase() === ADMIN_USERNAME;
        if (!isOwner) {
          const row = await getUserRowByOpenId(usernameToOpenId(input.username)).catch(() => undefined);
          if (!row || !isStaff(row.role) || !verifyPassword(input.password, row.passwordHash)) {
            recordLoginFailure(ctx.req);
            throw new TRPCError({ code: "UNAUTHORIZED", message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
          }
          clearLoginFailures(ctx.req);
          await upsertUser({ openId: row.openId, lastSignedIn: new Date() });
          ctx.res.cookie(USER_COOKIE_NAME, mintUserToken(row.openId, row.passwordHash!), {
            ...cookieOptions,
            maxAge: USER_COOKIE_MAX_AGE_MS,
          });
          return { success: true } as const;
        }

        if (!verifyAdminPassword(input.password)) {
          recordLoginFailure(ctx.req);
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "รหัสผ่านไม่ถูกต้อง",
          });
        }
        clearLoginFailures(ctx.req);
        ctx.res.cookie(ADMIN_COOKIE_NAME, mintAdminToken(), {
          ...cookieOptions,
          maxAge: ADMIN_COOKIE_MAX_AGE_MS,
        });
        return { success: true } as const;
      }),

    adminLogout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(ADMIN_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(USER_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  campus: router({
    buildings: publicProcedure.query(() => getCampusBuildings()),
    news: publicProcedure.query(() => getCampusNews()),
    settings: publicProcedure.query(() => getCampusSettings()),

    /**
     * New (not in the old API): walking route from the user's GPS position to a
     * building, proxied to OpenRouteService so the key stays on the server.
     * A mutation (POST) so the user's location never lands in URL/access logs.
     * null = no route available → the client draws a straight dashed line.
     */
    walkingRoute: publicProcedure
      .input(
        z
          .object({
            from: latLngSchema,
            /** Route to a building… */
            buildingId: z.string().trim().min(1).max(64).optional(),
            /** …or to a point, e.g. the campus gate for people coming from outside. */
            to: latLngSchema.optional(),
          })
          .refine((v) => Boolean(v.buildingId) !== Boolean(v.to), "ระบุ buildingId หรือ to อย่างใดอย่างหนึ่ง"),
      )
      .mutation(async ({ input }) => {
        if (input.to) return getWalkingRoute(input.from, input.to);
        const building = (await getCampusBuildings()).find(
          (b) => b.id === input.buildingId,
        );
        const lat = Number(building?.latitude);
        const lng = Number(building?.longitude);
        if (!building?.latitude || !Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }
        return getWalkingRoute(input.from, { lat, lng });
      }),

    /**
     * New (not in the old API): the campus walkway graph. Routing + turn-by-turn
     * runs in the browser over this (shared/walkNetwork.ts), so it also works offline.
     */
    walkNetwork: publicProcedure.query(() => getWalkNetwork()),
  }),

  chat: router({
    configured: publicProcedure.query(() => isChatConfigured()),
    ask: publicProcedure
      .input(
        z.object({
          messages: z
            .array(
              z.object({
                role: z.enum(["system", "user", "assistant"]),
                content: z.string().trim().min(1).max(4000),
              }),
            )
            .min(1)
            .max(30),
          /** New (optional): the reply will be read aloud → short, no markdown. */
          spoken: z.boolean().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        try {
          return await askCampusChat(input.messages, { spoken: input.spoken });
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการเรียก AI",
          });
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
