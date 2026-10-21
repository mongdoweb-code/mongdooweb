// รอบ 2 ล็อต 1 (U1–U15): หน้าสินค้า ค้นหา หมวด SEO ความเร็ว และการเข้าถึง (axe)
// รันได้ทั้งไฟล์เดียว: E2E_PORT=3201 npx playwright test tests/e2e/lot1.spec.ts
// ตั้ง LOT1_SHOTS=<โฟลเดอร์> เพื่อเก็บภาพหน้าจอเดสก์ท็อป/มือถือไว้ตรวจด้วยตา
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { V, trackErrors } from "./helpers";

type Item = { id: string; name: string; price: number; inStock: boolean; maxQty?: number; catId: string; acc?: boolean; kit?: boolean; sku?: string; img?: string };

async function catalog(page: Page) {
  if (!page.url().startsWith("http")) await page.goto("/products");
  return page.evaluate(() => JSON.parse(document.getElementById("mdw-data")!.textContent!).catalog as Item[]);
}

async function ldOf(page: Page) {
  const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
  return raw.map((t) => JSON.parse(t) as Record<string, unknown>);
}

const SHOTS = process.env.LOT1_SHOTS;
async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

/** ไม่มีเลื่อนแนวนอน */
async function noHScroll(page: Page) {
  // body ตั้ง overflow-x:hidden ไว้ จึงวัดความกว้างเนื้อหาของ <main> ด้วย (ของที่ล้นจะถูกตัดหาย)
  const [sw, mw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.querySelector("main")!.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, "หน้าต้องไม่เลื่อนแนวนอน").toBeLessThanOrEqual(cw);
  expect(mw, "เนื้อหาต้องไม่ล้นจอ").toBeLessThanOrEqual(cw);
}

/** หน้าสินค้าที่มีรูปมากกว่า 1 รูป */
async function multiImageProduct(page: Page, items: Item[]) {
  for (const p of items.filter((x) => x.img).slice(0, 40)) {
    await page.goto(`/product/${encodeURIComponent(p.id)}`);
    if ((await page.locator(".gal-slide").count()) > 1) return p;
  }
  throw new Error("ไม่พบสินค้าที่มีหลายรูป");
}

