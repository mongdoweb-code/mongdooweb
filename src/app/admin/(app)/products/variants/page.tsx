// /admin/products/variants — กลุ่มตัวเลือกสินค้า (A1): รายการกลุ่ม, สร้างกลุ่มใหม่, กลุ่มที่แนะนำจากชื่อสินค้า (ยืนยันก่อนสร้าง)
// สินค้าที่นำเข้าจาก WooCommerce: ตัวเลือกย่อยกลายเป็นสินค้าแยก → รวมกลับเป็นกลุ่มที่นี่
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { bahtText } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { suggestGroups } from "@/lib/variants";
import "../../../lot3.css";
import { GroupForm, SuggestForm } from "./VariantForms";

export default async function VariantsPage({ searchParams }: PageProps<"/admin/products/variants">) {
  await requireAdmin();
  const sp = await searchParams;
  const [groups, free] = await Promise.all([
    prisma.variantGroup.findMany({
      orderBy: { updatedAt: "desc" },
      include: { products: { select: { id: true, sku: true, isActive: true } } },
    }),
    prisma.product.findMany({
      where: { isService: false, variantGroupId: null },
      select: { id: true, name: true, sku: true, categoryId: true, priceSatang: true, isActive: true, category: { select: { nameTh: true } } },
    }),
  ]);
  const suggestions = suggestGroups(free.map((p) => ({ ...p, categoryName: p.category.nameTh })));
  return (
    <main className="main">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/products">← สินค้าทั้งหมด</Link></p>
          <h1>ตัวเลือกสินค้า</h1>
          <p>รวมสินค้าที่ต่างกันแค่สี/วัตต์/ขนาด เป็นหน้าเดียวที่มีปุ่มเลือก — แต่ละตัวเลือกยังมีราคา รูป สต็อก และลิงก์ของตัวเอง</p>
        </div>
      </div>
      {sp.deleted === "1" && <div className="login-info" role="status" style={{ marginBottom: 12 }}>ยกเลิกกลุ่มแล้ว — สินค้ายังอยู่ครบ</div>}

      <section className="panel">
        <div className="toolbar"><b>กลุ่มทั้งหมด ({groups.length})</b></div>
        {groups.length ? (
          <table className="tbl" id="groupTable">
            <thead>
              <tr><th>กลุ่ม</th><th>ตัวเลือก</th><th className="r">สินค้า</th><th /></tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td><b>{g.name}</b><span className="sub"> {g.products.map((p) => p.sku).join(", ")}</span></td>
                  <td>{g.optionNames.join(" / ")}</td>
                  <td className="r num">{g.products.filter((p) => p.isActive).length}/{g.products.length}</td>
                  <td className="r"><Link className="btn btn-outline btn-sm" href={`/admin/products/variants/${g.id}`}>แก้ไข</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty"><b>ยังไม่มีกลุ่มตัวเลือก</b>สร้างเองด้านล่าง หรือเลือกจากกลุ่มที่ระบบแนะนำ</div>
        )}
      </section>

      <div style={{ marginTop: 16, maxWidth: 900 }}>
        <GroupForm g={null} />
      </div>

      <section style={{ marginTop: 24 }} aria-labelledby="sugg-h">
        <h2 id="sugg-h" style={{ fontSize: 18, marginBottom: 4 }}>กลุ่มที่ระบบแนะนำจากชื่อสินค้า ({suggestions.length})</h2>
        <p className="sub" style={{ marginBottom: 12 }}>
          ระบบจับคู่สินค้าในหมวดเดียวกันที่ชื่อเหมือนกันเมื่อตัดวัตต์/สีออก — ยังไม่สร้างจนกว่าจะติ๊กและกดยืนยัน ตรวจค่าตัวเลือกก่อนสร้าง (แก้ได้ภายหลัง)
        </p>
        {suggestions.length ? (
          <SuggestForm
            list={suggestions.map((s) => ({
              key: s.key,
              name: s.name,
              categoryName: s.categoryName,
              optionNames: s.optionNames,
              members: s.members.map((m) => ({ sku: m.sku, name: m.name, options: m.options, price: m.priceSatang ? bahtText(m.priceSatang) : "สอบถามราคา", isActive: m.isActive })),
              skipped: s.skipped.map((x) => ({ sku: x.sku, reason: x.reason })),
            }))}
          />
        ) : (
          <div className="empty">ไม่มีกลุ่มแนะนำเพิ่มเติม</div>
        )}
      </section>
    </main>
  );
}
