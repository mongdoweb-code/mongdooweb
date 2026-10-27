"use server";
// คิวคำขอ PDPA (A24) — เจ้าของร้านเท่านั้น: ลบ/ทำให้ไม่ระบุตัวตน, ปิดคำขอพร้อมผลที่แจ้งผู้ขอ · บันทึก AdminLog ทุกครั้ง
import { redirect } from "next/navigation";
import { logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireOwner } from "@/lib/auth";
import { erasePerson, optOutMarketing } from "@/lib/pdpa";
import { prisma } from "@/lib/prisma";

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);

export async function eraseAction(f: FormData) {
  const admin = await requireOwner();
  const id = str(f, "id", 40);
  const r = await prisma.dataRequest.findUnique({ where: { id } });
  if (!r) redirect("/admin/data-requests");
  const res = await erasePerson(r.phone, r.email);
  const text = Object.entries(res).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ") || "ไม่พบข้อมูล";
  await prisma.dataRequest.update({ where: { id }, data: { result: [r.result, `ลบ/ทำให้ไม่ระบุตัวตนแล้ว (${new Date().toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" })}): ${text}`].filter(Boolean).join("\n"), handledBy: admin.displayName, handledAt: new Date() } });
  await logAdmin(admin.id, "PDPA", `ลบข้อมูลส่วนบุคคลตามคำขอของ ${r.name}: ${text}`, { entity: `DataRequest:${id}` });
  refreshStorefront(); // รีวิวที่ถูกลบหายจากหน้าสินค้า
  redirect(`/admin/data-requests/${id}?erased=1`);
}

/** คำขอคัดค้าน (OBJECT): ตั้ง "ไม่รับข่าวสาร/การตลาด" ให้ลูกค้าที่เบอร์/อีเมลตรงกับผู้ขอ (D8) */
export async function objectMarketingAction(f: FormData) {
  const admin = await requireOwner();
  const id = str(f, "id", 40);
  const r = await prisma.dataRequest.findUnique({ where: { id } });
  if (!r || r.kind !== "OBJECT") redirect(`/admin/data-requests${r ? `/${id}` : ""}`);
  const n = await optOutMarketing(r.phone, r.email);
  const text = n ? `ตั้งไม่รับข่าวสาร/การตลาดให้ลูกค้า ${n} ราย` : "ไม่พบลูกค้าในรายชื่อ — บันทึกเบอร์/อีเมลนี้ไว้ไม่ให้อยู่ในไฟล์บรอดแคสต์";
  const day = new Date().toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" });
  await prisma.dataRequest.update({ where: { id }, data: { result: [r.result, `บันทึกการคัดค้านการตลาดแล้ว (${day}): ${text}`].filter(Boolean).join("\n"), handledBy: admin.displayName, handledAt: new Date() } });
  await logAdmin(admin.id, "PDPA", `บันทึกการคัดค้านการตลาดตามคำขอของ ${r.name}: ${text}`, { entity: `DataRequest:${id}` });
  redirect(`/admin/data-requests/${id}?optout=${n}`);
}

export async function resolveAction(f: FormData) {
  const admin = await requireOwner();
  const id = str(f, "id", 40);
  const status = f.get("status") === "REJECTED" ? "REJECTED" : "DONE";
  const result = str(f, "result", 3000);
  if (result.length < 3) redirect(`/admin/data-requests/${id}?err=result`);
  const r = await prisma.dataRequest.update({ where: { id }, data: { status, result, handledBy: admin.displayName, handledAt: new Date() } });
  await logAdmin(admin.id, "PDPA", `${status === "DONE" ? "ปิดคำขอ (ดำเนินการแล้ว)" : "ปฏิเสธคำขอ"} ของ ${r.name}: ${result.slice(0, 200)}`, { entity: `DataRequest:${id}`, diff: { status: ["NEW", status] } });
  redirect(`/admin/data-requests/${id}?saved=1`);
}

export async function reopenAction(f: FormData) {
  const admin = await requireOwner();
  const id = str(f, "id", 40);
  await prisma.dataRequest.update({ where: { id }, data: { status: "NEW" } });
  await logAdmin(admin.id, "PDPA", "เปิดคำขอ PDPA อีกครั้ง", { entity: `DataRequest:${id}` });
  redirect(`/admin/data-requests/${id}`);
}
