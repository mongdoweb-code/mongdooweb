// หลังบ้าน › สินค้า: ลากวางจัดลำดับ · ปักหมุด · ไปบนสุด/ล่างสุด · ปุ่มดู/แก้ไข/ลบ · แบ่งหน้า + เลือกจำนวนต่อหน้า · ตัวแก้ไขข้อความ
// สร้างสินค้าทดสอบ 3 รายการ (E2E-ORD-*) แล้วลบทิ้งตอนจบ — ใช้ได้ทั้งฐานข้อมูลใหม่และสำเนาข้อมูลจริง
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { V, confirmClick, login } from "./helpers";

test.describe.configure({ mode: "serial" });

const TAG = Date.now().toString(36);
const P = ["A", "B", "C"].map((k, i) => ({ id: `e2e-ord-${k}-${TAG}`, sku: `E2E-ORD-${k}-${TAG}`, slug: `e2e-ord-${k.toLowerCase()}-${TAG}`, name: `สินค้าทดสอบลำดับ ${k}`, order: 900000 + i * 10 }));

async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
const orderOf = async () => (await q<{ sku: string }>(`SELECT sku FROM "Product" WHERE sku LIKE $1 ORDER BY "isPinned" DESC, "sortOrder", "createdAt"`, [`E2E-ORD-%-${TAG}`])).map((r) => r.sku.split("-")[2]);
const list = (page: Page) => page.goto(`/admin/products?q=E2E-ORD-&per=10`);
const skus = async (page: Page) => (await page.locator("tbody tr[data-id] .row-link .sub" + V).allTextContents()).map((t) => t.split("-")[2]);

test.beforeAll(async () => {
  const [cat] = await q<{ id: string }>(`SELECT id FROM "Category" ORDER BY "sortOrder" LIMIT 1`);
  for (const p of P)
    await q(`INSERT INTO "Product" (id, sku, slug, name, "priceSatang", "inStock", images, "categoryId", "sortOrder", "updatedAt", description) VALUES ($1,$2,$3,$4,10000,true,'{}',$5,$6,now(),$7)`, [
      p.id, p.sku, p.slug, p.name, cat.id, p.order, "บรรทัดแรก\nบรรทัดสอง\n\nย่อหน้าใหม่",
    ]);
});
test.afterAll(async () => {
  await q(`DELETE FROM "Product" WHERE sku LIKE $1`, [`E2E-ORD-%-${TAG}%`]);
});

test("ลากวางสลับตำแหน่ง → บันทึกทันที (ฐานข้อมูล + หลังรีเฟรช)", async ({ page }) => {
  await login(page);
  await list(page);
  expect(await skus(page)).toEqual(["A", "B", "C"]);
  await expect(page.locator(".sort-hint" + V)).toContainText("ลากที่ปุ่มจับ");
  // ลาก A ลงไปใต้ C
  const h = page.locator(`tr[data-id="${P[0].id}"] [data-drag-handle]` + V);
  const c = await page.locator(`tr[data-id="${P[2].id}"]` + V).boundingBox();
  const b = (await h.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, c!.y + c!.height - 4, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator(".sort-msg.ok" + V)).toContainText("บันทึกลำดับแล้ว");
  await expect.poll(orderOf).toEqual(["B", "C", "A"]);
  await list(page);
  expect(await skus(page)).toEqual(["B", "C", "A"]);
  // คีย์บอร์ด: โฟกัสปุ่มจับของ A แล้วกด ↑ → B A C
  await page.locator(`tr[data-id="${P[0].id}"] [data-drag-handle]` + V).focus();
  await page.keyboard.press("ArrowUp");
  await expect.poll(orderOf).toEqual(["B", "A", "C"]);
});

