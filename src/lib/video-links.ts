// หน้าวิดีโอ: แยกลิงก์คลิปจาก YouTube / Facebook / TikTok / Instagram → แหล่ง + รหัส + แนวตั้ง/แนวนอน + ลิงก์ฝังตัวเล่น
// ฟังก์ชันล้วน (ไม่มี import) ใช้ได้ทั้ง server (ตรวจซ้ำตอนบันทึก) และเบราว์เซอร์ (ตรวจทันทีตอนวางลิงก์)
// ฝังเฉพาะโดเมนทางการของแต่ละแพลตฟอร์ม · รหัสคลิปตรวจรูปแบบเข้มงวด (ไม่มีอักขระพิเศษหลุดไปใน URL/HTML)

export type VideoSourceKey = "YOUTUBE" | "FACEBOOK" | "TIKTOK" | "INSTAGRAM" | "UPLOAD";
export type ParsedLink = {
  source: Exclude<VideoSourceKey, "UPLOAD">;
  /** YouTube 11 ตัว · TikTok ตัวเลข · Instagram shortcode · Facebook = null (ฝังจาก url) */
  id: string | null;
  vertical: boolean;
  /** ลิงก์มาตรฐาน (ตัดพารามิเตอร์ติดตามออก) */
  url: string;
  /** ชื่อแบบคลิปสำหรับแสดง เช่น "YouTube Shorts" */
  label: string;
};

export const VIDEO_SOURCES: Record<VideoSourceKey, { name: string; color: string; app: string }> = {
  YOUTUBE: { name: "YouTube", color: "#FF0000", app: "เปิดใน YouTube" },
  FACEBOOK: { name: "Facebook", color: "#1877F2", app: "เปิดใน Facebook" },
  TIKTOK: { name: "TikTok", color: "#111111", app: "เปิดใน TikTok" },
  INSTAGRAM: { name: "Instagram", color: "#DD2A7B", app: "เปิดใน Instagram" },
  UPLOAD: { name: "ร้านถ่ายเอง", color: "#16A37B", app: "" },
};

/** หัวข้อแนะนำ (พิมพ์หัวข้อใหม่เองได้) */
export const VIDEO_TOPICS = ["รีวิวสินค้า", "วิธีติดตั้ง", "ผลงานลูกค้า", "เปรียบเทียบรุ่น", "แกะกล่อง"];

export const VIDEO_TITLE_MAX = 150;
export const VIDEO_TOPIC_MAX = 40;
/** คลิปที่อัปโหลดเอง */
export const UPLOAD_MAX_BYTES = 200 * 1024 * 1024;
export const UPLOAD_MAX_SECONDS = 180;

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const IG_ID = /^[A-Za-z0-9_-]{5,40}$/;
const TT_ID = /^\d{8,25}$/;

function toUrl(raw: string): URL | null {
  const s = raw.trim();
  if (!s || s.length > 600) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}
const host = (u: URL) => u.hostname.toLowerCase().replace(/^(www|m|mobile|web)\./, "");

