// /admin/products/import — นำเข้า/แก้สินค้าหลายรายการจาก CSV (เจ้าของร้านเท่านั้น)
import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { CSV_COLUMNS, CSV_HELP } from "@/lib/product-csv";
import { ImportForm } from "./ImportForm";
import "../../../lot3.css";

export default async function ProductImportPage() {
  await requireOwner();
  return (
    <main className="main" id="page-import">
      <div className="page-head">
        <div>
          <p><Link className="link" href="/admin/products">← สินค้าทั้งหมด</Link></p>
          <h1>นำเข้าสินค้าจาก CSV</h1>
          <p>แก้ราคา สต็อก สถานะ ชื่อ หมวด หลายรายการในครั้งเดียว</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-outline" href="/admin/products/export" download>ดาวน์โหลดไฟล์สินค้าปัจจุบัน (แม่แบบ)</a>
        </div>
      </div>
      <div className="l3-cols">
        <ImportForm />
        <section className="l3-panel">
          <h2>วิธีใช้</h2>
          <ol style={{ margin: "8px 0 12px 18px", fontSize: 14, lineHeight: 1.7 }}>
            <li>ดาวน์โหลดไฟล์สินค้าปัจจุบัน เปิดด้วย Excel หรือ Google Sheets</li>
            <li>แก้เฉพาะช่องที่ต้องการ — <b>เว้นว่าง = ไม่เปลี่ยน</b> ลบแถวที่ไม่แก้ทิ้งได้</li>
            <li>บันทึกเป็น CSV (UTF-8) แล้วอัปโหลดเพื่อตรวจ</li>
            <li>ดูรายการที่จะเปลี่ยนและแถวที่ผิด แล้วกดยืนยัน</li>
          </ol>
          <table className="l3-tbl">
            <thead><tr><th>คอลัมน์</th><th>ความหมาย</th></tr></thead>
            <tbody>
              {CSV_COLUMNS.map((c) => (
                <tr key={c}><td className="main"><code className="l3-code">{c}</code></td><td>{CSV_HELP[c]}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="l3-note" style={{ marginTop: 10 }}>เพิ่มสินค้าใหม่ทำที่หน้า &quot;เพิ่มสินค้า&quot; (ต้องมีรูป/ลิงก์/คำอธิบาย) — ไฟล์นี้ใช้แก้สินค้าที่มีอยู่แล้ว จับคู่ด้วย sku</p>
        </section>
      </div>
    </main>
  );
}