test("ไปบนสุด / ไปล่างสุด และปักหมุด (ขึ้นบนสุด + แท็บปักหมุด)", async ({ page }) => {
  await login(page);
  await list(page);
  await page.getByRole("button", { name: `ไปล่างสุด ${P[1].sku}` }).first().click({ force: true });
  await expect.poll(orderOf).toEqual(["A", "C", "B"]);
  await list(page);
  await page.getByRole("button", { name: `ปักหมุด ${P[2].sku}` }).first().click();
  await expect.poll(orderOf).toEqual(["C", "A", "B"]);
  await list(page);
  await expect(page.locator(`tr[data-id="${P[2].id}"].row-pin` + V)).toHaveCount(1);
  await expect(page.getByRole("button", { name: `เลิกปักหมุด ${P[2].sku}` }).first()).toHaveAttribute("aria-pressed", "true");
  await page.goto(`/admin/products?status=pinned&q=E2E-ORD-`);
  expect(await skus(page)).toEqual(["C"]);
  // ลากข้ามกลุ่มปักหมุดไม่ได้: ลาก B ขึ้นบนสุด → อยู่ใต้ C เสมอ
  await list(page);
  const h = page.locator(`tr[data-id="${P[1].id}"] [data-drag-handle]` + V);
  const top = (await page.locator("tbody tr[data-id]" + V).first().boundingBox())!;
  const b = (await h.boundingBox())!;
  await page.mouse.move(b.x + 5, b.y + 5);
  await page.mouse.down();
  await page.mouse.move(b.x + 5, top.y + 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(orderOf).toEqual(["C", "B", "A"]);
  await page.getByRole("button", { name: `เลิกปักหมุด ${P[2].sku}` }).first().click();
  await expect.poll(async () => (await q<{ p: boolean }>(`SELECT "isPinned" p FROM "Product" WHERE id=$1`, [P[2].id]))[0].p).toBe(false);
});

test("ปุ่มดู/แก้ไข/ลบ + เรียงตามคอลัมน์ + แบ่งหน้า/จำนวนต่อหน้า", async ({ page }) => {
  await login(page);
  await list(page);
  const row = page.locator(`tr[data-id="${P[0].id}"]` + V);
  await expect(row.locator(`a.ra-view[href="/product/${P[0].slug}"]`)).toHaveAttribute("target", "_blank");
  await expect(row.locator(`a.ra-edit[href="/admin/products/${P[0].id}"]`)).toHaveCount(1);
  // เรียงตามชื่อ (ดูอย่างเดียว) — ซ่อนปุ่มลาก
  await page.locator('th a.th-sort:has-text("สินค้า")' + V).click();
  await expect(page).toHaveURL(/sort=name/);
  await expect(page.locator("[data-drag-handle]" + V)).toHaveCount(0);
  expect(await skus(page)).toEqual(["A", "B", "C"]);
  // แบ่งหน้า: 10 ต่อหน้า → เลขหน้า + เปลี่ยนเป็น 20
  await page.goto("/admin/products?per=10");
  await expect(page.locator(".pg-sum" + V)).toContainText(/กำลังแสดง 1 ถึง 10 จาก/);
  await expect(page.locator(".pg-nav .pg-btn.on" + V)).toHaveText("1");
  await page.locator('.pg-nav a:has-text("ถัดไป")' + V).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator(".pg-sum" + V)).toContainText(/กำลังแสดง 11 ถึง/);
  await page.locator(".pg-per select" + V).selectOption("20");
  await expect(page).toHaveURL(/\/admin\/products(\?(?!.*page=).*)?$/);
  await expect(page.locator("tbody tr[data-id]" + V)).toHaveCount(Math.min(20, Number((await page.locator(".pg-sum b").nth(2).textContent())!.replace(/,/g, ""))));
  // ลบ C (ไม่มีในคำสั่งซื้อ → ลบจริง)
  await list(page);
  await confirmClick(page, `tr[data-id="${P[2].id}"] button.ra-del`, "ลบสินค้า");
  await expect(page.locator(".login-info" + V)).toContainText("ลบ/ปิดขายสินค้าแล้ว");
  expect(await q(`SELECT 1 FROM "Product" WHERE id=$1`, [P[2].id])).toHaveLength(0);
});

