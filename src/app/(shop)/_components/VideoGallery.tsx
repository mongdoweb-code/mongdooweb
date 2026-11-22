"use client";
// วิดีโอหน้าร้าน: การ์ดคลิป + ตัวเล่นหน้าต่างใหญ่ (ใช้ทั้งหน้า /videos, หน้าสินค้า และหน้าแรก)
// - page: แท็บ ทั้งหมด / วิดีโอ (แนวนอน) / Shorts·Reels (แนวตั้ง) + ตัวกรองหัวข้อ/แหล่ง — สถานะอยู่ใน URL (?tab=&topic=&src=&v=) แชร์ลิงก์ได้
// - strip: แถวการ์ดเดียว (หน้าสินค้า/หน้าแรก)
// ตัวเล่นของแพลตฟอร์ม (YouTube/Facebook/TikTok/Instagram) โหลดเมื่อลูกค้ากดเล่นเท่านั้น — หน้าเว็บเร็ว และไม่ส่งข้อมูลให้แพลตฟอร์มก่อนลูกค้าเลือกเอง
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VideoCard } from "@/lib/videos";
import { VIDEO_SOURCES, durationText, type VideoSourceKey } from "@/lib/video-links";
import "./video-gallery.css";

type Tab = "all" | "h" | "v";
const baht = (s: number) => `฿${(s / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
const views = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString("th-TH", { maximumFractionDigits: 1 })} พัน` : n.toLocaleString("th-TH"));

/** ไอคอนแหล่งคลิป (สีของแพลตฟอร์ม) */
export function SourceIcon({ s, size = 18 }: { s: VideoSourceKey; size?: number }) {
  const paths: Record<VideoSourceKey, React.ReactNode> = {
    YOUTUBE: <path d="M10 8.5v7l6-3.5z" fill="#fff" />,
    FACEBOOK: <path d="M13.2 19v-6h2l.3-2.4h-2.3V9.1c0-.7.2-1.1 1.2-1.1h1.2V5.9a16 16 0 0 0-1.8-.1c-1.8 0-3 1.1-3 3.1v1.7h-2V13h2v6z" fill="#fff" />,
    TIKTOK: <path d="M14.5 5h-2.3v9.3a2 2 0 1 1-1.6-2V10a4.3 4.3 0 1 0 3.9 4.3V9.6a5 5 0 0 0 2.9.9V8.2a2.9 2.9 0 0 1-2.9-3.2z" fill="#fff" />,
    INSTAGRAM: <><rect x="6.5" y="6.5" width="11" height="11" rx="3.2" fill="none" stroke="#fff" strokeWidth="1.6" /><circle cx="12" cy="12" r="2.6" fill="none" stroke="#fff" strokeWidth="1.6" /><circle cx="15.3" cy="8.7" r=".9" fill="#fff" /></>,
    UPLOAD: <><rect x="8.5" y="5" width="7" height="14" rx="1.6" fill="none" stroke="#fff" strokeWidth="1.6" /><path d="M11 16.5h2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" /></>,
  };
  return (
    <svg className="vg-src" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <rect width="24" height="24" rx="6" fill={s === "INSTAGRAM" ? "url(#vgIg)" : VIDEO_SOURCES[s].color} />
      {s === "INSTAGRAM" && (
        <defs>
          <linearGradient id="vgIg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#F58529" /><stop offset=".5" stopColor="#DD2A7B" /><stop offset="1" stopColor="#8134AF" /></linearGradient>
        </defs>
      )}
      {paths[s]}
    </svg>
  );
}

