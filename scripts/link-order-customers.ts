// ผูกคำสั่งซื้อที่ชำระแล้ว/จัดส่งแล้วแต่ยังไม่มีลูกค้า (Order.customerId ว่าง) เข้ากับรายชื่อลูกค้า
// จับคู่ด้วยเบอร์โทร (เฉพาะตัวเลข) → อีเมล → ไม่พบสร้างลูกค้าใหม่ — กติกาเดียวกับตอนยืนยันชำระ (src/lib/order-customer.ts)
// รันซ้ำได้ (ทำเฉพาะที่ยังว่าง) · --dry-run = แสดงอย่างเดียว ไม่บันทึก
//   npx tsx scripts/link-order-customers.ts [--dry-run]
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { customerForOrder, matchCustomer } from "../src/lib/order-customer";

async function main() {
  const dry = process.argv.includes("--dry-run");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const orders = await prisma.order.findMany({
      where: { customerId: null, status: { in: ["PAID", "SHIPPED"] } },
      orderBy: { createdAt: "asc" },
      select: { id: true, orderNo: true, customerId: true, customerName: true, phone: true, email: true, addressLine: true, subdistrict: true, district: true, province: true, postalCode: true },
    });
    let linked = 0, created = 0;
    for (const o of orders) {
      if (dry) {
        const c = await matchCustomer(prisma, o);
        console.log(`${o.orderNo} → ${c ? `ลูกค้าเดิม ${c.code} ${c.name}` : `สร้างลูกค้าใหม่ "${o.customerName}"`}`);
        if (!c) created++;
        linked++;
        continue;
      }
      // ทีละคำสั่งซื้อใน transaction (กันสร้างลูกค้าซ้ำเมื่อสองคำสั่งซื้อใช้เบอร์เดียวกัน: รายการถัดไปจะจับคู่ลูกค้าที่เพิ่งสร้าง)
      const r = await prisma.$transaction(async (tx) => {
        const cur = await tx.order.findUnique({ where: { id: o.id }, select: { customerId: true } });
        if (cur?.customerId) return null;
        const before = await tx.customer.count();
        const c = await customerForOrder(tx, o, `สร้างจากคำสั่งซื้อ ${o.orderNo} (ผูกย้อนหลัง)`);
        await tx.order.update({ where: { id: o.id }, data: { customerId: c.id } });
        return { isNew: (await tx.customer.count()) > before };
      });
      if (r) {
        linked++;
        if (r.isNew) created++;
      }
    }
    console.log(`${dry ? "[ทดลอง] " : ""}ผูกคำสั่งซื้อกับลูกค้า ${linked} รายการ (ลูกค้าใหม่ ${created} ราย) จากที่ยังไม่ผูก ${orders.length} รายการ`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