test("ตัวแก้ไขข้อความ: ข้อความเดิมขึ้นบรรทัดถูก · ตัวหนา · จัดกึ่งกลาง · ขนาดตัวอักษร · ลิงก์ · บันทึกแล้วหน้าร้านแสดงตาม", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/products/${P[0].id}`);
  const ed = page.getByRole("textbox", { name: "รายละเอียดสินค้า", exact: true });
  const bar = page.getByRole("toolbar", { name: "เครื่องมือจัดรูปแบบ รายละเอียดสินค้า" });
  await expect(ed).toBeVisible();
  // \n ของข้อความเดิม → ย่อหน้า/ขึ้นบรรทัด
  await expect(ed.locator("p")).toHaveCount(2);
  await expect(ed.locator("p").first().locator("br")).toHaveCount(1);
  // เพิ่มบรรทัดใหม่ เลือกทั้งบรรทัดแล้วทำตัวหนา + กึ่งกลาง + 24px
  await ed.locator("p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("ข้อความสำคัญ");
  await page.keyboard.down("Shift");
  await page.keyboard.press("Home");
  await page.keyboard.up("Shift");
  await bar.getByRole("button", { name: "ตัวหนา (Ctrl+B)" }).click();
  await bar.getByRole("button", { name: "กึ่งกลาง" }).click();
  await bar.getByRole("combobox", { name: "ขนาดตัวอักษร (px)" }).selectOption("24");
  await expect(ed.locator('span[style*="font-size: 24px"]')).toHaveCount(1);
  // ลิงก์ท้ายเนื้อหา (คลิกกลับเข้าช่องพิมพ์ก่อน — โฟกัสอยู่ที่ช่องเลือกขนาด)
  await ed.locator("p").first().click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await bar.getByRole("button", { name: "ใส่ลิงก์ (Ctrl+K)" }).click();
  await page.locator(".rte-pop input").first().fill("ดูสเปก");
  await page.locator(".rte-pop input").last().fill("/products");
  await page.locator('.rte-pop button:has-text("ใส่ลิงก์")').click();
  await expect(ed.locator('a[href="/products"]')).toHaveText("ดูสเปก");
  // แนบรูป (อัปโหลด → /media/...)
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC", "base64");
  await page.locator('.rte input[type=file]').last().setInputFiles({ name: "spec.png", mimeType: "image/png", buffer: png });
  await expect(ed.locator('img[src^="/media/products/"]')).toHaveCount(1);
  // โหมด HTML แล้วกลับ
  await bar.getByRole("button", { name: "แก้เป็นโค้ด HTML" }).click();
  await expect(page.getByRole("textbox", { name: "รายละเอียดสินค้า (HTML)" })).toHaveValue(/ข้อความสำคัญ/);
  await bar.getByRole("button", { name: "กลับไปโหมดแก้ไขปกติ" }).click();
  await page.locator('button[type=submit]:has-text("บันทึก")' + V).first().click();
  await expect(page.locator(".login-info" + V).first()).toContainText("บันทึกแล้ว");
  const [{ description }] = await q<{ description: string }>(`SELECT description FROM "Product" WHERE id=$1`, [P[0].id]);
  expect(description).toMatch(/text-align:\s*center/);
  expect(description).toMatch(/font-size:\s*24px/);
  expect(description).toMatch(/<(b|strong)>|font-weight/);
  expect(description).toContain('href="/products"');
  expect(description).toMatch(/<img [^>]*src="\/media\/products\//);
  // หน้าร้าน
  await page.goto(`/product/${P[0].slug}`);
  const d = page.locator(".prose-desc");
  await expect(d.locator('[style*="text-align"]', { hasText: "ข้อความสำคัญ" }).first()).toHaveCSS("text-align", "center");
  await expect(d.locator('a[href="/products"]')).toHaveText("ดูสเปก");
});

test("ทำสำเนาสินค้า: ไอคอนในหน้ารายการ และปุ่มด้านบนหน้าแก้ไข", async ({ page }) => {
  await login(page);
  await list(page);
  await page.getByRole("button", { name: `ทำสำเนา ${P[1].sku}` }).first().click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+\?copied=1/);
  await expect.poll(async () => (await q(`SELECT 1 FROM "Product" WHERE sku = $1`, [`${P[1].sku}-copy`])).length).toBe(1);
  // ปุ่มด้านบนของหน้าแก้ไข
  await page.goto(`/admin/products/${P[1].id}`);
  await page.locator("#dupTop" + V).click();
  await expect(page).toHaveURL(/copied=1/);
  await expect.poll(async () => (await q(`SELECT 1 FROM "Product" WHERE sku = $1`, [`${P[1].sku}-copy2`])).length).toBe(1);
});
