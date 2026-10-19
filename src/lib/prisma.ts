// PrismaClient ตัวเดียวทั้งแอป (Prisma 7 ต่อฐานข้อมูลผ่าน @prisma/adapter-pg)
import "server-only";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

// กัน dev server สร้าง connection ใหม่ทุกครั้งที่ hot reload
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
