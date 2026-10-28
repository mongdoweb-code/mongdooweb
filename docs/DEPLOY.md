# ขึ้นเว็บจริงบน Railway (คู่มือ)

เว็บนี้ต้องการ 3 อย่าง: **เว็บ Next.js** ที่รันค้างไว้ตลอด, **PostgreSQL**, และ **ที่เก็บไฟล์ถาวร** (รูปสินค้า/สไลด์/โลโก้ และสลิปลูกค้า)
ไฟล์ตั้งค่าที่ใช้: `railway.json` (คำสั่ง build/start + health check) และ `scripts/railway-build.sh`

## 1. สร้างบริการใน Railway (ภูมิภาค Singapore)
1. โปรเจกต์ (เช่น "Mongdoweb.com") › **+ New › Database › PostgreSQL**
2. **+ New › GitHub Repo** › เลือก repo นี้ และ branch ที่ใช้ขึ้นจริง
3. ที่เก็บไฟล์ — **ที่ใช้จริงตอนนี้: Railway Bucket** `mdw-files` (ภูมิภาค sin) ตั้ง `STORAGE_DRIVER=s3` และ
   `S3_ENDPOINT=${{mdw-files.ENDPOINT}}`, `S3_BUCKET=${{mdw-files.BUCKET}}`, `S3_REGION=${{mdw-files.REGION}}`,
   `S3_ACCESS_KEY_ID=${{mdw-files.ACCESS_KEY_ID}}`, `S3_SECRET_ACCESS_KEY=${{mdw-files.SECRET_ACCESS_KEY}}`, `S3_FORCE_PATH_STYLE=false`
   (ข้อดี: นำเข้าสินค้าตอน build ได้, รันหลายเครื่องได้) · ทางเลือก: Volume ที่ `/data` + `UPLOAD_DIR=/data/uploads` แต่ต้องนำเข้าสินค้าเองด้วย `railway ssh`
4. ตั้ง Region ของทั้งเว็บ ฐานข้อมูล และ volume เป็น **Southeast Asia (Singapore)**

## 2. ตัวแปร (บริการเว็บ › Variables)
| ตัวแปร | ค่า |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (ใช้ตอนรันจริง ผ่าน private network) |
| `DATABASE_PUBLIC_URL` | `${{Postgres.DATABASE_PUBLIC_URL}}` (ใช้ตอน build เท่านั้น — ต้องเปิด **TCP Proxy** ของ Postgres ที่ Settings › Networking ก่อน ไม่งั้นค่านี้ว่าง) |
| `SITE_URL` | `https://www.mongdooweb.com` (หรือโดเมนชั่วคราว `*.up.railway.app` ช่วงทดสอบ) |
| `UPLOAD_DIR` | `/data/uploads` (เมื่อใช้ Volume) |
| `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` | แอดมินคนแรก — **ตั้งรหัสที่เดายาก** (ใช้ครั้งแรกครั้งเดียว) |
| `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET` | จาก LINE Developers (ดูหลังบ้าน › แจ้งเตือน LINE) |
| `TZ` | `Asia/Bangkok` (ไม่บังคับ — โค้ดคำนวณเวลาไทยเองอยู่แล้ว) |

## 3. Deploy ครั้งแรก
`scripts/railway-build.sh` ทำให้อัตโนมัติ: `prisma migrate deploy` → ใส่ข้อมูลเริ่มต้นถ้าฐานข้อมูลยังว่าง (หมวดหมู่ สไลด์ ตั้งค่าร้าน แอดมิน) → `next build`
แล้ว Railway รัน `npm start` และรอ `/api/health` ตอบ 200 ก่อนสลับเวอร์ชัน

**นำเข้าสินค้า 179 รายการ + รูป** — เมื่อใช้ Bucket ระบบนำเข้าให้เองตอน build ครั้งแรก (`scripts/import-if-empty.ts`,
ทำเฉพาะเมื่อยังไม่มีสินค้าจาก WooCommerce · ปิดได้ด้วย `IMPORT_WOO_ON_BUILD=0`) — build ครั้งแรกจึงนานกว่าปกติหลายนาที
ถ้าใช้ Volume ให้รัน `railway ssh` แล้ว `npm run import:woo` แล้วกด Restart

