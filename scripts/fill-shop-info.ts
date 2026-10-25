// เติมข้อมูลรับเงิน (พร้อมเพย์ + ชื่อบัญชี) และค่าจำลอง COD/พื้นที่ห่างไกล ให้ฐานข้อมูลที่มีอยู่แล้ว
// เติมเฉพาะช่องที่ยังว่าง/เป็นค่าเริ่มต้น — ไม่ทับค่าที่แอดมินแก้ไว้ในหลังบ้าน · รันซ้ำได้
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { SHOP_MOCK_SHIPPING, SHOP_PAYMENT } from "./shop-info";

type Bank = { bank: string; account: string; holder?: string };

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const s = await prisma.shopSetting.findUnique({ where: { id: "shop" } });
    if (!s) return console.log("ยังไม่มีตั้งค่าร้าน — ข้าม");
    const data: Record<string, unknown> = {};
    if (!s.promptpayId) data.promptpayId = SHOP_PAYMENT.promptpayId;
    if (!s.promptpayId && (!s.promptpayName || s.promptpayName === "มองดูเว็บ")) data.promptpayName = SHOP_PAYMENT.promptpayName;
    const banks = Array.isArray(s.bankAccounts) ? (s.bankAccounts as Bank[]) : [];
    let changed = false;
    const filled = banks.map((b) => {
      const known = SHOP_PAYMENT.bankAccounts.find((k) => k.bank === b.bank && k.account === b.account);
      if (known && !b.holder?.trim()) {
        changed = true;
        return { ...b, holder: known.holder };
      }
      return b;
    });
    if (!banks.length) data.bankAccounts = SHOP_PAYMENT.bankAccounts;
    else if (changed) data.bankAccounts = filled;
    if (!s.codFeeSatang && !s.codEnabled) Object.assign(data, { codFeeSatang: SHOP_MOCK_SHIPPING.codFeeSatang, codMaxSatang: SHOP_MOCK_SHIPPING.codMaxSatang });
    if (!s.remoteFeeSatang && !s.remoteZips.length) Object.assign(data, { remoteFeeSatang: SHOP_MOCK_SHIPPING.remoteFeeSatang, remoteZips: SHOP_MOCK_SHIPPING.remoteZips });
    if (!Object.keys(data).length) return console.log("ข้อมูลรับเงิน/ค่าส่งครบแล้ว — ไม่มีอะไรต้องเติม");
    await prisma.shopSetting.update({ where: { id: "shop" }, data });
    console.log("เติมข้อมูลร้าน:", Object.keys(data).join(", "));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
