#!/bin/sh
# Build บน Railway: อัปเดตโครงสร้างฐานข้อมูล → ใส่ข้อมูลเริ่มต้น + นำเข้าสินค้า (ครั้งแรกเท่านั้น) → build Next.js
# ตอน build ยังเข้า private network ของ Railway ไม่ได้ จึงใช้ DATABASE_PUBLIC_URL แทนชั่วคราว
# (build ต้องต่อฐานข้อมูลได้ เพราะสร้างหน้าหมวด/สินค้าล่วงหน้าจากข้อมูลจริง)
set -e
if [ -n "$DATABASE_PUBLIC_URL" ]; then
  export DATABASE_URL="$DATABASE_PUBLIC_URL"
elif [ -n "$RAILWAY_ENVIRONMENT" ]; then
  echo "ไม่มี DATABASE_PUBLIC_URL — เปิด TCP Proxy ของ Postgres (Settings › Networking) แล้วตั้ง DATABASE_PUBLIC_URL=\${{Postgres.DATABASE_PUBLIC_URL}}" >&2
  exit 1
fi
npx prisma migrate deploy
npx tsx scripts/seed-if-empty.ts
npx tsx scripts/fill-shop-info.ts
npx tsx scripts/import-if-empty.ts
# รูป/ลิงก์ในคำอธิบายสินค้าที่ยังชี้ไปเว็บเดิม → ย้ายมาเก็บเอง (ทำครั้งเดียว ครั้งต่อไปไม่มีอะไรต้องทำ) · ห้ามทำให้ build ล้ม
npx tsx scripts/migrate-description-images.ts --build || echo "ข้ามการย้ายรูปคำอธิบายสินค้า (ดู log ด้านบน)"
npx next build
