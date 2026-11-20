// สร้างธีมกลางคืนของหน้าร้านอัตโนมัติจาก CSS เดิม → src/app/(shop)/shop-dark.generated.css
// รัน: npm run gen:shop-dark (ต้องรันใหม่ทุกครั้งที่แก้สีใน CSS หน้าร้าน — tests/unit/shop-dark.test.ts ตรวจว่าไฟล์ล่าสุดแล้ว)
// ใช้ตัวแปลงสีเดียวกับหลังบ้าน (scripts/gen-admin-dark.mjs) · ตัวแปรสีหลักของร้าน (--c-white, --c-ink …) กำหนดใน shop-theme.css
// ยกเว้น: กล่องรูปสินค้า (รูปพื้นขาว — คงพื้นขาวไว้ให้รูปไม่ลอย), สไลด์หน้าแรก, QR, โลโก้, แผ่นเอกสาร/หน้าพิมพ์
import { writeFileSync } from "node:fs";
import { generate as gen } from "./gen-admin-dark.mjs";

export const SOURCES = [
  "src/app/(shop)/shop.css",
  "src/app/(shop)/pages.css",
  "src/app/(shop)/lot2.css",
  "src/app/(shop)/lot9.css",
  "src/app/(shop)/lot10.css",
  "src/app/(shop)/_lot11/lot11.css",
  "src/app/(shop)/privacy/request/request.css",
  "src/components/sort-toolbar/sort-toolbar.css",
];
export const OUT = "src/app/(shop)/shop-dark.generated.css";
/** หน้าชำระเงินมี CSS ของตัวเอง → ไฟล์ธีมกลางคืนแยก (กฎของหน้าร้านไม่ปนกับหน้าชำระเงิน) */
export const CHECKOUT_SOURCES = ["src/app/(checkout)/checkout.css"];
export const CHECKOUT_OUT = "src/app/(checkout)/checkout-dark.generated.css";
export const ROOT = 'html[data-theme="dark"]';
export const EXCLUDE = /\bimg\b|\.ph\b|\.thumb\b|\.ci-thumb|\.cat-media|\.ccar-img|\.pi-slides|\.lb-stage|\.lb-thumb|\.pdp-thumbs button|\.f-qr|qr|\.logo-mark|\.slide|\.s-[a-z]|\.slider|\.sheet\b|\.sh-|\.label\b|\.bk-ic/;

/** ตัวแปรสีที่ความหมายเปลี่ยนตามบทบาท: ตัวอักษรสีดำ (var(--c-black)) → สีตัวอักษรของธีม */
const fixVar = (prop, value, role) => (role === "text" && /var\(--c-black\)/.test(value) ? value.replace(/var\(--c-black\)/g, "var(--c-ink)") : null);

export const generate = (sources = SOURCES) =>
  gen({
    sources, root: ROOT, exclude: EXCLUDE, fixVar,
    header: " ไฟล์นี้สร้างอัตโนมัติด้วย scripts/gen-shop-dark.mjs — ห้ามแก้ตรง (แก้ที่ CSS ต้นฉบับแล้วรัน npm run gen:shop-dark) ",
  });

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [src, out] of [[SOURCES, OUT], [CHECKOUT_SOURCES, CHECKOUT_OUT]]) {
    const css = generate(src);
    writeFileSync(out, css);
    console.log(`เขียน ${out} (${(css.length / 1024).toFixed(1)} KB)`);
  }
}