function Card({ v, onOpen, eager }: { v: VideoCard; onOpen: () => void; eager?: boolean }) {
  return (
    <article className={`vg-card ${v.vertical ? "is-v" : "is-h"}`}>
      <button type="button" className="vg-thumb" onClick={onOpen} aria-label={`เล่นคลิป: ${v.title}`} data-video-id={v.id}
        style={v.poster ? undefined : { background: `linear-gradient(150deg, #1d1d1f, ${VIDEO_SOURCES[v.source].color})` }}>
        {v.poster && (
          // eslint-disable-next-line @next/next/no-img-element -- รูปปกจาก /media หรือ i.ytimg.com
          <img src={v.poster} alt="" loading={eager ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" />
        )}
        <span className="vg-badge"><SourceIcon s={v.source} size={16} />{v.sourceName}</span>
        <span className="vg-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg></span>
        {v.seconds ? <span className="vg-dur">{durationText(v.seconds)}</span> : null}
      </button>
      <div className="vg-meta">
        <h3 className="vg-title">
          <button type="button" onClick={onOpen}>{v.title}</button>
        </h3>
        <small>{[v.topic, v.views > 0 ? `ดู ${views(v.views)} ครั้ง` : ""].filter(Boolean).join(" · ")}</small>
        {v.product && (
          <a className="vg-prod" href={`/product/${encodeURIComponent(v.product.slug)}`}>
            <span className="vg-prod-img">
              {v.product.img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.product.img} alt="" loading="lazy" decoding="async" />
              ) : null}
            </span>
            <span className="vg-prod-n">{v.product.name}</span>
            {v.product.price > 0 && <b>{baht(v.product.price)}</b>}
          </a>
        )}
      </div>
    </article>
  );
}

