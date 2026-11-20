// ใบปะหน้า: แก้ชื่อ/ที่อยู่/เบอร์ผู้รับเฉพาะใบนี้ (ส่งของคนละที่กับผู้สั่ง) · เบอร์อยู่ใต้ที่อยู่ · ไม่มีเบอร์ = เว้นเส้นให้เขียน
// · แถบข้างหน้าเอกสารมีกรอบแยกทุกบล็อก
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, login } from "./helpers";

const TAG = Date.now().toString(36);
async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}

test("แก้ผู้รับบนใบปะหน้า + เบอร์ใต้ที่อยู่ + กรอบบล็อกแถบข้าง", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/admin/docs/INVOICE/new/edit");
  await page.getByRole("button", { name: "+ ลูกค้าใหม่" }).click();
  await page.getByRole("button", { name: "นิติบุคคล / บริษัท" }).click();
  await page.fill("#qcName" + V, `บริษัท ผู้สั่งทดสอบ ${TAG} จำกัด`);
  await page.fill("#qcAddressLine" + V, "1/1 ถ.ทดสอบ");
  await page.fill("#qcProvince" + V, "เชียงใหม่");
  await page.fill("#qcPostalCode" + V, "50200");
  await page.getByRole("button", { name: "บันทึกลูกค้าและเลือก" }).click();
  const l1 = page.locator(".de-line" + V).first();
  await l1.locator(".ac-wrap .ln-name").fill(`ไฟสวน ${TAG}`);
  await l1.locator(".ln-nums input").nth(2).fill("500");
  await page.click(`button:has-text("บันทึกและออกเอกสาร")${V}`);
  await page.waitForURL(/\/admin\/docs\/INVOICE\/[^/?]+\?issued=1/);
  const id = page.url().split("/").pop()!.split("?")[0];

  // ทุกบล็อกในแถบข้างมีกรอบ
  const borders = await page.locator(".dv .dv-side > *" + V).evaluateAll((els) => els.map((e) => getComputedStyle(e).borderLeftStyle));
  expect(borders.length).toBeGreaterThan(2);
  expect(borders.every((b) => b === "solid")).toBe(true);

  // ค่าเริ่มต้น: ลูกค้าไม่มีเบอร์ → ใบปะหน้าเว้นเส้นให้เขียน · เบอร์อยู่ใต้ที่อยู่
  await page.locator(".lbl-box summary" + V).click();
  const box = page.locator(".lbo" + V).first();
  const href0 = await box.locator("a.btn").getAttribute("href");
  expect(href0).not.toContain("toName");
  await page.goto(href0!.replace("auto=1", "auto=0"));
  let to = page.locator(".label .lb-to").first();
  await expect(to.locator(".lb-name")).toHaveText(`บริษัท ผู้สั่งทดสอบ ${TAG} จำกัด`);
  await expect(to.locator(".lb-phone.blank")).toHaveCount(1);
  const order0 = await to.evaluate((el) => [...el.children].map((c) => c.className));
  expect(order0.indexOf("lb-addr")).toBeLessThan(order0.findIndex((c) => c.startsWith("lb-phone")));

  // แก้ผู้รับเฉพาะใบนี้
  await page.goto(`/admin/docs/INVOICE/${id}`);
  await page.locator(".lbl-box summary" + V).click();
  await box.getByLabel("แก้ไขชื่อ/ที่อยู่/เบอร์ผู้รับ").check();
  await expect(page.locator(`#lb-to-name-${id}`)).toHaveValue(`บริษัท ผู้สั่งทดสอบ ${TAG} จำกัด`);
  await page.fill(`#lb-to-name-${id}`, `คุณผู้รับหน้างาน ${TAG}`);
  await page.fill(`#lb-to-addr-${id}`, "99 หมู่ 2 ไซต์งานก่อสร้าง\nต.ทดสอบ อ.เมือง จ.ลำพูน");
  await page.fill(`#lb-to-phone-${id}`, "081-234-5678");
  await page.fill(`#lb-to-zip-${id}`, "51000");
  const href = await box.locator("a.btn").getAttribute("href");
  expect(href).toContain("toName=");
  await page.goto(href!.replace("auto=1", "auto=0"));
  to = page.locator(".label .lb-to").first();
  await expect(to.locator(".lb-name")).toHaveText(`คุณผู้รับหน้างาน ${TAG}`);
  await expect(to.locator(".lb-addr")).toContainText("ไซต์งานก่อสร้าง");
  await expect(to.locator(".lb-addr")).toContainText("จ.ลำพูน");
  await expect(to.locator(".lb-phone")).toHaveText("โทร 081-234-5678");
  await expect(to.locator(".lb-zip span").first()).toHaveText("5");
  // ข้อมูลลูกค้า/เอกสารไม่เปลี่ยน
  const [d] = await q<{ n: string }>(`SELECT "customerSnapshot"->>'name' n FROM "SalesDocument" WHERE id=$1`, [id]);
  expect(d.n).toBe(`บริษัท ผู้สั่งทดสอบ ${TAG} จำกัด`);
});
