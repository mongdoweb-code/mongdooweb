// /admin/orders/new — สร้างคำสั่งซื้อให้ลูกค้าที่สั่งทางโทร/LINE/หน้าร้าน (เลือก/สร้างลูกค้า, สินค้า, ค่าส่ง, ชำระแล้วหรือรอโอน)
import Link from "next/link";
import { ADMIN_SOURCES } from "@/lib/admin-orders";
import { requireAdmin } from "@/lib/auth";
import { parseTiers, unitPriceSatang } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { getSettings, shipConfig } from "@/lib/settings";
import { ManualOrderForm } from "../OrderForms";
import "../../../lot3.css";

export default async function NewOrderPage() {
  await requireAdmin();
  const [s, products] = await Promise.all([
    getSettings(),
    prisma.product.findMany({
      where: { isService: false },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: { id: true, sku: true, name: true, priceSatang: true, compareAtSatang: true, salePriceSatang: true, saleStartsAt: true, saleEndsAt: true, tierPrices: true, weightGram: true, trackStock: true, stock: true, inStock: true, isActive: true },
    }),
  ]);
  return (
    <main className="main" id="page-new-order">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin">← คำสั่งซื้อ</Link></p>
          <h1>สร้างคำสั่งซื้อ</h1>
          <p>สำหรับลูกค้าที่สั่งทางโทรศัพท์ LINE หรือหน้าร้าน — เลขที่คำสั่งซื้อรูปแบบเดียวกับหน้าเว็บ ลูกค้าติดตามสถานะได้</p>
        </div>
      </div>
      <ManualOrderForm
        // ราคาตั้งต้น = ราคาขายจริง (ราคาลดตามช่วงเวลา) + ราคาขายส่งตามจำนวน — แอดมินแก้ได้ในฟอร์ม
        products={products.map(({ compareAtSatang: _c, salePriceSatang: _s, saleStartsAt: _a, saleEndsAt: _e, tierPrices, weightGram, ...p }) => {
          void _c;
          const tiers = parseTiers(tierPrices);
          return {
            ...p, priceSatang: unitPriceSatang({ priceSatang: p.priceSatang, salePriceSatang: _s, saleStartsAt: _a, saleEndsAt: _e }),
            weightGram: Math.max(0, weightGram ?? 0), ...(tiers.length ? { tiers } : {}),
          };
        })}
        ship={shipConfig(s)}
        sources={ADMIN_SOURCES}
      />
    </main>
  );
}
