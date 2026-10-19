// prisma.config.ts — ตั้งค่า Prisma 7 (PrismaClient ของแอปอยู่ที่ src/lib/prisma.ts)
// Prisma 7 ไม่โหลด .env ให้อัตโนมัติ จึงต้อง import "dotenv/config" เอง
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});

