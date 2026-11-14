// ทดสอบหน่วย: ธีมมืดหลังบ้าน — ไฟล์ admin-dark.generated.css ต้องตรงกับ CSS ต้นฉบับล่าสุด (ลืมรัน npm run gen:admin-dark = ไม่ผ่าน)
// + กฎการแปลงสี + ไม่แตะแผ่นเอกสาร A4/ใบปะหน้า — รัน: npm run test:unit
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OUT, darkColor, generate } from "../../scripts/gen-admin-dark.mjs";

let n = 0;
const ok = (c: unknown, msg: string) => { assert.ok(c, msg); n++; };
const lum = (hex: string | null) => { if (!hex) return NaN; const v = parseInt(hex.slice(1, 7), 16); return (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255; };

const css = generate();
ok(css === readFileSync(OUT, "utf8"), "admin-dark.generated.css ล่าสุดแล้ว (ถ้าไม่ผ่าน: npm run gen:admin-dark)");
ok(!/\.sheet\b|\.sh-[a-z]|\.lsheet|#docMeasure|\.lg-hero/.test(css), "ไม่มีกฎของแผ่นเอกสาร/ใบปะหน้า/โซนการตลาดหน้าเข้าสู่ระบบ");
ok(css.split("\n").filter((l) => l.includes("{")).every((l) => l.startsWith('html[data-adm-theme="dark"]') || l.startsWith("@media") || l.startsWith("  html[") || l.startsWith("    html[") || /^\s*html\[/.test(l)), "ทุกกฎอยู่ใต้ html[data-adm-theme=dark]");
const white = darkColor("#FFFFFF", "bg"), cream = darkColor("#F2F0EB", "bg");
ok(lum(white) < 0.2 && lum(cream) < lum(white), "การ์ด (ขาว) มืดแต่ยกสูงกว่าพื้นหน้า (ครีม)");
ok(lum(darkColor("#1C1C1C", "text")) > 0.85, "ตัวอักษรเข้ม → สว่าง");
ok(darkColor("#FFFFFF", "text") === null, "ตัวอักษรขาว (บนปุ่มสี) คงไว้");
ok(darkColor("#F26B38", "bg") === null, "พื้นสีส้มของร้าน (ปุ่มหลัก) คงไว้");
ok(darkColor("#141414", "bg") === null, "พื้นดำเดิม (แถบเมนู) คงไว้");
ok(lum(darkColor("#C0392B", "text")) > 0.5, "ตัวอักษรสีแดงสว่างขึ้นให้อ่านบนพื้นมืด");
console.log(`admin-dark: ผ่าน ${n} ข้อ`);
