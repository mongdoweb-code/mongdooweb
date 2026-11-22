// หน้าวิดีโอ: แยกลิงก์ YouTube / Facebook / TikTok / Instagram + ลิงก์ฝังตัวเล่น (src/lib/video-links.ts)
import assert from "node:assert/strict";
import { durationText, embedUrl, isoDuration, linkError, parseVideoLink, youtubeThumb } from "../../src/lib/video-links";

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => { assert.deepEqual(a, b, m); n++; };
const p = (u: string) => parseVideoLink(u);

// YouTube
eq(p("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s&si=abc"), { source: "YOUTUBE", id: "dQw4w9WgXcQ", vertical: false, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", label: "YouTube วิดีโอ" }, "watch + ตัดพารามิเตอร์");
eq(p("youtu.be/dQw4w9WgXcQ?si=x")?.id, "dQw4w9WgXcQ", "youtu.be ไม่มี https");
eq(p("https://m.youtube.com/shorts/abcDEF123_-?feature=share")?.vertical, true, "Shorts = แนวตั้ง");
eq(p("https://www.youtube.com/live/dQw4w9WgXcQ")?.id, "dQw4w9WgXcQ", "live");
eq(p("https://www.youtube.com/watch?v=short"), null, "id ผิดความยาว");
eq(p("https://www.youtube.com/@mongdoweb"), null, "ลิงก์ช่อง ไม่ใช่คลิป");
eq(p("https://www.youtube.com/watch?v=dQw4w9WgXc%22"), null, "อักขระพิเศษ");
// Facebook
eq(p("https://www.facebook.com/reel/1234567890123?mibextid=x"), { source: "FACEBOOK", id: null, vertical: true, url: "https://www.facebook.com/reel/1234567890123", label: "Facebook Reel" }, "reel");
eq(p("https://www.facebook.com/mongdoweb/videos/987654321/")?.url, "https://www.facebook.com/mongdoweb/videos/987654321/", "วิดีโอเพจ");
eq(p("https://www.facebook.com/watch/?v=555")?.vertical, false, "watch");
eq(p("https://www.facebook.com/share/r/AbC123/")?.vertical, true, "share/r = reel");
eq(p("https://fb.watch/abcD12/")?.source, "FACEBOOK", "fb.watch");
eq(p("https://www.facebook.com/mongdoweb"), null, "หน้าเพจ ไม่ใช่คลิป");
// TikTok
eq(p("https://www.tiktok.com/@mongdoweb/video/7301234567890123456?is_from_webapp=1"), { source: "TIKTOK", id: "7301234567890123456", vertical: true, url: "https://www.tiktok.com/@mongdoweb/video/7301234567890123456", label: "TikTok" }, "tiktok");
eq(p("https://vt.tiktok.com/ZSabc/"), null, "ลิงก์ย่อ");
eq(/ลิงก์เต็ม/.test(linkError("https://vt.tiktok.com/ZSabc/")), true, "แนะนำให้ใช้ลิงก์เต็ม");
// Instagram
eq(p("https://www.instagram.com/reel/C1abcDEF_-/?igsh=xyz")?.url, "https://www.instagram.com/reel/C1abcDEF_-/", "reel");
eq(p("https://instagram.com/reels/C1abcDEF/")?.label, "Instagram Reel", "reels");
eq(p("https://www.instagram.com/p/C1abcDEF/")?.label, "Instagram โพสต์", "post");
eq(p("https://www.instagram.com/mongdoweb/"), null, "โปรไฟล์");
// อื่น ๆ
eq(p("javascript:alert(1)"), null, "javascript:");
eq(p("https://evil.com/youtube.com/watch?v=dQw4w9WgXcQ"), null, "โดเมนปลอม");
eq(p("https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ"), null, "โดเมนย่อยปลอม");
eq(/YouTube, Facebook/.test(linkError("https://example.com/x")), true, "ข้อความโดเมนไม่รองรับ");

// ลิงก์ฝัง
eq(embedUrl({ source: "YOUTUBE", externalId: "dQw4w9WgXcQ", url: null })?.startsWith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1"), true, "YouTube nocookie");
eq(embedUrl({ source: "YOUTUBE", externalId: "bad\"id", url: null }), null, "id ผิด = ไม่ฝัง");
eq(embedUrl({ source: "TIKTOK", externalId: "7301234567890123456", url: null })?.startsWith("https://www.tiktok.com/player/v1/7301234567890123456"), true, "TikTok");
eq(embedUrl({ source: "INSTAGRAM", externalId: "C1abcDEF", url: "https://www.instagram.com/reel/C1abcDEF/" }), "https://www.instagram.com/reel/C1abcDEF/embed/", "IG");
eq(embedUrl({ source: "FACEBOOK", externalId: null, url: "https://www.facebook.com/reel/123" }), `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent("https://www.facebook.com/reel/123")}&show_text=false&autoplay=true&allowfullscreen=true`, "FB");
eq(embedUrl({ source: "FACEBOOK", externalId: null, url: "https://evil.com/x" }), null, "FB ลิงก์ปลอม");
eq(embedUrl({ source: "UPLOAD", externalId: null, url: null }), null, "อัปโหลด = ใช้ <video>");
eq(youtubeThumb("dQw4w9WgXcQ"), "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", "รูปปก YouTube");
eq([durationText(125), durationText(59), durationText(null), isoDuration(125), isoDuration(42)], ["2:05", "0:59", "", "PT2M5S", "PT42S"], "ความยาว");
console.log(`video-links: ผ่าน ${n} ข้อ`);
