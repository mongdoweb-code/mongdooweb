# ขึ้นเว็บจริงบน Railway (คู่มือ)

เว็บนี้ต้องการ 3 อย่าง: **เว็บ Next.js** ที่รันค้างไว้ตลอด, **PostgreSQL**, และ **ที่เก็บไฟล์ถาวร** (รูปสินค้า/สไลด์/โลโก้ และสลิปลูกค้า)
ไฟล์ตั้งค่าที่ใช้: `railway.json` (คำสั่ง build/start + health check) และ `scripts/railway-build.sh`

## 1. สร้างบริการใน Railway (ภูมิภาค Singapore)
1. โปรเจกต์ (เช่น "Mongdoweb.com") › **+ New › Database › PostgreSQL**
2. **+ New › GitHub Repo** › เลือก repo นี้ และ branch ที่ใช้ขึ้นจริง
3. ที่เก็บไฟล์ — เลือกอย่างใดอย่างหนึ่ง
   - **Volume (ง่ายที่สุด)**: คลิกบริการเว็บ › **+ Volume** › mount path `/data` แล้วตั้ง `UPLOAD_DIR=/data/uploads`
   - **Bucket (ถ้าจะรันหลายเครื่อง)**: **+ New › Bucket** แล้วตั้ง `STORAGE_DRIVER=s3` และค่า `S3_*` ตามหน้า credentials ของ bucket
4. ตั้ง Region ของทั้งเว็บ ฐานข้อมูล และ volume เป็น **Southeast Asia (Singapore)**

## 2. ตัวแปร (บริการเว็บ › Variables)
| ตัวแปร | ค่า |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (ใช้ตอนรันจริง ผ่าน private network) |
| `DATABASE_PUBLIC_URL` | `${{Postgres.DATABASE_PUBLIC_URL}}` (ใช้ตอน build เท่านั้น) |
| `SITE_URL` | `https://www.mongdooweb.com` (หรือโดเมนชั่วคราว `*.up.railway.app` ช่วงทดสอบ) |
| `UPLOAD_DIR` | `/data/uploads` (เมื่อใช้ Volume) |
| `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` | แอดมินคนแรก — **ตั้งรหัสที่เดายาก** (ใช้ครั้งแรกครั้งเดียว) |
| `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET` | จาก LINE Developers (ดูหลังบ้าน › แจ้งเตือน LINE) |
| `TZ` | `Asia/Bangkok` (ไม่บังคับ — โค้ดคำนวณเวลาไทยเองอยู่แล้ว) |

## 3. Deploy ครั้งแรก
`scripts/railway-build.sh` ทำให้อัตโนมัติ: `prisma migrate deploy` → ใส่ข้อมูลเริ่มต้นถ้าฐานข้อมูลยังว่าง (หมวดหมู่ สไลด์ ตั้งค่าร้าน แอดมิน) → `next build`
แล้ว Railway รัน `npm start` และรอ `/api/health` ตอบ 200 ก่อนสลับเวอร์ชัน

**นำเข้าสินค้า 179 รายการ + รูป (ครั้งเดียว)** — ต้องรันในเครื่องของ Railway เพื่อให้รูปลง volume:
```bash
railway ssh            # เข้าเครื่องของบริการเว็บ
npm run import:woo     # ดาวน์โหลดรูปจากเว็บเดิม ~1,200 รูป (หลายนาที)
```
จากนั้นกด **Restart** บริการเว็บหนึ่งครั้ง เพื่อให้หน้าร้านแสดงสินค้าชุดใหม่ทันที
(ถ้าใช้ Bucket จะรัน `railway run npm run import:woo` จากเครื่องตัวเองก็ได้)

## 4. ผูกโดเมน
บริการเว็บ › Settings › **Custom Domain** › ใส่ `www.mongdooweb.com` แล้วไปตั้ง CNAME ตามที่ Railway บอกที่ผู้ให้บริการโดเมน
- ลิงก์เดิมของ WooCommerce (ภาษาไทย) จะ redirect 301 มาหน้าใหม่ให้เอง — สลับโดเมนวันเดียวกับปิดเว็บเดิม
- ตั้ง `SITE_URL` ให้ตรงโดเมนจริง แล้ว deploy ใหม่

## 5. หลังขึ้นจริง
- **สำรองข้อมูล**: Postgres › Backups เปิดสำรองอัตโนมัติรายวัน · Volume › Backups เปิดด้วย (สลิปและรูปอยู่ที่นี่)
- **LINE**: ใส่ Webhook URL `https://<โดเมน>/api/line/webhook` ตามคู่มือในหลังบ้าน
- **เปลี่ยนรหัสผ่านแอดมิน** ที่ หลังบ้าน › ตั้งค่าร้าน และลบ `SEED_ADMIN_PASSWORD` ออกจาก Variables ได้
- **ทดสอบเงินจริง**: สั่งซื้อ 1 ชิ้น โอนจริง แนบสลิป → ได้แจ้งเตือน LINE → อนุมัติ → ออกใบเสร็จ → พิมพ์ใบปะหน้า

## อัปเดตเว็บ / ย้อนกลับ
- push โค้ดเข้า branch ที่ผูกไว้ → Railway build + deploy ให้เอง (เว็บเดิมยังทำงานจนเวอร์ชันใหม่ผ่าน health check)
- เวอร์ชันใหม่มีปัญหา: Deployments › เลือกเวอร์ชันก่อนหน้า › **Redeploy**
  (การเปลี่ยนโครงสร้างฐานข้อมูลในโปรเจกต์นี้เป็นแบบเพิ่มคอลัมน์/ตาราง จึงย้อนโค้ดได้โดยไม่ต้องย้อนฐานข้อมูล)

## ข้อจำกัดที่ควรรู้
- ตัวนับกันยิงฟอร์มซ้ำ (ค้นหาคำสั่งซื้อ/สั่งซื้อ/แนบสลิป) เก็บในหน่วยความจำ — ใช้เว็บ **1 เครื่อง (1 replica)**
- build ต้องต่อฐานข้อมูลได้ (สร้างหน้าหมวด/สินค้าล่วงหน้า) จึงต้องมี `DATABASE_PUBLIC_URL`
