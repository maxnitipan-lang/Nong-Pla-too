import { TRPCError } from "@trpc/server";
import { aiUsage } from "./aiStore.js";
import { KNOWLEDGE_CATEGORIES, MAX_CONTENT, deleteKnowledge, listKnowledge, readPdf, saveKnowledge } from "./aiKnowledge.js";
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
} from "../shared/adminSchemas.js";
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
} from "./db.js";
import { saveImage } from "./images.js";
import { clearAiAnswerCache, draftAnswer } from "./chat.js";
import { approveAgreed, deleteLearned, getLearned, listLearned, updateLearned, writeMissingAnswers } from "./chatLearning.js";
import { syncCollegeNews } from "./newsScraper.js";
import { adminProcedure, editorProcedure, router, staffProcedure } from "./_core/trpc.js";

const idInput = z.object({ id: z.string().trim().min(1).max(64) });

/** Turn a thrown DB error into a tRPC error that carries its message to the UI. */
async function run(fn) {
  try {
    await fn();
    // Buildings, news or settings changed: remembered AI answers may be out of date.
    clearAiAnswerCache();
    return { success: true };
  } catch (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ",
    });
  }
}

const DAY = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "วันที่ไม่ถูกต้อง");
const knowledgeInputSchema = z.object({
  id: z.string().max(40).regex(/^[a-z0-9-]*$/).default(""),
  title: z.string().trim().min(1, "กรอกหัวข้อ").max(255),
  content: z.string().trim().min(1, "กรอกเนื้อหา").max(MAX_CONTENT, `เนื้อหายาวเกิน ${MAX_CONTENT.toLocaleString()} ตัวอักษร`),
  category: z.enum(KNOWLEDGE_CATEGORIES),
  validFrom: DAY.default(""),
  validUntil: DAY.default(""),
  enabled: z.boolean().default(true),
});

export const adminRouter = router({
  overview: staffProcedure.query(async () => {
    const [buildings, news, allUsers, settings, aiUsageDays] = await Promise.all([
      getCampusBuildings(),
      listCampusNewsAdmin(),
      listUsers(),
      getCampusSettings(),
      aiUsage(7),
    ]);
    return {
      aiUsage: aiUsageDays,
      databaseConfigured: isDatabaseConfigured(),
      buildingCount: buildings.length,
      newsCount: news.length,
      publishedNewsCount: news.filter(item => item.published).length,
      userCount: allUsers.length,
      adminCount: allUsers.filter(user => user.role === "admin").length,
      mapConfigured: settings.mapEmbedUrl.length > 0,
    };
  }),

  buildings: router({
    list: staffProcedure.query(() => getCampusBuildings()),
    save: editorProcedure.input(buildingInputSchema).mutation(({ input }) => run(() => upsertCampusBuilding(input))),
    delete: editorProcedure.input(idInput).mutation(({ input }) => run(() => deleteCampusBuilding(input.id))),
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
    save: editorProcedure.input(newsInputSchema).mutation(({ input }) => run(() => upsertCampusNews(input))),
    delete: editorProcedure.input(idInput).mutation(({ input }) => run(() => deleteCampusNews(input.id))),
    syncFromWebsite: editorProcedure.mutation(async () => {
      try {
        return await syncCollegeNews();
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "ดึงข่าวจากเว็บวิทยาลัยไม่สำเร็จ",
        });
      }
    }),
  }),

  /** "ความรู้ของ AI": facts for the AI only (see aiKnowledge.js). */
  knowledge: router({
    list: staffProcedure.query(() => listKnowledge()),
    save: editorProcedure.input(knowledgeInputSchema).mutation(async ({ input, ctx }) => {
      let saved;
      await run(async () => {
        saved = await saveKnowledge(input, ctx.user?.name ?? "");
      });
      return saved;
    }),
    delete: editorProcedure.input(idInput).mutation(({ input }) => run(() => deleteKnowledge(input.id))),
    /** A PDF read by the AI: returns a draft for the admin to check — nothing is saved. */
    readPdf: editorProcedure
      .input(z.object({ base64: z.string().min(100).max(27_000_000, "ไฟล์ใหญ่เกิน 20 MB") }))
      .mutation(async ({ input }) => {
        try {
          return await readPdf(input.base64.replace(/^data:[^,]*,/, ""));
        } catch (error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "อ่าน PDF ไม่สำเร็จ" });
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
    create: adminProcedure.input(newAdminAccountSchema).mutation(({ input }) => run(() => createLocalAdmin(input))),
    resetPassword: adminProcedure
      .input(resetPasswordSchema)
      .mutation(({ input }) => run(() => setLocalPassword(input.openId, input.password))),
    delete: adminProcedure.input(z.object({ openId: z.string().trim().min(1).max(64) })).mutation(({ input, ctx }) => {
      if (input.openId === ctx.user.openId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ลบบัญชีของตัวเองไม่ได้" });
      }
      return run(() => deleteUser(input.openId));
    }),
  }),

  /** New (not in the old API): upload a picture (department logo, building photo) — returns its URL. */
  images: router({
    upload: editorProcedure.input(z.object({ dataUrl: z.string().max(2_100_000) })).mutation(async ({ input }) => {
      try {
        return await saveImage(input.dataUrl);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "อัปโหลดรูปไม่สำเร็จ",
        });
      }
    }),
  }),

  /** New (not in the old API): the walkway graph used for turn-by-turn routes. */
  walkNetwork: router({
    get: staffProcedure.query(() => getWalkNetwork()),
    save: editorProcedure.input(walkNetworkSchema).mutation(({ input }) => run(() => saveWalkNetwork(input))),
    reset: editorProcedure.mutation(() => run(() => resetWalkNetwork())),
  }),

  settings: router({
    get: staffProcedure.query(() => getCampusSettings()),
    update: editorProcedure.input(settingsInputSchema).mutation(({ input }) => run(() => updateCampusSettings(input))),
  }),

  // What Nong Platoo learned from real questions (server/chatLearning.js).
  learned: router({
    list: staffProcedure.query(() => listLearned()),
    update: editorProcedure
      .input(
        z.object({
          id: z.string().trim().min(1).max(40),
          answer: z.string().trim().min(1).max(4000).optional(),
          status: z.enum(["new", "approved", "hidden"]).optional(),
          category: z.enum(["building", "news", "program", "offtopic", "other"]).optional(),
        })
      )
      .mutation(({ input }) => run(() => updateLearned(input))),
    delete: editorProcedure.input(z.object({ id: z.string().trim().min(1).max(40) })).mutation(({ input }) => run(() => deleteLearned(input.id))),
    approveAgreed: editorProcedure.mutation(() => run(() => approveAgreed())),
    // Let the AI write answers now for questions that could not be answered (see writeMissingAnswers).
    aiWrite: editorProcedure.mutation(async () => {
      try {
        return await writeMissingAnswers(draftAnswer, 10);
      } catch (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "AI เขียนคำตอบไม่สำเร็จ" });
      }
    }),
    // A suggested answer from the AI, for the admin to edit before saving (nothing is saved here).
    draft: editorProcedure.input(z.object({ id: z.string().trim().min(1).max(40) })).mutation(async ({ input }) => {
      const row = await getLearned(input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบคำถามนี้" });
      try {
        return await draftAnswer(row.question, row.lang === "en" ? "en" : "th");
      } catch (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "AI ร่างคำตอบไม่สำเร็จ" });
      }
    }),
  }),
});
