// /admin/specs?cat=<categoryId> — กำหนดสเปกต่อหมวด (A5) · ไม่เลือกหมวด = สเปกกลาง (ใช้กับทุกหมวด)
// สเปกที่กำหนดที่นี่: เป็นช่องกรอกในหน้าแก้ไขสินค้า, ตารางสเปกหน้าสินค้า, ตัวกรองหน้าหมวด, ตารางเปรียบเทียบ
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmit } from "../../_components/AdminClient";
import "../../lot3.css";
import { deleteSpec } from "./actions";
import { PresetButton, SpecForm, type SpecRow } from "./SpecForms";

export default async function SpecsPage({ searchParams }: PageProps<"/admin/specs">) {
  await requireAdmin();
  const sp = await searchParams;
  const cats = await prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, nameTh: true, _count: { select: { specAttrs: true } } } });
  const catId = typeof sp.cat === "string" && cats.some((c) => c.id === sp.cat) ? sp.cat : "";
  const [defs, products, globals] = await Promise.all([
    prisma.specAttribute.findMany({ where: { categoryId: catId || null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.product.findMany({ where: { ...(catId ? { categoryId: catId } : {}), isService: false }, select: { attrs: true } }),
    catId ? prisma.specAttribute.findMany({ where: { categoryId: null }, orderBy: { sortOrder: "asc" }, select: { label: true } }) : Promise.resolve([]),
  ]);
  const used = (code: string) => products.filter((p) => p.attrs && typeof p.attrs === "object" && code in (p.attrs as object)).length;
  const rows: SpecRow[] = defs.map((d) => ({ id: d.id, code: d.code, label: d.label, unit: d.unit ?? "", type: d.type, options: d.options, filterable: d.filterable, sortOrder: d.sortOrder, used: used(d.code) }));
  const current = cats.find((c) => c.id === catId);

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>สเปกสินค้าต่อหมวด</h1>
          <p>กำหนดหัวข้อสเปก (เช่น กำลังไฟ แรงดัน ระดับกันน้ำ) — ใช้เป็นช่องกรอกในหน้าสินค้า ตารางสเปก ตัวกรองหน้าหมวด และหน้าเปรียบเทียบ</p>
        </div>
      </div>
      <form className="toolbar2" action="/admin/specs" style={{ marginBottom: 16 }}>
        <label htmlFor="specCat">หมวด</label>
        <select id="specCat" name="cat" defaultValue={catId} className="sel">
          <option value="">ทุกหมวด (สเปกกลาง)</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameTh} ({c._count.specAttrs})
            </option>
          ))}
        </select>
        <button className="btn btn-outline btn-sm" type="submit">เปิด</button>
      </form>
      <p className="sub" style={{ marginBottom: 12 }}>
        กำลังแก้: <b>{current ? current.nameTh : "สเปกกลาง (ใช้กับทุกหมวด)"}</b>
        {current && globals.length > 0 && ` · หมวดนี้ใช้สเปกกลางด้วย: ${globals.map((g) => g.label).join(", ")}`}
      </p>
      <div style={{ marginBottom: 16 }}>
        <PresetButton categoryId={catId} />
      </div>
      <div style={{ display: "grid", gap: 12, maxWidth: 820 }}>
        {rows.map((s) => (
          <div key={s.id} style={{ display: "grid", gap: 4 }}>
            <SpecForm categoryId={catId} s={s} />
            <form action={deleteSpec} style={{ justifySelf: "end" }}>
              <input type="hidden" name="id" value={s.id} />
              <ConfirmSubmit className="btn btn-ghost btn-sm" title={`ลบสเปก "${s.label}"?`} body={`ค่าที่กรอกไว้ใน ${s.used} สินค้าจะถูกลบด้วย`} confirmLabel="ยืนยันลบ">
                ลบสเปกนี้
              </ConfirmSubmit>
            </form>
          </div>
        ))}
        {!rows.length && <div className="empty"><b>ยังไม่มีสเปก</b>เพิ่มเองด้านล่าง หรือกดเพิ่มชุดมาตรฐานไฟ LED</div>}
        <SpecForm key={`new-${rows.length}`} categoryId={catId} />
      </div>
      <p style={{ marginTop: 16 }}>
        <Link className="link" href="/admin/products">ไปกรอกค่าสเปกในหน้าแก้ไขสินค้า</Link>
      </p>
    </main>
  );
}