test.describe("U1–U2 JSON-LD และ breadcrumb", () => {
  test("Product JSON-LD ครบ + URL เต็ม + BreadcrumbList ตรงกับที่มองเห็น", async ({ page }) => {
    const items = await catalog(page);
    const p = items.find((x) => x.price > 0 && x.img)!;
    await page.goto(`/product/${encodeURIComponent(p.id)}`);
    const lds = await ldOf(page);
    const prod = lds.find((l) => l["@type"] === "Product") as Record<string, any>;
    expect(prod).toBeTruthy();
    for (const k of ["name", "sku", "image", "description", "brand", "offers", "url"]) {
      expect(prod[k], `Product.${k}`).toBeTruthy();
    }
    expect(Array.isArray(prod.image) && prod.image.length > 0).toBe(true);
    for (const u of prod.image) expect(u).toMatch(/^https?:\/\/[^/]+\/media\//);
    expect(prod.url).toMatch(/^https?:\/\//);
    expect(String(prod.description).length).toBeGreaterThan(10);
    expect(prod.brand.name).toBeTruthy();
    const o = prod.offers;
    expect(o.priceCurrency).toBe("THB");
    expect(Number(o.price)).toBeGreaterThan(0);
    expect(o.price).toMatch(/^\d+\.\d{2}$/);
    expect(o.availability).toMatch(/^https:\/\/schema\.org\/(InStock|OutOfStock)$/);
    expect(o.itemCondition).toBe("https://schema.org/NewCondition");
    expect(o.url).toMatch(/^https?:\/\//);
    // ไม่มีค่าว่างที่ใด
    const empties = JSON.stringify(prod).match(/:""|:null/g);
    expect(empties).toBeNull();

    const bc = lds.find((l) => l["@type"] === "BreadcrumbList") as { itemListElement: { name: string; item: string; position: number }[] };
    const visible = (await page.locator(".crumbs li" + V).allTextContents()).map((s) => s.trim());
    expect(bc.itemListElement.map((x) => x.name)).toEqual(visible);
    for (const it of bc.itemListElement) expect(it.item).toMatch(/^https?:\/\/[^/]+\//);
    expect(bc.itemListElement.at(-1)!.item).toContain(`/product/`);
  });

  test("หน้าหมวดมี BreadcrumbList ตรงกับที่มองเห็น", async ({ page }) => {
    await page.goto("/category/underwater-light");
    const bc = (await ldOf(page)).find((l) => l["@type"] === "BreadcrumbList") as { itemListElement: { name: string; item: string }[] };
    const visible = (await page.locator(".crumbs li" + V).allTextContents()).map((s) => s.trim());
    expect(bc.itemListElement.map((x) => x.name)).toEqual(visible);
    expect(bc.itemListElement.at(-1)!.item).toMatch(/^https?:\/\/[^/]+\/category\/underwater-light$/);
  });
});

test.describe("U3–U9 หน้าสินค้า", () => {
  test("U3 แกลเลอรี: ปุ่มก่อน/ถัดไป คีย์บอร์ด lightbox ปิดด้วย Esc และปัด", async ({ page }) => {
    const errors = trackErrors(page);
    const items = await catalog(page);
    await multiImageProduct(page, items);
    const n = await page.locator(".gal-slide").count();
    await expect(page.locator(".gal-count")).toHaveText(`1 / ${n}`);
    await page.locator(".pdp-main").hover();
    await page.click(".gal-nav.next");
    await expect(page.locator(".gal-count")).toHaveText(`2 / ${n}`);
    await page.click(".gal-nav.prev");
    await expect(page.locator(".gal-count")).toHaveText(`1 / ${n}`);
    // คีย์บอร์ด: โฟกัสรูปย่อแล้วกดลูกศร
    await page.locator(".pdp-thumbs button").first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".gal-count")).toHaveText(`2 / ${n}`);
    // ปัดบนมือถือ = scroll-snap: เลื่อน track แล้วตัวนับต้องตาม
    await page.locator(".gal-track").evaluate((el) => el.scrollTo({ left: 0 }));
    await expect(page.locator(".gal-count")).toHaveText(`1 / ${n}`);

    // lightbox: คลิกรูป → เปิด, ลูกศร → รูปถัดไป, Esc → ปิดและโฟกัสกลับ
    await page.locator(".gal-slide").first().click();
    const lb = page.locator("dialog.lb");
    await expect(lb).toBeVisible();
    await expect(page.locator(".lb-count")).toHaveText(`1 / ${n}`);
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".lb-count")).toHaveText(`2 / ${n}`);
    await page.click(".lb-nav.prev");
    await expect(page.locator(".lb-count")).toHaveText(`1 / ${n}`);
    await shot(page, "pdp-lightbox");
    await page.keyboard.press("Escape");
    await expect(lb).toHaveCount(0);

    // ปัดซ้าย = รูปถัดไป, ปัดลง = ปิด (pointer แบบ touch)
    await page.locator(".gal-slide").first().click();
    const stage = page.locator(".lb-stage");
    const box = (await stage.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const touch = { pointerType: "touch", pointerId: 7, isPrimary: true, bubbles: true };
    await stage.dispatchEvent("pointerdown", { ...touch, clientX: cx + 120, clientY: cy });
    await stage.dispatchEvent("pointerup", { ...touch, clientX: cx - 60, clientY: cy + 5 });
    await expect(page.locator(".lb-count")).toHaveText(`2 / ${n}`);
    await stage.dispatchEvent("pointerdown", { ...touch, clientX: cx, clientY: cy - 50 });
    await stage.dispatchEvent("pointermove", { ...touch, clientX: cx, clientY: cy + 40 });
    await stage.dispatchEvent("pointerup", { ...touch, clientX: cx, clientY: cy + 100 });
    await expect(lb).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("U4 รูปทุกรูปมี width/height, รูปแรก fetchpriority=high, รูปนอกจอ lazy", async ({ page }) => {
    const items = await catalog(page);
    await multiImageProduct(page, items);
    const imgs = await page.locator("main img").evaluateAll((els) =>
      els.map((e) => ({ w: e.getAttribute("width"), h: e.getAttribute("height"), loading: e.getAttribute("loading"), dec: e.getAttribute("decoding"), fp: e.getAttribute("fetchpriority"), src: e.getAttribute("src") })),
    );
    for (const im of imgs) {
      expect(im.w, `width ของ ${im.src}`).toBeTruthy();
      expect(im.h, `height ของ ${im.src}`).toBeTruthy();
      expect(im.dec, `decoding ของ ${im.src}`).toBe("async");
    }
    const first = page.locator(".gal-slide img").first();
    await expect(first).toHaveAttribute("fetchpriority", "high");
    await expect(first).not.toHaveAttribute("loading", "lazy");
    await expect(page.locator(".gal-slide img").nth(1)).toHaveAttribute("loading", "lazy");
    // รายการสินค้า: แถวแรกโหลดทันที ที่เหลือ lazy
    await page.goto("/products");
    const loads = await page.locator(".prod-img img").evaluateAll((els) => els.map((e) => [e.getAttribute("loading"), e.getAttribute("width"), e.getAttribute("height")]));
    expect(loads[0][0]).toBe("eager");
    expect(loads.at(-1)![0]).toBe("lazy");
    for (const l of loads) expect(l[1] && l[2]).toBeTruthy();
    // ไม่มี layout shift จากรูป (CLS ≈ 0)
    const cls = await page.evaluate(
      () =>
        new Promise<number>((res) => {
          let v = 0;
          new PerformanceObserver((list) => {
            for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) v += e.value;
          }).observe({ type: "layout-shift", buffered: true });
          setTimeout(() => res(v), 1200);
        }),
    );
    expect(cls).toBeLessThan(0.1);
  });

  test("U5 จำนวนจำกัดตามสต็อก + 'เหลือ n ชิ้น'", async ({ page }) => {
    const items = await catalog(page);
    const p = items.filter((x) => x.price > 0 && x.inStock && x.maxQty != null && x.maxQty > 0).sort((a, b) => a.maxQty! - b.maxQty!)[0];
    expect(p, "ต้องมีสินค้าที่นับสต็อก").toBeTruthy();
    await page.goto(`/product/${encodeURIComponent(p.id)}`);
    await page.evaluate(() => localStorage.removeItem("mdw_cart"));
    await page.reload();
    const input = page.locator("#pdpQty");
    await input.fill("9999");
    await expect(input).toHaveValue(String(p.maxQty));
    await expect(page.locator(".pdp-qty button[aria-label='เพิ่มจำนวน']")).toBeDisabled();
    await input.fill("0");
    await input.blur();
    await expect(input).toHaveValue("1");
    await expect(page.locator(".pdp-qty button[aria-label='ลดจำนวน']")).toBeDisabled();
    if (p.maxQty! <= 5) await expect(page.locator(".pdp-qty-note .low")).toContainText(`เหลือ ${p.maxQty}`);
    else await expect(page.locator(".pdp-qty-note")).toContainText(`สูงสุด ${p.maxQty}`);
    // ใส่ครบสต็อกแล้ว → ใส่เพิ่มไม่ได้
    await input.fill(String(p.maxQty));
    await page.click(".pdp-add");
    await expect(page.locator("#cart.open")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".pdp-add")).toBeDisabled();
    const inCart = await page.evaluate((id) => JSON.parse(localStorage.getItem("mdw_cart") || "{}")[id], p.id);
    expect(inCart).toBe(p.maxQty);
    await page.evaluate(() => localStorage.removeItem("mdw_cart"));
  });

  test("U6 แถบใส่ตะกร้าติดล่างจอบนมือถือ ไม่ทับปุ่ม LINE", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const items = await catalog(page);
    const p = items.find((x) => x.price > 0 && x.inStock && x.img)!;
    await page.goto(`/product/${encodeURIComponent(p.id)}`);
    await page.evaluate(() => localStorage.setItem("mdw_consent", JSON.stringify({ v: 1, necessary: true, analytics: false, marketing: false })));
    await page.reload();
    await expect(page.locator(".pdp-bar")).toBeHidden();
    await shot(page, "pdp-mobile-top");
    await page.locator(".pdp-add").evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().bottom + window.scrollY + 200));
    const bar = page.locator(".pdp-bar");
    await expect(bar).toBeVisible();
    await page.waitForTimeout(400); // รอปุ่มลอยเลื่อนขึ้น (transition)
    const barBox = (await bar.boundingBox())!;
    const line = (await page.locator(".float-line").boundingBox())!;
    expect(line.y + line.height, "ปุ่ม LINE ต้องอยู่เหนือแถบ").toBeLessThanOrEqual(barBox.y + 1);
    // ชื่อ/ราคาในแถบอ่านได้ (ปุ่มไม่กินพื้นที่ทั้งแถบ) และเนื้อหามีระยะขอบจากขอบจอ
    expect((await page.locator(".pdp-bar-txt").boundingBox())!.width).toBeGreaterThan(120);
    expect((await page.locator(".pdp h1").boundingBox())!.x).toBeGreaterThanOrEqual(12);
    await shot(page, "pdp-mobile-bar");
    await noHScroll(page);
    // เลื่อนกลับขึ้น → แถบหาย
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(bar).toBeHidden();
    // เดสก์ท็อปไม่แสดง
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => window.scrollTo(0, 3000));
    await expect(bar).toBeHidden();
  });

  test("U7 ราคา 0 = สอบถามราคา: ลิงก์ LINE OA พร้อมชื่อสินค้าและรหัส", async ({ page }) => {
    const items = await catalog(page);
    const p = items.find((x) => x.price === 0)!;
    expect(p, "ต้องมีสินค้าราคา 0").toBeTruthy();
    await page.goto(`/product/${encodeURIComponent(p.id)}`);
    await expect(page.locator(".pdp-price")).toHaveText("สอบถามราคา");
    await expect(page.locator(".pdp-add")).toHaveCount(0);
    const a = page.locator("a.pdp-line");
    await expect(a).toHaveText("สอบถามราคาทาง LINE");
    const href = (await a.getAttribute("href"))!;
    // shell.js ห้ามเขียนทับ href นี้ (ไม่มี data-line)
    await page.waitForFunction(() => (window as unknown as { mdwShellReady?: boolean }).mdwShellReady);
    expect(await a.getAttribute("href")).toBe(href);
    expect(href).toMatch(/^https:\/\/line\.me\/R\/oaMessage\/%40mongdoweb\/\?/);
    const text = decodeURIComponent(href.split("?")[1]);
    expect(text).toContain(p.name);
    expect(text).toContain(`รหัสสินค้า: ${p.sku}`);
    expect(text).toContain(`/product/`);
    await expect(a).toHaveAttribute("target", "_blank");
  });

  test("U8 ซื้อคู่กัน: หม้อแปลง/ท่อหด/รีโมทที่เข้ากัน และไม่มีสินค้าปิดขาย", async ({ page, request }) => {
    const items = await catalog(page);
    const byId = new Map(items.map((x) => [x.id, x]));
    // โคมที่ชื่อระบุแรงดัน → หม้อแปลงที่แนะนำต้องแรงดันเดียวกัน
    const light = items.find((x) => x.catId === "underwater-light" && !x.acc && !x.kit && x.price > 0 && /\b(?:dc|ac)?\s*(12|24)\s*v/i.test(x.name))!;
    const volt = /(12|24)\s*v/i.exec(light.name)![1];
    await page.goto(`/product/${encodeURIComponent(light.id)}`);
    const sec = page.locator(".pdp-pair");
    await expect(sec.locator("h2")).toHaveText("ซื้อคู่กัน");
    const ids = await sec.locator(".prod-card").evaluateAll((els) => els.map((e) => e.id.replace(/^prod-/, "")));
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).not.toContain(light.id);
    // ทุกชิ้นเปิดขายอยู่ (อยู่ใน catalog หน้าร้าน) มีราคาและมีของ
    for (const id of ids) {
      const it = byId.get(id);
      expect(it, `${id} ต้องเปิดขาย`).toBeTruthy();
      expect(it!.price > 0 && it!.inStock).toBe(true);
    }
    const psus = ids.map((id) => byId.get(id)!).filter((x) => x.catId === "power-supply" || /หม้อแปลง/.test(x.name));
    expect(psus.length).toBeGreaterThan(0);
    for (const x of psus) expect(x.name, "แรงดันหม้อแปลงต้องตรงกับโคม").toMatch(new RegExp(`${volt}\\s*V`, "i"));
    await expect(sec.locator(".prod-note").first()).toContainText(/หม้อแปลง|ท่อหด|รีโมท/);
    // สินค้าในหมวดเดียวกันยังแสดง
    await expect(page.locator("#related-h")).toHaveText("สินค้าในหมวดเดียวกัน");
    // หน้าสินค้าที่ปิดขาย/ไม่มีอยู่ ไม่ใช่หน้าขาย
    const res = await request.get("/product/this-product-does-not-exist-xyz");
    expect(await res.text()).not.toContain("ซื้อคู่กัน");
  });

  test("U9 สินค้าที่ดูล่าสุด: เก็บในเครื่อง ≤ 8, แสดงในหน้าสินค้าและตะกร้าว่าง, ไม่ใช้คุกกี้", async ({ page, context }) => {
    const items = (await catalog(page)).slice(0, 10);
    await page.evaluate(() => {
      localStorage.removeItem("mdw_recent");
      localStorage.removeItem("mdw_cart");
    });
    for (const p of items) {
      await page.goto(`/product/${encodeURIComponent(p.id)}`);
      await page.waitForFunction(() => (localStorage.getItem("mdw_recent") ?? "").length > 2);
    }
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("mdw_recent")!) as { id: string }[]);
    expect(stored.length).toBe(8);
    expect(stored[0].id).toBe(items[9].id);
    expect(stored.map((s) => s.id)).not.toContain(items[0].id);
    // หน้าสินค้าแสดงรายการที่ดูก่อนหน้า (ไม่รวมสินค้าหน้านี้)
    const recent = page.locator("section.recent");
    await expect(recent.locator("h2")).toHaveText("สินค้าที่คุณดูล่าสุด");
    const shown = await recent.locator(".prod-card").evaluateAll((els) => els.map((e) => e.id.replace(/^prod-/, "")));
    expect(shown[0]).toBe(items[8].id);
    expect(shown).not.toContain(items[9].id);
    // ตะกร้าว่าง → แสดงสินค้าที่ดูล่าสุด
    await page.click("#cartBtn");
    await expect(page.locator("#cart .cart-recent")).toBeVisible();
    await expect(page.locator("#cart .cart-recent li").first()).toContainText(items[9].name.slice(0, 8));
    // ไม่มีคุกกี้ติดตาม
    const cookies = await context.cookies();
    expect(cookies.filter((c) => /recent|view/i.test(c.name))).toEqual([]);
    // ล้างรายการได้
    await page.keyboard.press("Escape");
    await recent.locator(".recent-clear").click();
    await expect(recent).toHaveCount(0);
  });
});

