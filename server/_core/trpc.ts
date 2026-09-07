import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;

/** Rejects the call unless a user is attached to the context. */
const requireUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Rejects the call unless the user has the `admin` role. */
const requireAdmin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(requireUser);
export const adminProcedure = t.procedure.use(requireAdmin);

export { t };
