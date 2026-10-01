// Pull the latest "จดหมายข่าวประชาสัมพันธ์" items from the college website
// (https://www.sstc.ac.th/news_325_1) and upsert them into `campus_news`.
//
// The site has no API/RSS, so this scrapes the HTML. If the college changes
// their page markup this will stop finding items and throw a clear error —
// the admin sees it, hand-entered news keeps working, and nothing else breaks.

import * as cheerio from "cheerio";
import type { NewsInput } from "@shared/adminSchemas";
import { upsertCampusNews } from "./db";

const SITE_BASE = "https://www.sstc.ac.th/";
const NEWSLETTER_LIST_URL = "https://www.sstc.ac.th/news_325_1";
const ACCENTS = ["#eb8b67", "#3c8f8d", "#bc7a3e", "#5b7da9", "#7e6aa8"];
const DEFAULT_LIMIT = 6;

/** Scrape (but do not save) the newest newsletter items. */
export async function scrapeCollegeNews(limit = DEFAULT_LIMIT): Promise<NewsInput[]> {
  // The college site sits behind Cloudflare, which turns away many data-centre
  // requests (Render gets 403). Ask like a normal browser first, then as our bot.
  const attempts: Record<string, string>[] = [
    {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "th-TH,th;q=0.9,en;q=0.8",
    },
    { "User-Agent": "Mozilla/5.0 (compatible; CampusGuideBot/1.0; +https://www.sstc.ac.th)" },
  ];
  let res: Response | null = null;
  for (const headers of attempts) {
    res = await fetch(NEWSLETTER_LIST_URL, { headers, signal: AbortSignal.timeout(20_000) });
    if (res.ok) break;
  }
  if (!res || !res.ok) {
    const status = res?.status ?? 0;
    throw new Error(
      status === 403
        ? "เว็บวิทยาลัยปฏิเสธการดึงข่าวจากเซิร์ฟเวอร์ (HTTP 403 — Cloudflare บล็อก) — ดึงจากคอมพิวเตอร์ในวิทยาลัยแทนด้วยคำสั่ง pnpm news:sync"
        : `ดึงข่าวจากเว็บวิทยาลัยไม่สำเร็จ (HTTP ${status})`,
    );
  }

  const $ = cheerio.load(await res.text());
  const items: NewsInput[] = [];

  $(".box-news article").each((_i, el) => {
    if (items.length >= limit) return false;

    const $el = $(el);
    const $titleLink = $el.find("h3.card-title a").first();
    const href = ($titleLink.attr("href") || $el.find("a.txt-link").first().attr("href") || "").trim();
    const idMatch = href.match(/(\d+)\s*$/);
    // The title lives in the <h3> link text, or a `title=` attr on any of the
    // article's links (the image link always carries it).
    const title = (
      $titleLink.text().trim() ||
      $titleLink.attr("title")?.trim() ||
      $el.find("a.txt-link[title]").first().attr("title")?.trim() ||
      ""
    );
    if (!idMatch || !title) return;

    const numericId = idMatch[1];
    const rawDate = $el
      .find("time")
      .first()
      .text()
      .replace(/ /g, " ")
      .trim();
    const dateLabel = rawDate.replace(/^วันที่\s*/, "").trim() || rawDate || "—";

    const $img = $el.find("img").first();
    const imgSrc = ($img.attr("data-src") || $img.attr("src") || "").trim();
    let imageUrl = "";
    try {
      if (imgSrc) imageUrl = new URL(imgSrc, SITE_BASE).href;
    } catch {
      imageUrl = "";
    }

    items.push({
      id: `sstc-325-${numericId}`,
      tag: "จดหมายข่าว",
      title,
      excerpt: "",
      dateLabel,
      timeLabel: "ข่าวจากเว็บวิทยาลัย",
      accent: ACCENTS[items.length % ACCENTS.length]!,
      link: `${SITE_BASE}news-detail_325_${numericId}`,
      imageUrl,
      source: "sstc.ac.th",
      published: true,
      sortOrder: 100 + items.length,
    });

    return undefined;
  });

  if (items.length === 0) {
    throw new Error(
      "ไม่พบรายการข่าวในหน้าเว็บวิทยาลัย — โครงสร้างหน้าเว็บอาจเปลี่ยน ต้องปรับ newsScraper.ts",
    );
  }

  return items;
}

/** Scrape and upsert. Returns how many items were written. */
export async function syncCollegeNews(): Promise<{ imported: number }> {
  const items = await scrapeCollegeNews();
  for (const item of items) {
    await upsertCampusNews(item);
  }
  return { imported: items.length };
}

const AUTO_SYNC_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * Keep the college newsletter fresh without an admin pressing "sync": pull once
 * shortly after start-up, then every 6 hours. Needs a database (writes go to
 * `campus_news`); failures are logged and retried on the next tick.
 */
export function startNewsAutoSync(): void {
  if (!process.env.DATABASE_URL || process.env.NEWS_AUTO_SYNC === "0") return;
  const tick = async () => {
    try {
      const { imported } = await syncCollegeNews();
      console.log(`[News] synced ${imported} items from sstc.ac.th`);
    } catch (error) {
      console.log("[News] auto-sync skipped:", error instanceof Error ? error.message : error);
    }
  };
  setTimeout(tick, 15_000).unref();
  setInterval(tick, AUTO_SYNC_EVERY_MS).unref();
}
