// ทดสอบหน่วย: การตั้งค่าหน้าเข้าสู่ระบบ (src/lib/login-page.ts) — รัน: npm run test:unit
import assert from "node:assert/strict";
import { LOGIN_DEFAULT, LOGIN_LIMITS, isLoginImageKey, parseLoginPage, splitGlow } from "../../src/lib/login-page";

let n = 0;
const eq = (a: unknown, b: unknown, msg: string) => { assert.deepEqual(a, b, msg); n++; };

eq(parseLoginPage({}), LOGIN_DEFAULT, "{} = ค่าเริ่มต้น");
eq(parseLoginPage(null), LOGIN_DEFAULT, "null = ค่าเริ่มต้น");
eq(parseLoginPage("x"), LOGIN_DEFAULT, "ค่าเสีย = ค่าเริ่มต้น");
// รูป: รับเฉพาะไฟล์ที่อัปโหลด (login/YYYY/MM/*.webp) — ไม่รับลิงก์ภายนอก/javascript/path อื่น
eq(isLoginImageKey("login/2026/11/abc123.webp"), true, "key ที่อัปโหลด");
for (const bad of ["https://evil.example/x.webp", "javascript:alert(1)", "products/2026/11/a.webp", "login/../../etc/passwd", "login/2026/11/a.png"]) eq(isLoginImageKey(bad), false, `ไม่รับ ${bad}`);
const imgs = parseLoginPage({ images: ["login/2026/11/a1.webp", "https://x.y/z.webp", "login/2026/11/a1.webp", "login/2026/11/a2.webp", "login/2026/11/a3.webp", "login/2026/11/a4.webp", "login/2026/11/a5.webp"] }).images;
eq(imgs, ["login/2026/11/a1.webp", "login/2026/11/a2.webp", "login/2026/11/a3.webp", "login/2026/11/a4.webp"], `รูปไม่ซ้ำ ไม่เกิน ${LOGIN_LIMITS.images}`);
// ข้อความ: ตัดช่องว่าง ตัดความยาว · หัวข้อว่าง = ค่าเริ่มต้น · คำเรืองแสงต้องอยู่ในหัวข้อ
const c = parseLoginPage({ headline: "  ไฟ   สวย  ", glow: "สวย", sub: "x".repeat(500), highlights: ["a", "", "b", "c", "d", "e"], stats: [{ value: "9", label: "" }, { value: "180+", label: "สินค้า" }] });
eq(c.headline, "ไฟ สวย", "ยุบช่องว่าง");
eq(c.glow, "สวย", "คำเรืองแสงในหัวข้อ");
eq(c.sub.length, 220, "ตัดคำอธิบาย 220 ตัว");
eq(c.highlights, ["a", "b", "c", "d"], "จุดเด่นไม่ว่าง ≤ 4");
eq(c.stats, [{ value: "180+", label: "สินค้า" }], "ตัวเลขต้องมีทั้งค่าและคำอธิบาย");
eq(parseLoginPage({ headline: "ไฟสวย", glow: "ไม่มี" }).glow, "", "คำที่ไม่อยู่ในหัวข้อ = ไม่เรืองแสง");
eq(parseLoginPage({ headline: "   " }).headline, LOGIN_DEFAULT.headline, "หัวข้อว่าง = ค่าเริ่มต้น");
eq(parseLoginPage({ theme: "neon" }).theme, "orange", "ธีมแปลก = ค่าเริ่มต้น");
eq(parseLoginPage({ catCount: 99, productCount: -3 }).catCount, LOGIN_LIMITS.cats, "จำนวนหมวดไม่เกินกำหนด");
eq(parseLoginPage({ productCount: -3 }).productCount, 1, "จำนวนสินค้าอย่างน้อย 1");
eq(parseLoginPage({ eyebrow: "" }).eyebrow, "", "ลบป้ายเล็กได้ (ว่าง)");
eq(splitGlow("ทุกงานแสง เริ่มต้น", "งานแสง"), [{ text: "ทุก", glow: false }, { text: "งานแสง", glow: true }, { text: " เริ่มต้น", glow: false }], "แยกคำเรืองแสง");
eq(splitGlow("abc", ""), [{ text: "abc", glow: false }], "ไม่มีคำเรืองแสง");

console.log(`login-page: ผ่าน ${n} ข้อ`);
