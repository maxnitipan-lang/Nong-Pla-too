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
  const res = await fetch(NEWSLETTER_LIST_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; CampusGuideBot/1.0; +https://www.sstc.ac.th)",
    },
  });
  if (!res.ok) {
    throw new Error(`ดึงข่าวจากเว็บวิทยาลัยไม่สำเร็จ (HTTP ${res.status})`);
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
