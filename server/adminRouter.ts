import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  buildingInputSchema,
  newsInputSchema,
  settingsInputSchema,
  setRoleSchema,
} from "@shared/adminSchemas";
import {
  deleteCampusBuilding,
  deleteCampusNews,
  getCampusBuildings,
  getCampusSettings,
  isDatabaseConfigured,
  listCampusNewsAdmin,
  listUsers,
  setUserRole,
  updateCampusSettings,
  upsertCampusBuilding,
  upsertCampusNews,
} from "./db";
import { adminProcedure, router } from "./_core/trpc";

const idInput = z.object({ id: z.string().trim().min(1).max(64) });

/** Turn a thrown DB error into a tRPC error that carries its message to the UI. */
async function run(fn: () => Promise<unknown>) {
  try {
    await fn();
    return { success: true } as const;
  } catch (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ",
    });
  }
}

export const adminRouter = router({
  overview: adminProcedure.query(async () => {
    const [buildings, news, allUsers, settings] = await Promise.all([
      getCampusBuildings(),
      listCampusNewsAdmin(),
      listUsers(),
      getCampusSettings(),
    ]);
    return {
      databaseConfigured: isDatabaseConfigured(),
      buildingCount: buildings.length,
      newsCount: news.length,
      publishedNewsCount: news.filter((item) => item.published).length,
      userCount: allUsers.length,
      adminCount: allUsers.filter((user) => user.role === "admin").length,
      mapConfigured: settings.mapEmbedUrl.length > 0,
    };
  }),

  buildings: router({
    list: adminProcedure.query(() => getCampusBuildings()),
    save: adminProcedure
      .input(buildingInputSchema)
      .mutation(({ input }) => run(() => upsertCampusBuilding(input))),
    delete: adminProcedure
      .input(idInput)
      .mutation(({ input }) => run(() => deleteCampusBuilding(input.id))),
  }),

  news: router({
    list: adminProcedure.query(() => listCampusNewsAdmin()),
    save: adminProcedure
      .input(newsInputSchema)
      .mutation(({ input }) => run(() => upsertCampusNews(input))),
    delete: adminProcedure
      .input(idInput)
      .mutation(({ input }) => run(() => deleteCampusNews(input.id))),
  }),

  users: router({
    list: adminProcedure.query(() => listUsers()),
    setRole: adminProcedure.input(setRoleSchema).mutation(({ input, ctx }) => {
      if (input.openId === ctx.user.openId && input.role !== "admin") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "ปลดสิทธิ์ผู้ดูแลของบัญชีตัวเองไม่ได้",
        });
      }
      return run(() => setUserRole(input.openId, input.role));
    }),
  }),

  settings: router({
    get: adminProcedure.query(() => getCampusSettings()),
    update: adminProcedure
      .input(settingsInputSchema)
      .mutation(({ input }) => run(() => updateCampusSettings(input))),
  }),
});
