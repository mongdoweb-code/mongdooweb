// ใส่ข้อมูลเริ่มต้นเฉพาะฐานข้อมูลใหม่ (ยังไม่มีตั้งค่าร้าน) — ใช้ตอน deploy ครั้งแรก
// ถ้ามีข้อมูลแล้วจะไม่ทำอะไร เพราะ seed จะเขียนทับหมวดหมู่/สินค้าตัวอย่างที่แอดมินแก้ไว้
import "dotenv/config";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const has = await prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { id: true } });
  await prisma.$disconnect();
  if (has) return console.log("ฐานข้อมูลมีข้อมูลแล้ว — ข้าม seed");
  console.log("ฐานข้อมูลใหม่ — ใส่ข้อมูลเริ่มต้น (หมวดหมู่ สไลด์ ตั้งค่าร้าน แอดมินคนแรก)");
  execSync("npx prisma db seed", { stdio: "inherit" });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