## 4. ผูกโดเมน
บริการเว็บ › Settings › **Custom Domain** › ใส่ `www.mongdooweb.com` แล้วไปตั้ง CNAME ตามที่ Railway บอกที่ผู้ให้บริการโดเมน
- ลิงก์เดิมของ WooCommerce (ภาษาไทย) จะ redirect 301 มาหน้าใหม่ให้เอง — สลับโดเมนวันเดียวกับปิดเว็บเดิม
- ตั้ง `SITE_URL` ให้ตรงโดเมนจริง แล้ว deploy ใหม่

## 5. หลังขึ้นจริง
- **สำรองข้อมูล**: ระบบสำรองทุกตารางเป็น ZIP ไปที่ Bucket (`backups/YYYY-MM-DD.zip`) ทุกวันพร้อมงานประจำวัน (ต้องตั้ง Cron ด้านล่าง) เก็บย้อนหลัง 14 วัน — ดู/ดาวน์โหลด/สำรองทันทีที่ หลังบ้าน › สำรองข้อมูล · เปิด Postgres › Backups ของ Railway เพิ่มอีกชั้นได้ · สลิปและรูปอยู่ใน Bucket `mdw-files`
- **LINE**: ใส่ Webhook URL `https://<โดเมน>/api/line/webhook` ตามคู่มือในหลังบ้าน
- **เปลี่ยนรหัสผ่านแอดมิน** ที่ หลังบ้าน › ตั้งค่าร้าน และลบ `SEED_ADMIN_PASSWORD` ออกจาก Variables ได้
- **ทดสอบเงินจริง**: สั่งซื้อ 1 ชิ้น โอนจริง แนบสลิป → ได้แจ้งเตือน LINE → อนุมัติ → ออกใบเสร็จ → พิมพ์ใบปะหน้า

## อัปเดตเว็บ / ย้อนกลับ
- push โค้ดเข้า branch ที่ผูกไว้ → Railway build + deploy ให้เอง (เว็บเดิมยังทำงานจนเวอร์ชันใหม่ผ่าน health check)
- เวอร์ชันใหม่มีปัญหา: Deployments › เลือกเวอร์ชันก่อนหน้า › **Redeploy**
  (การเปลี่ยนโครงสร้างฐานข้อมูลในโปรเจกต์นี้เป็นแบบเพิ่มคอลัมน์/ตาราง จึงย้อนโค้ดได้โดยไม่ต้องย้อนฐานข้อมูล)

## งานประจำวัน (Cron) — `/api/cron/daily`
ทำวันละครั้ง **07:00 เวลาไทย**: ยกเลิกคำสั่งซื้อที่ไม่แนบสลิปเกิน N วัน (หลังบ้าน › ตั้งค่า "ยกเลิกออเดอร์ค้าง", 0 = ปิด),
แจ้ง LINE สินค้าใกล้หมดที่ลดถึงเกณฑ์จากการปรับ/นำเข้า, ส่งสรุปประจำวันทาง LINE (ถ้าเปิด "สรุปรายวัน LINE") และ **สำรองข้อมูลรายวัน** (ผลอยู่ในคีย์ `backup` ของ JSON)
1. ตั้งตัวแปร `CRON_SECRET` ในบริการเว็บ เป็นข้อความสุ่มยาว ๆ (เช่น `openssl rand -hex 32`) — ไม่ตั้ง = งานนี้ปิดอยู่ (ตอบ 503)
2. เลือกวิธีเรียกอย่างใดอย่างหนึ่ง
   - **Railway Cron service** (แนะนำ): New › Empty Service › Settings › Cron Schedule `0 0 * * *` (= 07:00 ไทย เพราะ Railway ใช้เวลา UTC)
     Start Command: `curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<โดเมน>/api/cron/daily`
     และใส่ตัวแปร `CRON_SECRET=${{mongdoweb-next.CRON_SECRET}}` ในบริการนี้
   - **บริการ ping ภายนอก (ฟรี — ร้านเลือกใช้วิธีนี้)** cron-job.org:
     1. สมัครที่ https://console.cron-job.org/signup แล้วยืนยันอีเมล
     2. Create cronjob › Title `มองดูเว็บ งานประจำวัน`
     3. URL: `https://<โดเมน>/api/cron/daily?key=<CRON_SECRET>` (ใช้โดเมนจริง เช่น `https://mongdoweb-next-production.up.railway.app` จนกว่าจะย้าย DNS เป็น `https://www.mongdooweb.com`)
     4. Execution schedule › Every day at **07:00** · Time zone **Asia/Bangkok**
     5. Advanced › Request timeout 30 วินาที · เปิด "Notify me when the cronjob fails" (แจ้งอีเมลเมื่อเรียกไม่สำเร็จ)
     6. Save แล้วกด "Run now" หนึ่งครั้ง → History ต้องได้ 200 และหลังบ้าน › บันทึกการใช้งาน มีรายการ "งานประจำวัน"
     - ห้ามแชร์ URL นี้ (มีรหัสลับ) · ถ้าหลุด: เปลี่ยน `CRON_SECRET` ใน Railway แล้วแก้ URL ใน cron-job.org
