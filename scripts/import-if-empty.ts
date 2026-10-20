// นำเข้าสินค้าจาก WooCommerce เฉพาะครั้งแรก (ยังไม่มีสินค้าที่มี wooId) — ใช้ตอน build บน Railway
// ต้องใช้ STORAGE_DRIVER=s3 (ตอน build เขียนลง volume ไม่ได้) · ปิดได้ด้วย IMPORT_WOO_ON_BUILD=0
import "dotenv/config";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

async function main() {
  if (process.env.IMPORT_WOO_ON_BUILD === "0") return console.log("IMPORT_WOO_ON_BUILD=0 — ข้ามการนำเข้าสินค้า");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const n = await prisma.product.count({ where: { wooId: { not: null } } });
  await prisma.$disconnect();
  if (n) return console.log(`มีสินค้าจาก WooCommerce แล้ว ${n} รายการ — ข้ามการนำเข้า`);
  if ((process.env.STORAGE_DRIVER ?? "local") !== "s3") return console.log("STORAGE_DRIVER ไม่ใช่ s3 — ข้าม (รัน npm run import:woo ในเครื่องเซิร์ฟเวอร์แทน)");
  console.log("ฐานข้อมูลยังไม่มีสินค้าจริง — นำเข้า 179 รายการพร้อมรูปจาก data/woocommerce");
  execSync("npx tsx scripts/import-woocommerce.ts", { stdio: "inherit" });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
