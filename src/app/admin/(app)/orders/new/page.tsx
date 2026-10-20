// /admin/orders/new — สร้างคำสั่งซื้อให้ลูกค้าที่สั่งทางโทร/LINE/หน้าร้าน (เลือก/สร้างลูกค้า, สินค้า, ค่าส่ง, ชำระแล้วหรือรอโอน)
import Link from "next/link";
import { ADMIN_SOURCES } from "@/lib/admin-orders";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSettings, parseShippingTiers } from "@/lib/settings";
import { ManualOrderForm } from "../OrderForms";
import "../../../lot3.css";

export default async function NewOrderPage() {
  await requireAdmin();
  const [s, products] = await Promise.all([
    getSettings(),
    prisma.product.findMany({
      where: { isService: false },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: { id: true, sku: true, name: true, priceSatang: true, trackStock: true, stock: true, inStock: true, isActive: true },
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
        products={products}
        tiers={parseShippingTiers(s.shippingTiers)}
        expressEnabled={s.expressEnabled}
        expressExtraSatang={s.expressExtraSatang}
        sources={ADMIN_SOURCES}
      />
    </main>
  );
}
