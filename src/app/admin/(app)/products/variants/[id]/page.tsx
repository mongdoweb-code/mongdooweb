// /admin/products/variants/:id — แก้กลุ่มตัวเลือก: ค่าตัวเลือก ตัวหลัก เพิ่ม/เอาออก แก้ราคาพร้อมกัน ยกเลิกกลุ่ม
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { bahtText } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { optionLabel, readOptions, validateGroup } from "@/lib/variants";
import { ConfirmSubmit } from "../../../../_components/AdminClient";
import "../../../../lot3.css";
import { deleteVariantGroup } from "../../lot9-actions";
import { GroupForm, GroupPriceForm } from "../VariantForms";

export default async function VariantGroupPage({ params, searchParams }: PageProps<"/admin/products/variants/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const g = await prisma.variantGroup.findUnique({
    where: { id },
    include: { products: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, sku: true, name: true, slug: true, priceSatang: true, isActive: true, variantOptions: true } } },
  });
  if (!g) notFound();
  const members = g.products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    price: p.priceSatang ? bahtText(p.priceSatang) : "สอบถามราคา",
    isActive: p.isActive,
    options: readOptions(p.variantOptions, g.optionNames),
  }));
  const problem = validateGroup(g.optionNames, members.map((m) => ({ label: m.sku, options: m.options })));
  const primary = g.products.find((p) => p.id === g.primaryId) ?? g.products[0];
  return (
    <main className="main">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/products/variants">← ตัวเลือกสินค้า</Link></p>
          <h1>{g.name}</h1>
          <p>
            {g.products.length} ตัวเลือก · {g.optionNames.join(" / ")}
            {primary && (
              <>
                {" "}· <a className="link" href={`/product/${primary.slug}`} target="_blank" rel="noopener">ดูหน้าร้าน</a>
              </>
            )}
          </p>
        </div>
      </div>
      {sp.saved === "1" && <div className="login-info" role="status" style={{ marginBottom: 12 }}>สร้างกลุ่มแล้ว</div>}
      {problem && (
        <div className="login-err" role="alert" style={{ marginBottom: 12 }}>
          ยังต้องแก้: {problem}
        </div>
      )}
      <div style={{ maxWidth: 980 }}>
        <GroupForm
          key={members.map((m) => m.id).join("|") + g.optionNames.join(",")}
          g={{ id: g.id, name: g.name, optionNames: g.optionNames, primaryId: primary?.id ?? "", members }}
        />
        <div style={{ marginTop: 16 }}>
          <GroupPriceForm groupId={g.id} members={members.map((m) => ({ id: m.id, label: `${m.sku} · ${optionLabel(g.optionNames, m.options) || "-"} · ${m.price}` }))} />
        </div>
        <form action={deleteVariantGroup} className="box" style={{ marginTop: 16, maxWidth: 520 }}>
          <input type="hidden" name="groupId" value={g.id} />
          <h3>ยกเลิกกลุ่ม</h3>
          <p className="sub">สินค้าทุกตัวยังอยู่ครบ แค่กลับไปเป็นสินค้าเดี่ยว (ไม่มีปุ่มเลือกตัวเลือก)</p>
          <div>
            <ConfirmSubmit className="btn btn-danger" title="ยกเลิกกลุ่มนี้?" body={g.name} confirmLabel="ยกเลิกกลุ่ม">
              ยกเลิกกลุ่ม
            </ConfirmSubmit>
          </div>
        </form>
      </div>
    </main>
  );
}
