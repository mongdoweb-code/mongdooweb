"use server";
// กำหนดสเปกต่อหมวด (A5): ชื่อสเปก หน่วย ชนิด ตัวเลือก ใช้เป็นตัวกรองหรือไม่ — แก้แล้วล้างแคชหน้าร้าน
import { refresh } from "next/cache";
import { Prisma, type AttrType } from "../../../../../generated/prisma/client";
import { logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CODE_RE, LED_SPEC_PRESET, parseOptions } from "@/lib/specs";

export type SpecState = { error?: string; ok?: string; fields?: string[] };

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const TYPES: AttrType[] = ["TEXT", "NUMBER", "ENUM"];

async function categoryOf(f: FormData) {
  const id = str(f, "categoryId", 40);
  if (!id) return { id: null as string | null, name: "ทุกหมวด (สเปกกลาง)" };
  const c = await prisma.category.findUnique({ where: { id } });
  return c ? { id: c.id, name: c.nameTh } : null;
}

/** รหัสซ้ำในหมวดเดียวกัน (null = สเปกกลาง — unique ของ Postgres ไม่กัน NULL จึงตรวจเอง) */
const dup = (categoryId: string | null, code: string, notId?: string) =>
  prisma.specAttribute.findFirst({ where: { categoryId, code, ...(notId ? { NOT: { id: notId } } : {}) }, select: { id: true } });

export async function saveSpec(_prev: SpecState, f: FormData): Promise<SpecState> {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const cat = await categoryOf(f);
  if (!cat) return { error: "ไม่พบหมวด" };
  const code = str(f, "code", 30).toLowerCase();
  const label = str(f, "label", 60);
  const unit = str(f, "unit", 12) || null;
  const type = TYPES.includes(str(f, "type") as AttrType) ? (str(f, "type") as AttrType) : "TEXT";
  const options = type === "ENUM" ? parseOptions(String(f.get("options") ?? "")) : [];
  const sortOrder = Math.max(-9999, Math.min(9999, Math.floor(Number(str(f, "sortOrder", 6)) || 0)));
  const bad: string[] = [];
  if (!CODE_RE.test(code)) bad.push("code");
  if (label.length < 1) bad.push("label");
  if (type === "ENUM" && options.length < 1) bad.push("options");
  if (bad.length)
    return {
      error: bad.includes("code") ? "รหัสใช้ได้เฉพาะ a-z 0-9 _ (ขึ้นต้นด้วยตัวอักษร) เช่น watt, ip" : bad.includes("options") ? "ชนิดตัวเลือกต้องมีอย่างน้อย 1 ค่า" : "กรุณาใส่ชื่อสเปก",
      fields: bad,
    };
  if (await dup(cat.id, code, id || undefined)) return { error: `รหัส "${code}" มีอยู่แล้วในหมวดนี้`, fields: ["code"] };
  const data = { categoryId: cat.id, code, label, unit, type, options, filterable: f.get("filterable") === "on", sortOrder };
  if (id) {
    const old = await prisma.specAttribute.findUnique({ where: { id } });
    if (!old) return { error: "ไม่พบสเปก" };
    await prisma.$transaction(async (tx) => {
      await tx.specAttribute.update({ where: { id }, data });
      // เปลี่ยนรหัส → ย้ายค่าที่สินค้ากรอกไว้ไปรหัสใหม่ (สินค้าในขอบเขตเดิม)
      if (old.code !== code) await renameAttr(tx, old.categoryId, old.code, code);
    });
    await logAdmin(admin.id, "PRODUCT", `แก้สเปก "${label}" (${code}) ของ ${cat.name}`);
  } else {
    await prisma.specAttribute.create({ data });
    await logAdmin(admin.id, "PRODUCT", `เพิ่มสเปก "${label}" (${code}) ให้ ${cat.name}`);
  }
  refreshStorefront();
  refresh();
  return { ok: id ? "บันทึกแล้ว" : `เพิ่มสเปก "${label}" แล้ว` };
}

type Tx = Prisma.TransactionClient;
async function productsIn(tx: Tx, categoryId: string | null) {
  return tx.product.findMany({ where: { ...(categoryId ? { categoryId } : {}), NOT: { attrs: { equals: Prisma.DbNull } } }, select: { id: true, attrs: true } });
}
async function renameAttr(tx: Tx, categoryId: string | null, from: string, to: string) {
  for (const p of await productsIn(tx, categoryId)) {
    const a = { ...((p.attrs ?? {}) as Record<string, unknown>) };
    if (!(from in a)) continue;
    a[to] = a[from];
    delete a[from];
    await tx.product.update({ where: { id: p.id }, data: { attrs: a as Prisma.InputJsonValue } });
  }
}

export async function deleteSpec(f: FormData) {
  const admin = await requireAdmin();
  const s = await prisma.specAttribute.findUnique({ where: { id: str(f, "id", 40) } });
  if (!s) return;
  await prisma.$transaction(async (tx) => {
    await tx.specAttribute.delete({ where: { id: s.id } });
    // ลบค่าที่สินค้ากรอกไว้ด้วย (กันค่าเก่ากลับมาเมื่อสร้างรหัสเดิมใหม่) — สเปกกลาง: เฉพาะหมวดที่ไม่มีรหัสนี้ของตัวเอง
    const keepCats = s.categoryId ? [] : (await tx.specAttribute.findMany({ where: { code: s.code, NOT: { categoryId: null } }, select: { categoryId: true } })).map((x) => x.categoryId!);
    for (const p of await productsIn(tx, s.categoryId)) {
      const a = { ...((p.attrs ?? {}) as Record<string, unknown>) };
      if (!(s.code in a)) continue;
      if (keepCats.length && (await tx.product.findFirst({ where: { id: p.id, categoryId: { in: keepCats } }, select: { id: true } }))) continue;
      delete a[s.code];
      await tx.product.update({ where: { id: p.id }, data: { attrs: Object.keys(a).length ? (a as Prisma.InputJsonValue) : Prisma.DbNull } });
    }
  });
  await logAdmin(admin.id, "PRODUCT", `ลบสเปก "${s.label}" (${s.code})`);
  refreshStorefront();
  refresh();
}

/** เพิ่มชุดสเปกมาตรฐานไฟ LED (ข้ามรหัสที่มีอยู่แล้ว) */
export async function addPreset(_prev: SpecState, f: FormData): Promise<SpecState> {
  const admin = await requireAdmin();
  const cat = await categoryOf(f);
  if (!cat) return { error: "ไม่พบหมวด" };
  let n = 0;
  for (const p of LED_SPEC_PRESET) {
    if (await dup(cat.id, p.code)) continue;
    await prisma.specAttribute.create({ data: { ...p, categoryId: cat.id } });
    n++;
  }
  await logAdmin(admin.id, "PRODUCT", `เพิ่มชุดสเปกมาตรฐานไฟ LED ให้ ${cat.name} (${n} รายการ)`);
  refreshStorefront();
  refresh();
  return n ? { ok: `เพิ่มแล้ว ${n} สเปก` } : { ok: "มีสเปกมาตรฐานครบแล้ว" };
}