test.describe("U10–U11 ค้นหาและหน้าหมวด", () => {
  test("U10 ค้นหา: คำไม่เต็ม/ตัวพิมพ์/เว้นวรรค/รหัสสินค้า + จำนวนผล + ไม่พบ → คำแนะนำ หมวด LINE", async ({ page }) => {
    for (const q of ["ไฟสระ", "rgb", "RGB", "DL1", "dl 1", "ไฟ สระ", "ไฟสระน้ำ"]) {
      await page.goto(`/search?q=${encodeURIComponent(q)}`);
      const n = await page.locator(".prod-card").count();
      expect(n, `ค้น "${q}" ต้องเจอ`).toBeGreaterThan(0);
      await expect(page.locator(".srch-count")).toContainText(/พบ|ใกล้เคียง/);
    }
    await page.goto(`/search?q=DL1`);
    await expect(page.locator(".prod-card").first()).toBeVisible();
    await expect(page.locator(".srch-count b")).toHaveText(/\d+/);
    await shot(page, "search-results");
    await page.goto(`/search?q=${encodeURIComponent("zzqx ไม่มีแน่นอน")}`);
    await expect(page.locator(".srch-empty-head")).toContainText("ไม่พบสินค้า");
    expect(await page.locator(".srch-empty .chip[href^='/category/']").count()).toBeGreaterThan(2);
    expect(await page.locator(".srch-empty .chip[href^='/search?q=']").count()).toBeGreaterThan(2);
    const line = page.locator(".srch-actions .btn-line");
    await expect(line).toHaveAttribute("href", /^https:\/\/line\.me\/R\/oaMessage\/%40mongdoweb\/\?/);
    await shot(page, "search-empty");
  });

  test("U11 เรียง/กรองอยู่ใน URL, จำนวนผล, ล้างตัวกรอง, ย้อนกลับได้", async ({ page }) => {
    const errors = trackErrors(page);
    const base = "/category/underwater-light";
    await page.goto(base);
    const total = Number(await page.locator(".lst-count b").textContent());
    expect(total).toBeGreaterThan(0);
    expect(await page.locator(".prod-card").count()).toBe(Math.min(24, total));

    // เรียงราคาต่ำ → สูง
    await page.selectOption(".lst-sort select", "price-asc");
    await page.waitForURL(/sort=price-asc/);
    const prices = await page.locator(".prod-price").evaluateAll((els) =>
      els.map((e) => Number((e.childNodes[0]?.textContent ?? "").replace(/[^\d.]/g, "")) || Infinity),
    );
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    for (const s of ["price-desc", "best", "new", ""]) {
      await page.selectOption(".lst-sort select", s);
      await page.waitForURL((u) => (s ? u.search.includes(`sort=${s}`) : !u.search.includes("sort=")));
    }

    // กรองสี RGB → URL + จำนวน
    await page.click(".lst-group a.chip:has-text('RGB')");
    await page.waitForURL(/color=rgb/);
    const rgb = Number(await page.locator(".lst-count b").textContent());
    expect(rgb).toBeGreaterThan(0);
    expect(rgb).toBeLessThanOrEqual(total);
    // กรองช่วงราคา + มีของ
    await page.click(".lst-group a.chip:has-text('฿500 – 1,000')");
    await page.waitForURL(/price=500-1000/);
    const prices2 = await page.locator(".prod-price").evaluateAll((els) => els.map((e) => Number((e.childNodes[0]?.textContent ?? "").replace(/[^\d.]/g, ""))));
    for (const p of prices2) expect(p >= 500 && p < 1000).toBe(true);
    await page.click(".lst-group a.chip:has-text('มีของพร้อมส่ง')");
    await page.waitForURL(/stock=in/);
    await expect(page.locator(".lst-active .chip-x")).toHaveCount(3);
    await shot(page, "category-filtered");
    // ย้อนกลับ = ตัวกรองก่อนหน้า
    await page.goBack();
    await expect(page).toHaveURL(/price=500-1000/);
    await expect(page).not.toHaveURL(/stock=in/);
    await page.goBack();
    await expect(page).not.toHaveURL(/price=/);
    // การใช้งาน (บ่อปลา)
    await page.click(".lst-group a.chip:has-text('บ่อปลา')");
    await page.waitForURL(/use=pond/);
    // ล้างตัวกรองทั้งหมด (คงการเรียงไว้)
    await page.click(".lst-clear");
    await page.waitForURL((u) => u.pathname === base && !/color|use|price|stock/.test(u.search));
    expect(Number(await page.locator(".lst-count b").textContent())).toBe(total);
    expect(errors).toEqual([]);
  });

  test("U11 มือถือ: ปุ่มตัวกรองเปิด/ปิดแผง ไม่มีเลื่อนแนวนอน", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/category/underwater-light");
    const panel = page.locator(".lst-panel");
    await expect(panel).toBeHidden();
    await page.click(".lst-toggle");
    await expect(page.locator(".lst-toggle")).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();
    await shot(page, "category-mobile-filters");
    await noHScroll(page);
    await page.goto("/product/" + encodeURIComponent((await catalog(page)).find((x) => x.img)!.id));
    await noHScroll(page);
    await page.goto("/search?q=rgb");
    await noHScroll(page);
  });
});