/** ลิงก์ → ข้อมูลคลิป · null = ไม่รองรับ (ดู linkError สำหรับข้อความ) */
export function parseVideoLink(raw: string): ParsedLink | null {
  const u = toUrl(raw);
  if (!u) return null;
  const h = host(u);
  const parts = u.pathname.split("/").filter(Boolean);

  // ---- YouTube ----
  if (h === "youtube.com" || h === "youtube-nocookie.com" || h === "youtu.be" || h === "music.youtube.com") {
    let id = "", vertical = false;
    if (h === "youtu.be") id = parts[0] ?? "";
    else if (parts[0] === "watch") id = u.searchParams.get("v") ?? "";
    else if (parts[0] === "shorts") { id = parts[1] ?? ""; vertical = true; }
    else if (["embed", "live", "v"].includes(parts[0] ?? "")) id = parts[1] ?? "";
    if (!YT_ID.test(id)) return null;
    return { source: "YOUTUBE", id, vertical, url: vertical ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`, label: vertical ? "YouTube Shorts" : "YouTube วิดีโอ" };
  }

  // ---- Facebook (ฝังด้วย plugins/video.php จากลิงก์) ----
  if (h === "facebook.com" || h === "fb.watch" || h === "fb.com") {
    const clean = (path: string) => `https://www.facebook.com${path}`;
    if (h === "fb.watch" && parts[0] && /^[A-Za-z0-9_-]+$/.test(parts[0])) return { source: "FACEBOOK", id: null, vertical: false, url: `https://fb.watch/${parts[0]}/`, label: "Facebook วิดีโอ" };
    if (parts[0] === "reel" && /^\d+$/.test(parts[1] ?? "")) return { source: "FACEBOOK", id: null, vertical: true, url: clean(`/reel/${parts[1]}`), label: "Facebook Reel" };
    if (parts[0] === "share" && (parts[1] === "r" || parts[1] === "v") && /^[A-Za-z0-9_-]+$/.test(parts[2] ?? ""))
      return { source: "FACEBOOK", id: null, vertical: parts[1] === "r", url: clean(`/share/${parts[1]}/${parts[2]}/`), label: parts[1] === "r" ? "Facebook Reel" : "Facebook วิดีโอ" };
    if (parts[0] === "watch" && /^\d+$/.test(u.searchParams.get("v") ?? "")) return { source: "FACEBOOK", id: null, vertical: false, url: clean(`/watch/?v=${u.searchParams.get("v")}`), label: "Facebook วิดีโอ" };
    const vi = parts.indexOf("videos");
    if (vi >= 0 && /^\d+$/.test(parts[vi + 1] ?? "") && parts.slice(0, vi).every((p) => /^[A-Za-z0-9_.-]+$/.test(p)))
      return { source: "FACEBOOK", id: null, vertical: false, url: clean(`/${parts.slice(0, vi + 2).join("/")}/`), label: "Facebook วิดีโอ" };
    return null;
  }

  // ---- TikTok ----
  if (h === "tiktok.com") {
    const vi = parts.indexOf("video");
    const id = vi >= 0 ? parts[vi + 1] ?? "" : parts[0] === "embed" ? parts[parts.length - 1] ?? "" : "";
    if (!TT_ID.test(id)) return null;
    const user = parts[0]?.startsWith("@") && /^@[A-Za-z0-9_.]+$/.test(parts[0]) ? parts[0] : "@_";
    return { source: "TIKTOK", id, vertical: true, url: `https://www.tiktok.com/${user}/video/${id}`, label: "TikTok" };
  }

  // ---- Instagram ----
  if (h === "instagram.com") {
    const k = ["reel", "reels", "p", "tv"].indexOf(parts[0] ?? "");
    const id = parts[1] ?? "";
    if (k < 0 || !IG_ID.test(id)) return null;
    const kind = parts[0] === "p" ? "p" : "reel";
    return { source: "INSTAGRAM", id, vertical: true, url: `https://www.instagram.com/${kind}/${id}/`, label: kind === "p" ? "Instagram โพสต์" : "Instagram Reel" };
  }
  return null;
}

/** ข้อความแนะนำเมื่อใช้ลิงก์ไม่ได้ */
export function linkError(raw: string): string {
  const u = toUrl(raw);
  if (!u) return "กรุณาวางลิงก์คลิป (ขึ้นต้นด้วย https://)";
  const h = host(u);
  if (h === "vt.tiktok.com" || h === "vm.tiktok.com") return "ลิงก์ TikTok แบบย่อใช้ไม่ได้ — เปิดลิงก์ในเบราว์เซอร์ก่อน แล้วคัดลอกลิงก์เต็ม (…tiktok.com/@ชื่อ/video/ตัวเลข)";
  if (/youtube|youtu\.be|facebook|fb\.|tiktok|instagram/.test(h)) return "ลิงก์นี้ไม่ใช่ลิงก์คลิปโดยตรง — เปิดคลิปแล้วกด แชร์ › คัดลอกลิงก์";
  return "รองรับลิงก์จาก YouTube, Facebook, TikTok และ Instagram เท่านั้น";
}

/** ลิงก์ฝังตัวเล่น (ใช้หลังลูกค้ากดเล่นเท่านั้น — ไม่โหลดอะไรจากแพลตฟอร์มก่อนหน้านั้น) · null = เล่นไม่ได้ */
export function embedUrl(v: { source: VideoSourceKey; externalId: string | null; url: string | null }): string | null {
  switch (v.source) {
    case "YOUTUBE":
      return v.externalId && YT_ID.test(v.externalId) ? `https://www.youtube-nocookie.com/embed/${v.externalId}?autoplay=1&playsinline=1&rel=0&modestbranding=1` : null;
    case "TIKTOK":
      return v.externalId && TT_ID.test(v.externalId) ? `https://www.tiktok.com/player/v1/${v.externalId}?autoplay=1&rel=0&description=1` : null;
    case "INSTAGRAM":
      return v.externalId && IG_ID.test(v.externalId) && v.url ? `${v.url.replace(/\/?$/, "/")}embed/` : null;
    case "FACEBOOK": {
      const p = v.url ? parseVideoLink(v.url) : null;
      return p?.source === "FACEBOOK" ? `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(p.url)}&show_text=false&autoplay=true&allowfullscreen=true` : null;
    }
    default:
      return null;
  }
}

/** รูปปกอัตโนมัติ (YouTube เท่านั้น — แพลตฟอร์มอื่นต้องอัปโหลดรูปปกเอง หรือใช้พื้นสีของแพลตฟอร์ม) */
export const youtubeThumb = (id: string) => (YT_ID.test(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null);

/** "125" วินาที → "2:05" */
export function durationText(sec: number | null | undefined) {
  if (!sec || sec < 0) return "";
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
/** ISO 8601 สำหรับ JSON-LD เช่น PT2M5S */
export const isoDuration = (sec: number | null | undefined) => (sec && sec > 0 ? `PT${Math.floor(sec / 60) ? `${Math.floor(sec / 60)}M` : ""}${Math.round(sec % 60)}S` : undefined);

/** หัวข้อ: ตัดช่องว่างซ้ำ · ยาวไม่เกินกำหนด */
export const cleanTopic = (v: unknown) => (typeof v === "string" ? v.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, VIDEO_TOPIC_MAX) : "");
export const cleanTitle = (v: unknown) => (typeof v === "string" ? v.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, VIDEO_TITLE_MAX) : "");
