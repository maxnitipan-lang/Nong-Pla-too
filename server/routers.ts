import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { adminRouter } from "./adminRouter";
import { askCampusChat, isChatConfigured } from "./chat";
import { getCampusBuildings, getCampusNews, getCampusSettings } from "./db";
import {
  ADMIN_COOKIE_MAX_AGE_MS,
  ADMIN_COOKIE_NAME,
  isPasswordAdminEnabled,
  mintAdminToken,
  verifyAdminPassword,
} from "./_core/adminSession";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

export const appRouter = router({
  system: systemRouter,
  admin: adminRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(ADMIN_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    /** Whether the /admin page should show a password form (ADMIN_PASSWORD set). */
    adminLoginEnabled: publicProcedure.query(() => isPasswordAdminEnabled()),

    adminLogin: publicProcedure
      .input(z.object({ password: z.string().min(1).max(200) }))
      .mutation(({ input, ctx }) => {
        if (!verifyAdminPassword(input.password)) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "รหัสผ่านไม่ถูกต้อง",
          });
        }
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(ADMIN_COOKIE_NAME, mintAdminToken(), {
          ...cookieOptions,
          maxAge: ADMIN_COOKIE_MAX_AGE_MS,
        });
        return { success: true } as const;
      }),

    adminLogout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(ADMIN_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  campus: router({
    buildings: publicProcedure.query(() => getCampusBuildings()),
    news: publicProcedure.query(() => getCampusNews()),
    settings: publicProcedure.query(() => getCampusSettings()),
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
        }),
      )
      .mutation(async ({ input }) => {
        try {
          return await askCampusChat(input.messages);
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