test.describe("U12 meta / Open Graph / canonical", () => {
  test("ทุกหน้ามี description, canonical ไม่มี query, หมวดมี og:image เป็นรูปสินค้า", async ({ page }) => {
    const items = await catalog(page);
    const pages = ["/", "/products", "/category/underwater-light?sort=price-asc&color=rgb", `/product/${items[0].id}`, "/search?q=rgb", "/privacy", "/warranty", "/track", "/this-page-does-not-exist"];
    for (const u of pages) {
      await page.goto(u);
      const d = await page.locator('meta[name="description"]').getAttribute("content");
      expect(d && d.length > 20, `description ของ ${u}`).toBe(true);
      const link = page.locator('link[rel="canonical"]');
      if (await link.count()) expect(await link.first().getAttribute("href"), `canonical ของ ${u}`).not.toContain("?");
    }
    await page.goto("/category/underwater-light?sort=price-asc&page=2");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/category\/underwater-light$/);
    const og = await page.locator('meta[property="og:image"]').first().getAttribute("content");
    expect(og).toMatch(/^https?:\/\/[^/]+\/media\/products\//);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
    await expect(page.locator('meta[name="twitter:image"]').first()).toHaveAttribute("content", /^https?:\/\//);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /ไฟใต้น้ำ/);
  });
});

test.describe("U13 redirect URL เดิมของ WordPress", () => {
  const cases: [string, RegExp][] = [
    ["/?p=27", /\/api\/legacy-wp\?p=27$/],
    ["/?s=" + encodeURIComponent("ไฟสระ"), /\/api\/legacy-wp\?s=/],
    ["/tag/" + encodeURIComponent("ไฟสระ"), /\/search\?q=%E0%B9%84/],
    ["/product-tag/rgb", /\/search\?q=rgb$/],
    ["/page/2", /\/$/],
    ["/category/news", /\/products$/],
    ["/category/uncategorized/page/2", /\/category\/uncategorized$/],
    ["/category/" + encodeURIComponent("ไฟใต้น้ำ-underwater-light"), /\/category\/underwater-light$/],
    ["/feed", /\/$/],
    ["/comments/feed", /\/$/],
    ["/product/red-5050-led/feed", /\/product\/red-5050-led$/],
    ["/wp-login.php", /\/admin\/login$/],
    ["/wp-admin/edit.php", /\/admin\/login$/],
    ["/wp-content/uploads/2020/01/a.jpg", /\/$/],
    ["/wp-json/wp/v2/posts", /\/$/],
    ["/wp-sitemap.xml", /\/sitemap\.xml$/],
    ["/xmlrpc.php", /\/$/],
    ["/2021/05/hello", /\/$/],
    ["/author/admin", /\/$/],
  ];
  test("ทุกรูปแบบตอบ 301 ไปหน้าที่ใกล้ที่สุด", async ({ request }) => {
    for (const [from, to] of cases) {
      const r = await request.get(from, { maxRedirects: 0 });
      expect(r.status(), from).toBe(301);
      expect(r.headers()["location"], from).toMatch(to);
    }
  });
  test("query เดิม (?p= ?product= ?s= ?product_cat=) จบที่หน้าจริง ไม่ใช่ 404", async ({ request, page }) => {
    const items = await catalog(page);
    const finals: [string, RegExp][] = [
      ["/?p=27", /\/product\//],
      ["/?p=99999999", /\/$/],
      ["/?product=" + encodeURIComponent("led-strip-ไฟเส้นแอลอีดีเส้นสีแดง-5050"), /\/product\/red-5050-led$/],
      ["/?s=" + encodeURIComponent("ไฟสระ"), /\/search\?q=/],
      ["/?product_cat=" + encodeURIComponent("ไฟใต้น้ำ-underwater-light"), /\/category\/underwater-light$/],
      ["/?post_type=product", /\/products$/],
      ["/feed/", /\/$/],
      ["/tag/rgb/", /\/search\?q=rgb$/],
    ];
    for (const [from, to] of finals) {
      const r = await request.get(from);
      expect(r.status(), from).toBe(200);
      expect(r.url(), from).toMatch(to);
    }
    expect(items.length).toBeGreaterThan(0);
    // หมวดใหม่ยังเปิดได้ตามปกติ
    expect((await request.get("/category/underwater-light", { maxRedirects: 0 })).status()).toBe(200);
  });
});

test.describe("U14 manifest + ไอคอน", () => {
  test("manifest ครบตามเกณฑ์ติดตั้ง + ไอคอนขนาดถูก + theme-color", async ({ page, request }) => {
    await page.goto("/");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBeTruthy();
    const m = await (await request.get(href!)).json();
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toMatch(/^\//);
    expect(["standalone", "fullscreen", "minimal-ui"]).toContain(m.display);
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    const sizes = new Set<string>();
    for (const ic of m.icons as { src: string; sizes: string; purpose?: string }[]) {
      const r = await request.get(ic.src);
      expect(r.status(), ic.src).toBe(200);
      const b = await r.body();
      // ขนาดจริงจาก PNG header (IHDR)
      const w = b.readUInt32BE(16);
      const h = b.readUInt32BE(20);
      expect(`${w}x${h}`).toBe(ic.sizes);
      sizes.add(ic.sizes);
    }
    expect(sizes.has("192x192") && sizes.has("512x512")).toBe(true);
    expect((m.icons as { purpose?: string }[]).some((i) => i.purpose === "maskable")).toBe(true);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", m.theme_color);
    const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
    const ab = await (await request.get(apple!)).body();
    expect(ab.readUInt32BE(16)).toBe(180);
    expect((await request.get("/favicon.ico")).status()).toBe(200);
    expect(await page.locator('link[rel="icon"]').count()).toBeGreaterThan(0);
  });
});

test.describe("U15 การเข้าถึง (axe)", () => {
  // ส่วนกลางของหน้าร้าน (ส่วนหัว เมนู ตะกร้า ท้ายเว็บ ปุ่มลอย แบนเนอร์คุกกี้) อยู่ในความดูแลของล็อต 2 — ตรวจแยก
  const SHELL = ["#topbar", "#header", "#drawer", "#cart", "footer.footer", "#fabs", "#consent", "#toast", ".skip"];

  async function check(page: Page, url: string) {
    await page.goto(url);
    await page.waitForFunction(() => (window as unknown as { mdwShellReady?: boolean }).mdwShellReady);
    let b = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
    for (const s of SHELL) b = b.exclude(s);
    const r = await b.analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(
      bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 5).join(" | ")}`),
      `axe ${url}`,
    ).toEqual([]);
  }

  test("หน้าแรก", async ({ page }) => check(page, "/"));
  test("หน้าหมวด", async ({ page }) => check(page, "/category/underwater-light?color=rgb"));
  test("หน้าสินค้า", async ({ page }) => {
    const items = await catalog(page);
    await check(page, `/product/${encodeURIComponent(items.find((x) => x.price > 0 && x.img)!.id)}`);
  });
  test("หน้าสินค้าสอบถามราคา", async ({ page }) => {
    const items = await catalog(page);
    await check(page, `/product/${encodeURIComponent(items.find((x) => x.price === 0)!.id)}`);
  });
  test("ค้นหา (มีผล / ไม่พบ)", async ({ page }) => {
    await check(page, "/search?q=rgb");
    await check(page, "/search?q=zzqx");
  });

  test("skip-link เป็นจุดโฟกัสแรกและพาไปเนื้อหาหลัก, focus มองเห็นได้", async ({ page }) => {
    await page.goto("/category/underwater-light");
    await page.keyboard.press("Tab");
    const skip = page.locator("a.skip");
    await expect(skip).toBeFocused();
    const top = await skip.evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(0);
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeFocused();
    // ชิปตัวกรองมีกรอบโฟกัส
    const chip = page.locator(".lst-group a.chip").first();
    await chip.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
    expect(outline).not.toBe("none");
  });
});
