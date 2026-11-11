// ทดสอบหน่วย: ลิงก์สินค้าภาษาไทย (src/lib/slug.ts) — รัน: npm run test:unit
import assert from "node:assert/strict";
import { cleanProductSlug, isProductSlug, PRODUCT_SLUG_MAX, slugFromName } from "../../src/lib/slug";

let n = 0;
const eq = (a: unknown, b: unknown, msg: string) => { assert.equal(a, b, msg); n++; };

// URL จริงของเว็บเดิม
const old = "ไฟส่องต้นไม้-ไฟส่องส่วนหย่อม-48w-แสงวอร์มไวท์-3200k";
eq(isProductSlug(old), true, "URL ไทยของเว็บเดิมใช้ได้");
eq(cleanProductSlug(old), old, "URL ที่ถูกอยู่แล้วไม่เปลี่ยน");
eq(isProductSlug("gdl-c12ww"), true, "อังกฤษตัวเล็กยังใช้ได้");
eq(isProductSlug("ไฟ๑๒วัตต์"), true, "เลขไทยใช้ได้");
for (const bad of ["", "GDL", "a--b", "-a", "a-", "ไฟ ส่อง", "a/b", "a_b", "฿100", "ราคา.ถูก"]) eq(isProductSlug(bad), false, `ไม่รับ "${bad}"`);
eq(isProductSlug("ก".repeat(PRODUCT_SLUG_MAX + 1)), false, "ยาวเกินไม่รับ");

eq(cleanProductSlug("  ไฟ ส่อง  สวน  "), "ไฟ-ส่อง-สวน", "เว้นวรรค → -");
eq(cleanProductSlug("LED Garden_Light"), "led-garden-light", "ตัวใหญ่ → ตัวเล็ก, _ → -");
eq(cleanProductSlug("--ไฟ//สระ--"), "ไฟ-สระ", "ตัด - หัวท้ายและ / ");
eq(cleanProductSlug("ไฟเเ"), "ไฟเเ", "สระที่ซ้ำไม่หาย");
eq(cleanProductSlug("กำ".normalize("NFD")), "กำ", "NFC");

eq(slugFromName("ไฟส่องต้นไม้ ขนาด10วัตต์ แสงวอร์มไวท์ LED Garden light (แสงวอร์มไวท์)"), "ไฟส่องต้นไม้-ขนาด10วัตต์-แสงวอร์มไวท์-led-garden-light-แสงวอร์มไวท์", "สร้างจากชื่อ");
eq(slugFromName("ไฟใต้น้ำ 12W ฿990 / RGB"), "ไฟใต้น้ำ-12w-990-rgb", "ตัดสัญลักษณ์");
const long = slugFromName("คำยาว ".repeat(60));
eq(long.length <= 120 && isProductSlug(long) && !long.endsWith("-"), true, "ชื่อยาวตัดที่ขอบคำ ≤ 120 ตัว");
eq(isProductSlug(slugFromName("!!!")), false, "ชื่อไม่มีตัวอักษร = ว่าง (ต้องกรอกเอง)");

console.log(`slug: ผ่าน ${n} ข้อ`);
