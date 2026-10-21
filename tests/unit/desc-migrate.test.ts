// ทดสอบหน่วย: ย้ายรูป/ลิงก์ในคำอธิบายสินค้าจากเว็บ WordPress เดิม (scripts/lib/desc-migrate.ts) — รัน: npm run test:unit
import assert from "node:assert/strict";
import { isOldUrl, makeLinkResolver, migrateHtml } from "../../scripts/lib/desc-migrate";
import { sanitizeDescription } from "../../src/lib/html";

const OLD = "https://www.xn--72c0asz6a7a5fqc6c.com";
const fetched: string[] = [];
const deps = {
  image: async (u: string) => {
    fetched.push(u);
    return u.includes("missing") ? null : `/media/products/2026/10/${u.split("/").pop()!.replace(/\.\w+$/, "")}.webp`;
  },
  link: makeLinkResolver(async (p) => (p === "/product/ไฟใต้น้ำ-12v" ? "uw-12v" : null)),
};

async function main() {
  assert.ok(isOldUrl(`${OLD}/x`) && isOldUrl("http://mongdoweb.com/") && isOldUrl("https://มองดูเว็บ.com/a") && isOldUrl("//www.mongdoweb.com/a"));
  assert.ok(!isOldUrl("https://www.mongdooweb.com/x") && !isOldUrl("https://mongdoweb.com.evil.io/x") && !isOldUrl("/product/x"));

  // รูป + ลิงก์ครอบรูป → รูปที่ย้ายแล้ว ไม่มีลิงก์ครอบ
  const a = await migrateHtml(
    `<p><a href="${OLD}/wp-content/uploads/2019/01/big.jpg"><img src="${OLD}/wp-content/uploads/2019/01/small-300x300.jpg" alt="x" width="300" height="300" /></a></p>`,
    deps,
  );
  assert.equal(a, `<p><img src="/media/products/2026/10/small-300x300.webp" alt="x" width="300" height="300" /></p>`);
  // โหลดไม่ได้ → คง src เดิม
  const miss = `<img src="${OLD}/wp-content/uploads/missing.jpg" alt="" />`;
  assert.equal(await migrateHtml(miss, deps), miss);
  // ลิงก์ข้อความไปไฟล์รูป → รูปที่ย้ายแล้ว · ไฟล์อื่น (PDF) → /products
  assert.equal(await migrateHtml(`<a href="${OLD}/wp-content/uploads/spec.png">สเปก</a>`, deps), `<a href="/media/products/2026/10/spec.webp">สเปก</a>`);
  assert.equal(await migrateHtml(`<a href="${OLD}/wp-content/uploads/spec.pdf">PDF</a>`, deps), `<a href="/products">PDF</a>`);
  // ลิงก์สินค้าเดิม (เข้ารหัส %) → /product/<slug ใหม่> · ไม่รู้จัก → /products · หมวดเดิม → path ให้ redirect 301 จัดการ
  const enc = encodeURI("/product/ไฟใต้น้ำ-12v").toLowerCase();
  assert.equal(await migrateHtml(`<a href="${OLD}${enc}">ดู</a>`, deps), `<a href="/product/uw-12v">ดู</a>`);
  assert.equal(await migrateHtml(`<a href="https://www.มองดูเว็บ.com/สินค้าทั้งหมด/ไฟใต้น้ำ-12v/">ดู</a>`, deps), `<a href="/product/uw-12v">ดู</a>`);
  assert.equal(await migrateHtml(`<a href="${OLD}/product/unknown">ดู</a>`, deps), `<a href="/products">ดู</a>`);
  assert.equal(await migrateHtml(`<a href="${OLD}/เครื่องพ่น-%e.html">ดู</a>`, deps), `<a href="/products">ดู</a>`);
  assert.equal(await migrateHtml(`<a href="${OLD}/product-category/ไฟใต้น้ำ/">หมวด</a>`, deps), `<a href="${encodeURI("/product-category/ไฟใต้น้ำ/")}">หมวด</a>`);
  assert.equal(await migrateHtml(`<a href="${OLD}/?p=123&amp;x=1">โพสต์</a>`, deps), `<a href="/?p=123&amp;x=1">โพสต์</a>`);
  assert.equal(await migrateHtml(`<a href="${OLD}">หน้าแรก</a>`, deps), `<a href="/">หน้าแรก</a>`);
  // อีโมจิ WordPress → ตัวอักษร · ลิงก์ภายนอกอื่นไม่แตะ
  assert.equal(await migrateHtml(`<img src="https://s.w.org/images/core/emoji/13.1.0/svg/25fe.svg" alt="◾" class="wp-smiley" /> ok`, deps), "◾ ok");
  const ext = `<a href="https://line.me/ti/p/~@mongdoweb">LINE</a>`;
  assert.equal(await migrateHtml(ext, deps), ext);
  // ผลลัพธ์ผ่านตัวกรอง HTML ได้ (รูป /media และลิงก์ภายในยังอยู่)
  const clean = sanitizeDescription(a + `<a href="/product/uw-12v">ดู</a>`);
  assert.match(clean, /<img [^>]*src="\/media\/products\/2026\/10\/small-300x300\.webp"/);
  assert.match(clean, /<a href="\/product\/uw-12v"/);
  // idempotent: รันซ้ำไม่เปลี่ยนอะไรและไม่โหลดซ้ำ
  const n = fetched.length;
  assert.equal(await migrateHtml(a, deps), a);
  assert.equal(fetched.length, n);
  console.log("desc-migrate: ผ่านทั้งหมด");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
