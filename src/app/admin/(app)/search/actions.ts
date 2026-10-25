"use server";
// คำพ้องสำหรับค้นหา (A11) + เพิ่มคำพ้องจากรายงานคำที่ค้นไม่เจอ — ล้างแคชหน้าร้าน (ช่องค้นหาใช้คำพ้องชุดใหม่ทันที)
import { redirect } from "next/navigation";
import { logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireAdmin, requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SYNONYMS, cleanWords, normWord } from "@/lib/search";

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
function back(f: FormData, flag: string, extra = ""): never {
  const b = str(f, "back", 400);
  const u = new URL(/^\/admin\/search(\?[^\s]*)?$/.test(b) ? b : "/admin/search", "http://x");
  u.searchParams.set("done", flag);
  if (extra) u.searchParams.set("msg", extra.slice(0, 120));
  else u.searchParams.delete("msg");
  redirect(u.pathname + u.search + "#synonyms");
}

export async function saveSynonym(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const words = cleanWords(str(f, "words", 800));
  if (words.length < 2) back(f, "need2");
  if (id) await prisma.searchSynonym.update({ where: { id }, data: { words } }).catch(() => null);
  else await prisma.searchSynonym.create({ data: { words } });
  await logAdmin(admin.id, "SEARCH", `${id ? "แก้" : "เพิ่ม"}กลุ่มคำพ้อง: ${words.join(", ")}`);
  refreshStorefront();
  back(f, "saved");
}

export async function deleteSynonym(f: FormData) {
  const admin = await requireAdmin();
  const s = await prisma.searchSynonym.findUnique({ where: { id: str(f, "id", 40) } });
  if (s) {
    await prisma.searchSynonym.delete({ where: { id: s.id } });
    await logAdmin(admin.id, "SEARCH", `ลบกลุ่มคำพ้อง: ${s.words.join(", ")}`);
    refreshStorefront();
  }
  back(f, "deleted");
}

/** ใส่ชุดคำพ้องเริ่มต้นที่ยังไม่มี (ดูจากคำแรกของกลุ่ม) */
export async function addDefaultSynonyms(f: FormData) {
  const admin = await requireAdmin();
  const all = await prisma.searchSynonym.findMany({ select: { words: true } });
  const have = new Set(all.flatMap((g) => g.words.map(normWord)));
  const add = DEFAULT_SYNONYMS.filter((g) => !have.has(normWord(g[0])));
  if (add.length) await prisma.searchSynonym.createMany({ data: add.map((words) => ({ words })) });
  await logAdmin(admin.id, "SEARCH", `เพิ่มชุดคำพ้องเริ่มต้น ${add.length} กลุ่ม`);
  refreshStorefront();
  back(f, "defaults", String(add.length));
}

/**
 * จากรายงานคำที่ค้นไม่เจอ: ผูกคำนั้นกับคำที่มีในสินค้า — มีกลุ่มที่มีคำปลายทางอยู่แล้ว = เพิ่มเข้ากลุ่มนั้น ไม่มี = สร้างกลุ่มใหม่
 */
export async function synonymFromQuery(f: FormData) {
  const admin = await requireAdmin();
  const [q] = cleanWords([str(f, "query", 40)]);
  const [to] = cleanWords([str(f, "to", 40)]);
  if (!q || !to || normWord(q) === normWord(to)) back(f, "need2");
  const groups = await prisma.searchSynonym.findMany();
  const target = groups.find((g) => g.words.some((w) => normWord(w) === normWord(to)));
  if (target) {
    if (!target.words.some((w) => normWord(w) === normWord(q))) await prisma.searchSynonym.update({ where: { id: target.id }, data: { words: cleanWords([...target.words, q]) } });
  } else await prisma.searchSynonym.create({ data: { words: [to, q] } });
  await logAdmin(admin.id, "SEARCH", `เพิ่มคำพ้อง "${q}" = "${to}" (จากคำที่ค้นไม่เจอ)`);
  refreshStorefront();
  back(f, "linked", `${q} = ${to}`);
}

export async function clearSearchLog(f: FormData) {
  const admin = await requireOwner();
  const r = await prisma.searchLog.deleteMany({});
  await logAdmin(admin.id, "SEARCH", `ล้างบันทึกคำค้น ${r.count} รายการ`);
  back(f, "cleared");
}
