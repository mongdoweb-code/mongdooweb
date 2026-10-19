# มองดูเว็บ (MongdoWeb)

ร้านขายไฟ LED (ใต้น้ำ สระว่ายน้ำ น้ำพุ สวน อาคาร) — สร้างใหม่ด้วย Next.js + Prisma 7 + PostgreSQL
แทนเว็บ WordPress/WooCommerce เดิม บริบทโปรเจกต์ทั้งหมดอยู่ใน [`CLAUDE.md`](CLAUDE.md)

## เริ่มใช้งานบนเครื่อง
ต้องมี Node.js 22+ และ PostgreSQL 16+

```bash
cp .env.example .env          # แก้ DATABASE_URL และ SEED_ADMIN_PASSWORD
npm install                   # ติดตั้งแพ็กเกจ + generate Prisma client
npm run db:migrate            # สร้างตารางในฐานข้อมูล
npm run db:seed               # ใส่หมวดหมู่ สไลด์ สินค้าตัวอย่าง ตั้งค่าร้าน และแอดมินคนแรก
npm run dev                   # เปิด http://localhost:3000
```

ตรวจโค้ดก่อน commit: `npm run typecheck && npm run lint && npm run build`

## โครงสร้าง
| Path | คืออะไร |
|---|---|
| `src/app/` | หน้าเว็บ (Next.js App Router) |
| `src/lib/prisma.ts` | ตัวเชื่อมฐานข้อมูล |
| `prisma/schema.prisma` | โครงสร้างฐานข้อมูล 17 ตาราง |
| `prisma/seed.ts` | ข้อมูลเริ่มต้น (รันซ้ำได้) |
| `prototype/` | ต้นแบบ HTML 3 หน้าที่อนุมัติแล้ว (เปิดด้วยเบราว์เซอร์ได้เลย) |
| `docs/` | รายการข้อกำหนด, สัญญาข้อมูล, สเปกเอกสารขาย |
| `tests/` | ชุดทดสอบต้นแบบ (Python Playwright) |

## สถานะ
- [x] ขั้นที่ 1: ตั้งโปรเจกต์ Next.js + Prisma 7, migrate, seed
- [ ] ขั้นที่ 2: หน้าร้าน (ย้ายจากต้นแบบ) + หน้าสินค้า หมวดหมู่ ติดตามคำสั่งซื้อ
- [ ] ขั้นที่ 3: API คำสั่งซื้อ + อัปโหลดสลิป + ตรวจสลิปในหลังบ้าน
- [ ] ขั้นที่ 4: หลังบ้าน (สไลด์ หมวดหมู่ ตั้งค่า บันทึกการใช้งาน เอกสารขาย)
- [ ] ขั้นที่ 5: นำเข้าจาก WooCommerce + redirect 301
- [ ] ขั้นที่ 6: แจ้งเตือน LINE, deploy, ทดสอบจริง