function Player({ v, onClose, onPrev, onNext, count }: { v: VideoCard; onClose: () => void; onPrev: () => void; onNext: () => void; count: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    // นับยอดเปิดดู (เซิร์ฟเวอร์กันนับซ้ำ/บอตเอง)
    fetch(`/api/videos/${encodeURIComponent(v.id)}/view`, { method: "POST", keepalive: true }).catch(() => {});
  }, [v.id]);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>(".vg-close")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && count > 1) onNext();
      else if (e.key === "ArrowLeft" && count > 1) onPrev();
      else if (e.key === "Tab" && box.current) {
        const f = [...box.current.querySelectorAll<HTMLElement>("button,a[href],video,iframe")].filter((x) => !x.hasAttribute("disabled"));
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener("keydown", key);
    const html = document.documentElement;
    const was = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      html.style.overflow = was;
      prev?.focus?.();
    };
  }, [onClose, onNext, onPrev, count]);
  const share = async () => {
    const url = `${location.origin}/videos?v=${encodeURIComponent(v.id)}`;
    try {
      if (navigator.share) await navigator.share({ title: v.title, url });
      else await navigator.clipboard.writeText(url);
    } catch {}
  };
  return (
    <div className="vg-modal" role="dialog" aria-modal="true" aria-label={v.title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className={`vg-player${v.vertical ? " is-v" : ""}`}>
        <button type="button" className="vg-close" onClick={onClose} aria-label="ปิด">✕</button>
        <div className="vg-screen">
          {v.file ? (
            failed ? (
              <div className="vg-fail">
                <b>เครื่องนี้เล่นไฟล์คลิปนี้ไม่ได้</b>
                <span>ลองเปิดด้วย Safari หรือ Chrome รุ่นล่าสุด</span>
              </div>
            ) : (
              <video key={v.id} src={v.file} poster={v.poster ?? undefined} controls autoPlay playsInline preload="metadata" onError={() => setFailed(true)} />
            )
          ) : v.embed ? (
            <iframe key={v.id} src={v.embed} title={v.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          ) : (
            <div className="vg-fail"><b>เปิดคลิปนี้ในเว็บไม่ได้</b>{v.url && <a href={v.url} target="_blank" rel="noopener">{VIDEO_SOURCES[v.source].app} ↗</a>}</div>
          )}
        </div>
        <div className="vg-side">
          <span className="vg-side-src"><SourceIcon s={v.source} />{v.sourceName}{v.seconds ? ` · ${durationText(v.seconds)}` : ""}</span>
          <h2>{v.title}</h2>
          <small>{[v.topic, v.views > 0 ? `ดู ${views(v.views)} ครั้ง` : ""].filter(Boolean).join(" · ")}</small>
          {v.product && (
            <div className="vg-side-prod">
              <a className="vg-prod" href={`/product/${encodeURIComponent(v.product.slug)}`}>
                <span className="vg-prod-img">
                  {v.product.img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.product.img} alt="" />
                  ) : null}
                </span>
                <span className="vg-prod-n">{v.product.name}</span>
                {v.product.price > 0 && <b>{baht(v.product.price)}</b>}
              </a>
              <a className="btn btn-primary vg-buy" href={`/product/${encodeURIComponent(v.product.slug)}`}>ดูสินค้า / สั่งซื้อ</a>
            </div>
          )}
          <div className="vg-side-acts">
            {v.url && <a className="vg-pill" href={v.url} target="_blank" rel="noopener">{VIDEO_SOURCES[v.source].app} ↗</a>}
            <button type="button" className="vg-pill" onClick={share}>แชร์คลิป</button>
          </div>
          {count > 1 && (
            <div className="vg-nav">
              <button type="button" className="vg-pill" onClick={onPrev}>‹ ก่อนหน้า</button>
              <button type="button" className="vg-pill" onClick={onNext}>ถัดไป ›</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** หน้า /videos: หน้าละ 24 คลิป · แถวละ 6 (คลิปแนวนอนกว้าง 2 ช่อง) */
export const VIDEOS_PER_PAGE = 24;

/** เลขหน้าที่แสดง: หน้าแรก หน้าสุดท้าย และรอบหน้าปัจจุบัน — ที่เหลือเป็น … */
function pageList(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  nums.forEach((n, i) => {
    if (i && n - nums[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

export function VideoGallery({ videos, mode = "page", initial }: { videos: VideoCard[]; mode?: "page" | "strip"; initial?: { tab?: string; topic?: string; src?: string; v?: string; page?: string } }) {
  const [tab, setTabRaw] = useState<Tab>(initial?.tab === "h" || initial?.tab === "v" ? initial.tab : "all");
  const [topic, setTopicRaw] = useState(initial?.topic && videos.some((v) => v.topic === initial.topic) ? initial.topic : "");
  const [src, setSrcRaw] = useState(initial?.src && videos.some((v) => v.source === initial.src) ? initial.src : "");
  const [page, setPageRaw] = useState(Math.max(1, Math.floor(Number(initial?.page)) || 1));
  const top = useRef<HTMLDivElement>(null);
  // เปลี่ยนแท็บ/ตัวกรอง = กลับไปหน้า 1
  const setTab = (t: Tab) => { setTabRaw(t); setPageRaw(1); };
  const setTopic = (t: string) => { setTopicRaw(t); setPageRaw(1); };
  const setSrc = (t: string) => { setSrcRaw(t); setPageRaw(1); };
  const goPage = (n: number) => {
    setPageRaw(n);
    requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const [open, setOpen] = useState<string | null>(initial?.v && videos.some((v) => v.id === initial.v) ? initial.v : null);

  const topics = useMemo(() => [...new Set(videos.map((v) => v.topic).filter((t): t is string => !!t))], [videos]);
  const sources = useMemo(() => [...new Set(videos.map((v) => v.source))], [videos]);
  const match = useCallback((v: VideoCard) => (!topic || v.topic === topic) && (!src || v.source === src), [topic, src]);
  const vert = videos.filter((v) => v.vertical && match(v));
  const horiz = videos.filter((v) => !v.vertical && match(v));
  const shown = mode === "strip" ? videos : [...(tab !== "h" ? vert : []), ...(tab !== "v" ? horiz : [])];
  const pages = Math.max(1, Math.ceil(shown.length / VIDEOS_PER_PAGE));
  const curPage = Math.min(page, pages);
  const onPage = shown.slice((curPage - 1) * VIDEOS_PER_PAGE, curPage * VIDEOS_PER_PAGE);
  const pageVert = onPage.filter((v) => v.vertical), pageHoriz = onPage.filter((v) => !v.vertical);

  // สถานะอยู่ใน URL (แชร์/กดย้อนกลับได้) — เฉพาะหน้า /videos
  useEffect(() => {
    if (mode !== "page") return;
    const q = new URLSearchParams();
    if (tab !== "all") q.set("tab", tab);
    if (topic) q.set("topic", topic);
    if (src) q.set("src", src);
    if (curPage > 1) q.set("page", String(curPage));
    if (open) q.set("v", open);
    const next = `${location.pathname}${q.size ? `?${q}` : ""}`;
    if (next !== `${location.pathname}${location.search}`) history.replaceState(history.state, "", next);
  }, [mode, tab, topic, src, curPage, open]);

  const cur = open ? videos.find((v) => v.id === open) ?? null : null;
  const step = (d: number) => {
    const list = shown.some((v) => v.id === open) ? shown : videos;
    const i = list.findIndex((v) => v.id === open);
    setOpen(list[(i + d + list.length) % list.length].id);
  };
  const player = cur && <Player key={cur.id} v={cur} onClose={() => setOpen(null)} onPrev={() => step(-1)} onNext={() => step(1)} count={shown.length || videos.length} />;

  if (mode === "strip")
    return (
      <>
        <div className="vg-strip" role="list">
          {videos.map((v, i) => (
            <div role="listitem" key={v.id} className={v.vertical ? "is-v" : "is-h"}>
              <Card v={v} onOpen={() => setOpen(v.id)} eager={i < 2} />
            </div>
          ))}
        </div>
        {player}
      </>
    );

  const tabBtn = (k: Tab, label: string, n: number) => (
    <button type="button" role="tab" aria-selected={tab === k} className={`vg-tab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>
      {label}<em>{n}</em>
    </button>
  );
  return (
    <div className="vg">
      <div className="vg-tabs" role="tablist" aria-label="แบบคลิป">
        {tabBtn("all", "ทั้งหมด", vert.length + horiz.length)}
        {tabBtn("h", "วิดีโอ", horiz.length)}
        {tabBtn("v", "Shorts · Reels", vert.length)}
      </div>
      {(topics.length > 1 || sources.length > 1) && (
        <div className="vg-filters">
          {topics.length > 1 && (
            <div className="vg-chips" role="group" aria-label="หัวข้อ">
              <button type="button" className={`vg-chip${!topic ? " on" : ""}`} aria-pressed={!topic} onClick={() => setTopic("")}>ทุกหัวข้อ</button>
              {topics.map((t) => (
                <button key={t} type="button" className={`vg-chip${topic === t ? " on" : ""}`} aria-pressed={topic === t} onClick={() => setTopic(topic === t ? "" : t)}>{t}</button>
              ))}
            </div>
          )}
          {sources.length > 1 && (
            <div className="vg-chips" role="group" aria-label="แหล่งคลิป">
              <button type="button" className={`vg-chip${!src ? " on" : ""}`} aria-pressed={!src} onClick={() => setSrc("")}>ทุกแหล่ง</button>
              {sources.map((s) => (
                <button key={s} type="button" className={`vg-chip${src === s ? " on" : ""}`} aria-pressed={src === s} onClick={() => setSrc(src === s ? "" : s)}>
                  <SourceIcon s={s} size={16} />{VIDEO_SOURCES[s].name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div ref={top} className="vg-top" />
      {pageVert.length > 0 && (
        <section className="vg-sec" aria-labelledby="vg-v-h">
          <h2 className="vg-h" id="vg-v-h">Shorts · Reels <small>คลิปสั้นแนวตั้ง {vert.length} คลิป</small></h2>
          <div className="vg-grid6">
            {pageVert.map((v, i) => <Card key={v.id} v={v} onOpen={() => setOpen(v.id)} eager={i < 6} />)}
          </div>
        </section>
      )}
      {pageHoriz.length > 0 && (
        <section className="vg-sec" aria-labelledby="vg-h-h">
          <h2 className="vg-h" id="vg-h-h">วิดีโอ <small>{horiz.length} คลิป</small></h2>
          <div className="vg-grid6">
            {pageHoriz.map((v, i) => <Card key={v.id} v={v} onOpen={() => setOpen(v.id)} eager={i < 3} />)}
          </div>
        </section>
      )}
      {pages > 1 && (
        <nav className="vg-pager" aria-label="แบ่งหน้า">
          <span className="vg-pager-info">หน้า {curPage} จาก {pages} · {shown.length} คลิป</span>
          <span className="vg-pager-btns">
            <button type="button" disabled={curPage <= 1} onClick={() => goPage(curPage - 1)} aria-label="หน้าก่อนหน้า">‹ ก่อนหน้า</button>
            {pageList(curPage, pages).map((n, i) =>
              n === "…" ? (
                <span key={`g${i}`} className="vg-gap" aria-hidden="true">…</span>
              ) : (
                <button key={n} type="button" className={n === curPage ? "on" : ""} aria-current={n === curPage ? "page" : undefined} aria-label={`หน้า ${n}`} onClick={() => goPage(n)}>{n}</button>
              ),
            )}
            <button type="button" disabled={curPage >= pages} onClick={() => goPage(curPage + 1)} aria-label="หน้าถัดไป">ถัดไป ›</button>
          </span>
        </nav>
      )}
      {!vert.length && !horiz.length && <p className="vg-empty">ไม่มีคลิปตามตัวกรองนี้ — <button type="button" onClick={() => { setTopic(""); setSrc(""); setTab("all"); }}>ดูทั้งหมด</button></p>}
      {player}
    </div>
  );
}
