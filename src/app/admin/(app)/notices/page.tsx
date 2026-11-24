// /admin/notices — คลังข้อความแจ้งเตือนหน้าสินค้า (ใต้ปุ่มสั่งซื้อ): เพิ่ม · ตาราง (ลากเรียง · ตัวอย่าง · ใช้กับสินค้า · เปิด/ปิด · แก้ไข/ลบ)
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { NoticeBox } from "@/components/notice/NoticeBox";
import { SCOPE_LABEL, autoApplies } from "@/lib/notices";
import { getNoticeLibrary } from "@/lib/notices-db";
import { DragHandle, RowActions } from "../../_components/RowActions";
import { SortableRows } from "../../_components/SortableRows";
import { deleteNotice, saveNoticeOrder, toggleNotice } from "./actions";
import { noticeFormLists } from "./form-data";
import { NoticeForm } from "./NoticeForm";
import "./notices.css";

export const instant = false;

export default async function NoticesPage({ searchParams }: PageProps<"/admin/notices">) {
  await requireAdmin();
  const [sp, lib, lists] = await Promise.all([searchParams, getNoticeLibrary(), noticeFormLists()]);
  const catName = (id: string) => lists.categories.find((c) => c.id === id)?.name;
  const used = (id: string) =>
    lists.raw.filter((p) => p.noticeIds.includes(id) || autoApplies(lib.find((n) => n.id === id)!, { categoryId: p.categoryId, isAccessory: p.isAccessory })).length;
  const flash = sp.saved === "1" ? "เพิ่มข้อความแล้ว — แสดงในหน้าสินค้าที่เลือกทันที" : sp.deleted === "1" ? "ลบข้อความแล้ว (ถอดออกจากทุกสินค้าแล้ว)" : "";
  return (
    <main className="main ntc-page">
      <div className="page-head">
        <div>
          <h1>ข้อความแจ้งเตือนสินค้า</h1>
          <p>กล่องข้อความใต้ปุ่ม &quot;ใส่ตะกร้า&quot; ในหน้าสินค้า เช่น ข้อควรระวังการต่อไฟ · สร้างครั้งเดียวใช้ซ้ำได้กับทุกสินค้า · เลือกต่อสินค้าได้ในหน้าแก้ไขสินค้า</p>
        </div>
      </div>
      {flash && <div className="ok-box" role="status" style={{ marginBottom: 12 }}>{flash}</div>}

      <section className="panel" aria-labelledby="ntc-add-h">
        <h2 id="ntc-add-h">เพิ่มข้อความใหม่</h2>
        <NoticeForm
          init={{ name: "", text: "", tone: "WARNING", icon: "bolt", scope: "MANUAL", categoryIds: [], skipAccessory: true, isActive: true, productIds: [] }}
          categories={lists.categories}
          products={lists.products}
        />
      </section>

      <section className="panel" aria-labelledby="ntc-list-h">
        <div className="ntc-list-head">
          <h2 id="ntc-list-h">ข้อความทั้งหมด <span className="ntc-n">{lib.length}</span></h2>
          <span className="sub">ลาก ⠿ เพื่อเรียง = ลำดับที่แสดงในหน้าสินค้า (สูงสุด 6 ข้อความต่อสินค้า)</span>
        </div>
        {lib.length ? (
          <table className="tbl ntc-tbl">
            <thead>
              <tr>
                <th><span className="sr-only">ลาก</span></th>
                <th>ข้อความ (ตัวอย่างหน้าร้าน)</th>
                <th>ใช้กับ</th>
                <th className="r">สินค้า</th>
                <th>สถานะ</th>
                <th className="r col-acts">การดำเนินการ</th>
              </tr>
            </thead>
            <SortableRows ids={lib.map((n) => n.id)} action={saveNoticeOrder}>
              {lib.map((n) => (
                <tr key={n.id} data-id={n.id} className={n.isActive ? "" : "row-off"}>
                  <td className="ntc-drag"><DragHandle label={n.name} /></td>
                  <td className="ntc-cell">
                    <Link className="link ntc-name" href={`/admin/notices/${n.id}`}>{n.name}</Link>
                    <NoticeBox n={n} />
                  </td>
                  <td className="ntc-scope-cell">{SCOPE_LABEL(n, catName)}</td>
                  <td className="r num">{used(n.id).toLocaleString("th-TH")}</td>
                  <td>
                    <form action={toggleNotice}>
                      <input type="hidden" name="id" value={n.id} />
                      <button type="submit" className="ntc-tg" role="switch" aria-checked={n.isActive} aria-label={`เปิดใช้งาน ${n.name}`} data-tip={n.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}><i /></button>
                    </form>
                  </td>
                  <td className="r">
                    <RowActions
                      name={n.name}
                      editHref={`/admin/notices/${n.id}`}
                      del={{ action: deleteNotice, id: n.id, title: "ลบข้อความนี้?", body: `${n.name} — ถอดออกจากสินค้าทุกตัวที่ใช้อยู่ กู้คืนไม่ได้ (ใช้ "ปิดใช้งาน" แทนได้)`, label: "ลบข้อความ" }}
                    />
                  </td>
                </tr>
              ))}
            </SortableRows>
          </table>
        ) : (
          <div className="empty"><b>ยังไม่มีข้อความ</b>เพิ่มข้อความแรกด้านบน</div>
        )}
      </section>
    </main>
  );
}
