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
npm run dev                   # เปิด http://localhost:3000 (หลังบ้าน /admin/login)
```

ตรวจโค้ดก่อน commit: `npm run typecheck && npm run lint && npm run build`
(`build` ต้องต่อฐานข้อมูลได้ เพราะสร้างหน้าหมวด/สินค้าล่วงหน้าจากข้อมูลจริง)

## โครงสร้าง
| Path | คืออะไร |
|---|---|
| `src/app/(shop)/` | หน้าร้าน: หน้าแรก, `/products`, `/category/[slug]`, `/product/[slug]`, `/search`, `/track`, `/privacy`, `/warranty` |
| `src/app/(shop)/_markup/`, `shop.css` | HTML/CSS ที่ย้ายมาจากต้นแบบหน้าแรก |
| `public/js/shell.js`, `public/js/home.js` | JavaScript จากต้นแบบ (ส่วนหัว/ตะกร้า/ท้ายเว็บ และส่วนของหน้าแรก) |
| `src/lib/storefront.ts` | ดึงข้อมูลหน้าร้านจากฐานข้อมูล (แคชไว้ ล้างด้วย tag `storefront`) |
| `src/app/(checkout)/checkout/` | หน้าชำระเงิน (ย้ายจากต้นแบบ, JS ที่ `public/js/checkout.js`) |
| `src/app/api/orders/` | API สร้างคำสั่งซื้อ และแนบสลิป |
| `src/app/admin/` | หลังบ้าน: `/admin/login`, `/admin` (คำสั่งซื้อ/ตรวจสลิป), `/admin/orders.csv`, `/admin/slips/:id` |
| `src/lib/orders.ts`, `admin-orders.ts`, `auth.ts`, `storage.ts` | ตรรกะคำสั่งซื้อ, ข้อมูลหลังบ้าน, ล็อกอิน/session, ที่เก็บไฟล์ |
| `src/lib/prisma.ts` | ตัวเชื่อมฐานข้อมูล |
| `prisma/schema.prisma` | โครงสร้างฐานข้อมูล 17 ตาราง |
| `prisma/seed.ts` | ข้อมูลเริ่มต้น (รันซ้ำได้) |
| `prototype/` | ต้นแบบ HTML 3 หน้าที่อนุมัติแล้ว (เปิดด้วยเบราว์เซอร์ได้เลย) |
| `docs/` | รายการข้อกำหนด, สัญญาข้อมูล, สเปกเอกสารขาย |
| `tests/` | ชุดทดสอบต้นแบบ (Python Playwright) |

## สถานะ
- [x] ขั้นที่ 1: ตั้งโปรเจกต์ Next.js + Prisma 7, migrate, seed
- [x] ขั้นที่ 2: หน้าร้าน (ย้ายจากต้นแบบ) + หน้าสินค้า หมวดหมู่ ค้นหา ติดตามคำสั่งซื้อ นโยบาย/รับประกัน (ฉบับร่าง)
- [x] ขั้นที่ 3: หน้าชำระเงิน + API คำสั่งซื้อ + อัปโหลดสลิป + หลังบ้าน (ล็อกอิน, ตรวจสลิป, อนุมัติ/ปฏิเสธ/จัดส่ง, CSV)
- [ ] ขั้นที่ 4: หลังบ้าน (สไลด์ หมวดหมู่ ตั้งค่า บันทึกการใช้งาน เอกสารขาย)
- [ ] ขั้นที่ 5: นำเข้าจาก WooCommerce + redirect 301
- [ ] ขั้นที่ 6: แจ้งเตือน LINE, deploy, ทดสอบจริง

## หมายเหตุการใช้งานจริง
- สลิปเก็บในโฟลเดอร์ `UPLOAD_DIR` (ค่าเริ่มต้น `uploads/`) บนเซิร์ฟเวอร์ — **ต้องสำรองโฟลเดอร์นี้พร้อมฐานข้อมูล**
- รหัสผ่านแอดมินคนแรกมาจาก `SEED_ADMIN_PASSWORD` ตอนรัน seed — ตั้งรหัสที่เดายากก่อนขึ้นจริง
- ตัวนับจำกัดจำนวนครั้งของฟอร์มสาธารณะ (ค้นหาคำสั่งซื้อ/สั่งซื้อ/แนบสลิป) อยู่ในหน่วยความจำ ใช้ได้กับเซิร์ฟเวอร์เครื่องเดียว
