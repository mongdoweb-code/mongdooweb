#!/bin/sh
# Build บน Railway: อัปเดตโครงสร้างฐานข้อมูล → ใส่ข้อมูลเริ่มต้น (ครั้งแรกเท่านั้น) → build Next.js
# ตอน build ยังเข้า private network ของ Railway ไม่ได้ จึงใช้ DATABASE_PUBLIC_URL แทนชั่วคราว
# (build ต้องต่อฐานข้อมูลได้ เพราะสร้างหน้าหมวด/สินค้าล่วงหน้าจากข้อมูลจริง)
set -e
if [ -n "$DATABASE_PUBLIC_URL" ]; then
  export DATABASE_URL="$DATABASE_PUBLIC_URL"
fi
npx prisma migrate deploy
npx tsx scripts/seed-if-empty.ts
npx next build
