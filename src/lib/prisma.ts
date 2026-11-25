// PrismaClient ตัวเดียวทั้งแอป (Prisma 7 ต่อฐานข้อมูลผ่าน @prisma/adapter-pg)
import "server-only";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // ตอน next build (หลาย worker พร้อมกัน) ใช้ connection น้อยต่อ worker — ตอนเว็บทำงานใช้ค่าปกติของ pg (10)
    adapter: new PrismaPg(
      process.env.NEXT_PHASE === "phase-production-build"
        ? { connectionString: process.env.DATABASE_URL!, max: 3, connectionTimeoutMillis: 30_000 }
        : { connectionString: process.env.DATABASE_URL! },
    ),
  });

// กัน dev server สร้าง connection ใหม่ทุกครั้งที่ hot reload
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
