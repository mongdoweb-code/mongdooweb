"use server";
// ลูกค้า (สำหรับเอกสารขาย): เพิ่ม/แก้ไข/ลบ — ตรวจ checksum เลขผู้เสียภาษี, เบอร์โทรเก็บเป็นตัวเลขล้วน
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { logAdmin } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/auth";
import type { CustSnap } from "@/lib/doc-render";
import { custSnapshot, nextCustomerCode } from "@/lib/docs";
import { isValidThaiTaxId, phoneDigits } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export type CustomerState = { error?: string; fields?: string[]; ok?: string; created?: { id: string; snap: CustSnap } };
const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);

export async function saveCustomer(_prev: CustomerState, f: FormData): Promise<CustomerState> {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const inline = f.get("inline") === "1";
  const bad: string[] = [];
  const kind = f.get("kind") === "COMPANY" ? ("COMPANY" as const) : ("PERSON" as const);
  const name = str(f, "name", 200);
  if (name.length < 2) bad.push("name");
  const taxId = phoneDigits(str(f, "taxId", 20));
  if (taxId && !isValidThaiTaxId(taxId)) bad.push("taxId");
  const branchType = str(f, "branchType", 10);
  const branchNo = phoneDigits(str(f, "branchNo", 5));
  if (kind === "COMPANY" && branchType === "branch" && !/^\d{1,5}$/.test(branchNo)) bad.push("branchNo");
  const phone = phoneDigits(str(f, "phone", 20));
  if (phone && !/^0\d{8,9}$/.test(phone)) bad.push("phone");
  const email = str(f, "email", 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad.push("email");
  const zip = str(f, "postalCode", 5);
  if (zip && !/^\d{5}$/.test(zip)) bad.push("postalCode");
  const shipName = str(f, "shipName", 200), shipPhone = phoneDigits(str(f, "shipPhone", 20)), shipZip = str(f, "shipZip", 5);
  if (shipName && shipZip && !/^\d{5}$/.test(shipZip)) bad.push("shipZip");
  if (bad.length) {
    const m: Record<string, string> = { name: "กรุณากรอกชื่อลูกค้า", taxId: "เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง (13 หลัก ตรวจหลักสุดท้ายไม่ผ่าน)", branchNo: "กรุณาใส่เลขสาขา 5 หลัก", phone: "เบอร์โทรไม่ถูกต้อง", email: "อีเมลไม่ถูกต้อง", postalCode: "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก", shipZip: "รหัสไปรษณีย์ที่อยู่จัดส่งไม่ถูกต้อง" };
    return { error: bad.map((b) => m[b]).join(" · "), fields: bad };
  }
  const branch = kind === "COMPANY" ? (branchType === "branch" ? `สาขาที่ ${branchNo.padStart(5, "0")}` : "สำนักงานใหญ่") : null;
  const data = {
    kind, name, taxId: taxId || null, branch, contactName: str(f, "contactName", 120) || null, phone: phone || null, email: email || null,
    addressLine: str(f, "addressLine", 300) || null, subdistrict: str(f, "subdistrict", 80) || null, district: str(f, "district", 80) || null,
    province: str(f, "province", 80) || null, postalCode: zip || null, note: str(f, "note", 1000) || null,
    shipTo: shipName ? { name: shipName, phone: shipPhone, address: { line: str(f, "shipLine", 300), sub: str(f, "shipSub", 80), dist: str(f, "shipDist", 80), prov: str(f, "shipProv", 80), zip: shipZip } } : {},
  };
  let saved;
  if (id) {
    saved = await prisma.customer.update({ where: { id }, data });
  } else {
    // กันรหัสชนกันเมื่อเพิ่มพร้อมกัน: ลองใหม่สูงสุด 5 ครั้ง
    for (let i = 0; ; i++) {
      try {
        saved = await prisma.customer.create({ data: { ...data, code: await nextCustomerCode() } });
        break;
      } catch (e) {
        if (i >= 4 || !(e instanceof Error) || !/Unique constraint/i.test(e.message)) throw e;
      }
    }
  }
  await logAdmin(admin.id, "CUSTOMER", `${id ? "แก้ไข" : "เพิ่ม"}ลูกค้า ${saved.code} ${saved.name}`);
  if (inline) return { ok: `เพิ่มลูกค้า ${saved.code} แล้ว`, created: { id: saved.id, snap: custSnapshot(saved) } };
  if (!id) redirect(`/admin/customers/${saved.id}?saved=1`);
  refresh();
  return { ok: "บันทึกข้อมูลลูกค้าแล้ว — เอกสารที่ออกไปแล้วยังใช้ข้อมูล ณ วันที่ออก" };
}

export async function deleteCustomer(f: FormData) {
  const admin = await requireAdmin();
  const c = await prisma.customer.findUnique({ where: { id: str(f, "id", 40) }, include: { _count: { select: { documents: true, orders: true } } } });
  if (!c) redirect("/admin/customers");
  if (c._count.documents || c._count.orders) redirect(`/admin/customers/${c.id}?err=inuse`);
  await prisma.customer.delete({ where: { id: c.id } });
  await logAdmin(admin.id, "CUSTOMER", `ลบลูกค้า ${c.code} ${c.name}`);
  redirect("/admin/customers?deleted=1");
}
