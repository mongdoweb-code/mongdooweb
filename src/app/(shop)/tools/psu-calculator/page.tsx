// /tools/psu-calculator — เครื่องคำนวณหม้อแปลง (U8)
// วัตต์ต่อดวง × จำนวน (หลายแถวได้) × 1.2 → แนะนำหม้อแปลงที่มีของ แรงดันตรงกัน ตัวเล็กที่สุดที่พอ พร้อมปุ่มใส่ตะกร้า
// ?light=<slug>&qty=<n> = เติมโคมจากหน้าสินค้า/ตัวช่วยเลือกไฟให้อัตโนมัติ (อ่านฝั่งเบราว์เซอร์ หน้าจึงแคชได้ทั้งหน้า)
import type { Metadata } from "next";
import { getCatalogExtras } from "@/lib/product-data";
import { wattOf, type PsuItem, type PsuLight, type PsuPower } from "@/lib/product-psu";
import { LIGHT_CATS, getShopData, isPsuName, powerOf } from "@/lib/storefront";
import { PageHead } from "../../_components/PageHead";
import { PsuCalculator } from "./PsuCalculator";

export const metadata: Metadata = {
  title: "เครื่องคำนวณหม้อแปลงไฟ LED — มองดูเว็บ",
  description: "คำนวณขนาดหม้อแปลง (Power Supply) สำหรับไฟ LED 12V/24V: ใส่วัตต์ต่อดวงและจำนวนดวง ระบบเผื่อกำลัง 20% และแนะนำหม้อแปลงที่เหมาะพร้อมสั่งซื้อ",
  alternates: { canonical: "/tools/psu-calculator" },
};

/** แรงดันจากค่าสเปก (เช่น "DC12V") หรือชื่อสินค้า */
const powerFrom = (attr: unknown, name: string): PsuPower | null => (typeof attr === "string" ? powerOf(attr) : null) ?? powerOf(name);
const wattFrom = (attr: unknown, name: string) => (typeof attr === "number" && attr > 0 ? attr : wattOf(name));

export default async function PsuCalculatorPage() {
  const [{ catalog }, extras] = await Promise.all([getShopData(), getCatalogExtras()]);
  const attrs = (id: string) => extras.bySlug[id]?.attrs ?? {};
  const psus: PsuItem[] = catalog
    .filter((p) => p.acc && isPsuName(p.name, p.catId))
    .map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      inStock: p.inStock,
      ...(p.img ? { img: p.img } : {}),
      watt: wattFrom(attrs(p.id).watt, p.name) ?? 0,
      power: powerFrom(attrs(p.id).voltage, p.name),
    }))
    .filter((p) => p.watt > 0);
  const lights: PsuLight[] = catalog
    .filter((p) => !p.acc && !p.kit && LIGHT_CATS.has(p.catId))
    .map((p) => ({ id: p.id, name: p.name, price: p.price, watt: wattFrom(attrs(p.id).watt, p.name) ?? 0, power: powerFrom(attrs(p.id).voltage, p.name) }))
    .filter((p): p is PsuLight => p.watt > 0 && !!p.power)
    .sort((a, b) => a.name.localeCompare(b.name, "th"));

  return (
    <main id="main" tabIndex={-1}>
      <PageHead
        crumbs={[{ label: "คำนวณหม้อแปลง" }]}
        selfHref="/tools/psu-calculator"
        eyebrow="เครื่องมือช่วยเลือก"
        title="คำนวณหม้อแปลงไฟ LED"
        sub="ใส่วัตต์ต่อดวงและจำนวนดวง ระบบรวมวัตต์ × 1.2 (เผื่อกำลัง 20%) แล้วแนะนำหม้อแปลงที่เหมาะสม"
      />
      <div className="container pg-body">
        <PsuCalculator psus={psus} lights={lights} />
      </div>
    </main>
  );
}