3. ทดสอบ: เปิด URL ข้างบนในเบราว์เซอร์ → ได้ JSON `{"ok":true,...}` (ไม่มี key = 401)
- เรียกซ้ำในวันเดียวกันได้ ไม่ยกเลิกซ้ำ และ LINE ส่งวันละครั้ง (`"summary":"already-sent-today"`) · ทุกครั้งบันทึกใน หลังบ้าน › บันทึกการใช้งาน

## ข้อจำกัดที่ควรรู้
- ตัวนับกันยิงฟอร์มซ้ำ (ค้นหาคำสั่งซื้อ/สั่งซื้อ/แนบสลิป) เก็บในหน่วยความจำ — ใช้เว็บ **1 เครื่อง (1 replica)**
- build ต้องต่อฐานข้อมูลได้ (สร้างหน้าหมวด/สินค้าล่วงหน้า) จึงต้องมี `DATABASE_PUBLIC_URL`

## กู้คืนข้อมูลจากไฟล์สำรอง (ทำเองตามขั้นตอน — ไม่มีปุ่มกู้คืนในหลังบ้าน)
ไฟล์สำรองรายวัน = `backups/YYYY-MM-DD.zip` ใน Bucket (ดาวน์โหลดได้ที่ หลังบ้าน › สำรองข้อมูล) ภายในมี `manifest.json`, `README.txt` และ `tables/<ตาราง>.json` ทุกตาราง
ไม่รวม: ไฟล์รูป/สลิป (อยู่ใน Bucket อยู่แล้ว), session หลังบ้าน, secret ยืนยันตัวตน 2 ขั้น (ผู้ใช้ตั้งใหม่หลังกู้คืน — รหัสผ่านยังใช้ได้)

**ห้ามกู้ทับฐานข้อมูลที่ใช้งานจริงโดยตรง** — กู้ลงฐานข้อมูลใหม่ ตรวจ แล้วค่อยสลับ
1. Railway › **+ New › Database › PostgreSQL** (ชื่อเช่น `Postgres-restore`) เปิด TCP Proxy แล้วคัดลอก `DATABASE_PUBLIC_URL`
2. บนเครื่องที่มีโค้ดเวอร์ชันเดียวกับที่ใช้งานอยู่ (หรือใหม่กว่า):
   ```bash
   export DATABASE_URL="<DATABASE_PUBLIC_URL ของฐานข้อมูลใหม่>"
   npx prisma migrate deploy                                   # สร้างตารางเปล่า (ห้าม seed)
   npx tsx scripts/restore-backup.ts mongdoweb-2026-10-22.zip --dry-run   # ตรวจไฟล์ + จำนวนแถว
   npx tsx scripts/restore-backup.ts mongdoweb-2026-10-22.zip             # กู้คืนจริง (transaction เดียว ผิดพลาด = ไม่เปลี่ยนอะไร)
   ```
   ถ้าฐานข้อมูลใหม่ถูก seed ไปแล้ว (มีข้อมูลตั้งต้น) เพิ่ม `--wipe` เพื่อล้างทุกตารางของ**ฐานข้อมูลใหม่นั้น**ก่อน
   ถ้าขึ้นว่าโค้ดเก่ากว่าไฟล์สำรอง ให้ใช้โค้ดเวอร์ชันล่าสุดแล้ว migrate ใหม่
3. ทดสอบ: ชี้ `.env` ไปฐานข้อมูลใหม่ `npm run build && npm start` แล้วเปิดหน้าร้าน/หลังบ้าน ตรวจคำสั่งซื้อ เอกสาร และสต็อกล่าสุด
4. สลับใช้งาน: บริการเว็บ › Variables เปลี่ยน `DATABASE_URL` / `DATABASE_PUBLIC_URL` ให้อ้าง `${{Postgres-restore.…}}` แล้ว Redeploy
5. ผู้ใช้ที่เคยเปิดยืนยันตัวตน 2 ขั้น: เข้าระบบด้วยรหัสผ่านแล้วตั้ง 2FA ใหม่ที่ บัญชีของฉัน · เก็บฐานข้อมูลเดิมไว้จนแน่ใจแล้วจึงลบ
