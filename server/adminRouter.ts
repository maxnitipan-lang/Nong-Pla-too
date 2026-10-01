import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  buildingInputSchema,
  importedBuildingSchema,
  walkNetworkSchema,
  newsInputSchema,
  newAdminAccountSchema,
  resetPasswordSchema,
  settingsInputSchema,
  setRoleSchema,
} from "@shared/adminSchemas";
import {
  deleteCampusBuilding,
  deleteCampusNews,
  getCampusBuildings,
  getCampusSettings,
  getWalkNetwork,
  importCampusBuildings,
  resetWalkNetwork,
  saveWalkNetwork,
  isDatabaseConfigured,
  listCampusNewsAdmin,
  createLocalAdmin,
  deleteUser,
  listUsers,
  setLocalPassword,
  setUserRole,
  updateCampusSettings,
  upsertCampusBuilding,
  upsertCampusNews,
} from "./db";
import { syncCollegeNews } from "./newsScraper";
import { adminProcedure, editorProcedure, router, staffProcedure } from "./_core/trpc";

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
  overview: staffProcedure.query(async () => {
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
    list: staffProcedure.query(() => getCampusBuildings()),
    save: editorProcedure
      .input(buildingInputSchema)
      .mutation(({ input }) => run(() => upsertCampusBuilding(input))),
    delete: editorProcedure
      .input(idInput)
      .mutation(({ input }) => run(() => deleteCampusBuilding(input.id))),
    /** New (not in the old API): bulk upsert from a Google My Maps CSV/KML export. */
    import: editorProcedure
      .input(z.object({ items: z.array(importedBuildingSchema).min(1).max(200) }))
      .mutation(async ({ input }) => {
        try {
          return await importCampusBuildings(input.items);
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "นำเข้าอาคารไม่สำเร็จ",
          });
        }
      }),
  }),

  news: router({
    list: staffProcedure.query(() => listCampusNewsAdmin()),
    save: editorProcedure
      .input(newsInputSchema)
      .mutation(({ input }) => run(() => upsertCampusNews(input))),
    delete: editorProcedure
      .input(idInput)
      .mutation(({ input }) => run(() => deleteCampusNews(input.id))),
    syncFromWebsite: editorProcedure.mutation(async () => {
      try {
        return await syncCollegeNews();
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "ดึงข่าวจากเว็บวิทยาลัยไม่สำเร็จ",
        });
      }
    }),
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
    /** New: a personal username/password admin account. */
    create: adminProcedure
      .input(newAdminAccountSchema)
      .mutation(({ input }) => run(() => createLocalAdmin(input))),
    resetPassword: adminProcedure
      .input(resetPasswordSchema)
      .mutation(({ input }) => run(() => setLocalPassword(input.openId, input.password))),
    delete: adminProcedure
      .input(z.object({ openId: z.string().trim().min(1).max(64) }))
      .mutation(({ input, ctx }) => {
        if (input.openId === ctx.user.openId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "ลบบัญชีของตัวเองไม่ได้" });
        }
        return run(() => deleteUser(input.openId));
      }),
  }),

  /** New (not in the old API): the walkway graph used for turn-by-turn routes. */
  walkNetwork: router({
    get: staffProcedure.query(() => getWalkNetwork()),
    save: editorProcedure
      .input(walkNetworkSchema)
      .mutation(({ input }) => run(() => saveWalkNetwork(input))),
    reset: editorProcedure.mutation(() => run(() => resetWalkNetwork())),
  }),

  settings: router({
    get: staffProcedure.query(() => getCampusSettings()),
    update: editorProcedure
      .input(settingsInputSchema)
      .mutation(({ input }) => run(() => updateCampusSettings(input))),
  }),
});
