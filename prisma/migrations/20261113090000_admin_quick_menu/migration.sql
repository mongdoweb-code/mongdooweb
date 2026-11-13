-- แถบเมนูด่วนด้านบนหลังบ้าน: เมนูที่ผู้ใช้แต่ละคนเลือก (["qt-new", …]) · NULL = ค่าเริ่มต้น (src/lib/quick-menu.ts)
ALTER TABLE "Admin" ADD COLUMN "quickMenu" JSONB;
