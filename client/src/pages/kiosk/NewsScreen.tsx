// Kiosk news page: cards for each news item, linking to the college website.
import type { CampusNewsItem } from "@shared/campus";
import { ArrowLeft, ExternalLink } from "lucide-react";

export function NewsScreen({ news, onBack }: { news: CampusNewsItem[]; onBack: () => void }) {
  return (
    <section className="flex-1 py-6">
      <button type="button" onClick={onBack} className="mb-6 flex items-center gap-2 text-xs font-black text-[#287c78]">
        <ArrowLeft size={15} /> กลับหน้าเมนู
      </button>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-4xl font-black tracking-[-0.05em]">ข่าวสารและกิจกรรม</h1>
        <a
          href="https://www.sstc.ac.th/news_325_1"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-sm font-black text-[#287c78]"
        >
          ดูข่าวทั้งหมดบนเว็บวิทยาลัย <ExternalLink size={15} />
        </a>
      </div>
      <div className="mt-6 grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {news.map(item => (
          <NewsCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function NewsCard({ item }: { item: CampusNewsItem }) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[24px] bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
      {item.link && (
        <a
          href={item.link}
          target="_blank"
          rel="noreferrer"
          className="absolute inset-0 z-10"
          aria-label={`อ่านข่าว ${item.title}`}
        />
      )}
      {item.image && (
        <div className="aspect-[16/9] w-full overflow-hidden bg-[var(--muted)]">
          <img
            src={item.image}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-2">
          <span
            className="rounded-full px-3 py-1 text-[10px] font-black"
            style={{ color: item.accent, backgroundColor: `${item.accent}18` }}
          >
            {item.tag}
          </span>
          {item.link && <ExternalLink size={15} className="text-[var(--muted-foreground)]" />}
        </div>
        <h2 className="mt-4 text-lg font-black leading-snug">{item.title}</h2>
        {item.excerpt && <p className="mt-3 text-sm leading-7 text-[var(--muted-foreground)]">{item.excerpt}</p>}
        <p className="mt-auto pt-5 text-xs font-black text-[#287c78]">
          {[item.date, item.time].filter(Boolean).join(" · ")}
        </p>
      </div>
    </article>
  );
}
