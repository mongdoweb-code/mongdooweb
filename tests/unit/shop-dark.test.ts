// ทดสอบหน่วย: ธีมกลางคืนหน้าร้าน — ไฟล์ *-dark.generated.css ต้องตรงกับ CSS ต้นฉบับล่าสุด (ลืมรัน npm run gen:shop-dark = ไม่ผ่าน)
// + ไม่แตะกล่องรูปสินค้า/สไลด์/QR · ทุกกฎอยู่ใต้ html[data-theme=dark] — รัน: npm run test:unit
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHECKOUT_OUT, CHECKOUT_SOURCES, OUT, generate } from "../../scripts/gen-shop-dark.mjs";
import { SHOP_THEME_BOOT } from "../../src/lib/shop-theme";

let n = 0;
const ok = (c: unknown, msg: string) => { assert.ok(c, msg); n++; };
const shop = generate(), co = generate(CHECKOUT_SOURCES);
ok(shop === readFileSync(OUT, "utf8"), "shop-dark.generated.css ล่าสุดแล้ว (ถ้าไม่ผ่าน: npm run gen:shop-dark)");
ok(co === readFileSync(CHECKOUT_OUT, "utf8"), "checkout-dark.generated.css ล่าสุดแล้ว (ถ้าไม่ผ่าน: npm run gen:shop-dark)");
for (const css of [shop, co]) {
  const sels = css.split("\n").filter((l) => l.includes("{") && !/^\s*@media|^\s*@supports/.test(l));
  ok(sels.every((l) => /^\s*html\[data-theme="dark"\]/.test(l)), "ทุกกฎอยู่ใต้ html[data-theme=dark]");
}
ok(!/\.prod-img img|\.slide\b|\.s-shade|\.f-qr|\.ccar-img/.test(shop), "ไม่แตะรูปสินค้า สไลด์ QR วงรูปหมวด");
ok(/var\(--c-black\)/.test(readFileSync("src/app/(shop)/shop.css", "utf8")) && !/(^|[^-])color: var\(--c-black\)/m.test(shop), "ตัวอักษร var(--c-black) เปลี่ยนเป็นสีตัวอักษรของธีม");
// สคริปต์ก่อนวาดหน้า: ไม่มีคุกกี้ = ตามเครื่อง
const run = (cookie: string, prefersDark: boolean) => {
  const attrs: Record<string, string> = {};
  const doc = { cookie, documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } } };
  new Function("document", "matchMedia", SHOP_THEME_BOOT)(doc, () => ({ matches: prefersDark }));
  return attrs;
};
ok(run("", true)["data-theme"] === "dark" && run("", true)["data-theme-mode"] === "system", "ไม่เคยเลือก + เครื่องโหมดมืด → กลางคืน");
ok(run("", false)["data-theme"] === "light", "ไม่เคยเลือก + เครื่องโหมดสว่าง → กลางวัน");
ok(run("a=1; mdw_theme=light", true)["data-theme"] === "light", "เลือกกลางวันไว้ → กลางวันแม้เครื่องโหมดมืด");
ok(run("mdw_theme=dark", false)["data-theme"] === "dark", "เลือกกลางคืนไว้ → กลางคืน");
console.log(`shop-dark: ผ่าน ${n} ข้อ`);
