// บันทึกหน้า 404 (A14) — path จริงมาจาก header x-mdw-path ที่ src/proxy.ts ใส่ให้ (ลูกค้าปลอมค่าเองไม่ได้ เพราะ proxy เขียนทับ)
// อยู่ใน <Suspense> ของหน้า "ไม่พบหน้า" จึงไม่ทำให้ส่วนอื่นของหน้าต้องรอ · บันทึกหลังส่งหน้าแล้ว (after)
import { headers } from "next/headers";
import { after } from "next/server";
import { logNotFound } from "@/lib/redirects";

export async function NotFoundLog() {
  const h = await headers();
  const raw = h.get("x-mdw-path");
  if (!raw) return null;
  let path = raw;
  try {
    path = decodeURIComponent(raw);
  } catch {}
  const referer = h.get("referer");
  after(() => logNotFound(path, referer));
  return null;
}
