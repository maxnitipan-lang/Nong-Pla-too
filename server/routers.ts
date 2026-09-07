import { COOKIE_NAME } from "@shared/const";
import { getCampusBuildings, getCampusNews } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  campus: router({
    buildings: publicProcedure.query(() => getCampusBuildings()),
    news: publicProcedure.query(() => getCampusNews()),
  }),
});

export type AppRouter = typeof appRouter;
