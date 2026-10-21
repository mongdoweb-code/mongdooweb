// ตารางประวัติการเคลื่อนไหวของสต็อก (ใช้ในหน้า /admin/stock และ /admin/stock/[id])
import Link from "next/link";
import type { Prisma } from "../../../../../generated/prisma/client";
import { STOCK_REASONS } from "@/lib/stock";

const fmt = (d: Date) => d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

type MoveRow = Prisma.StockMovementGetPayload<{ include: { product: { select: { id: true; name: true; sku: true } }; admin: { select: { displayName: true } } } }>;
export function MoveTable({ rows, showProduct }: { rows: MoveRow[]; showProduct?: boolean }) {
  return (
    <table className="l3-tbl" id="moveTbl">
      <thead>
        <tr><th>เวลา</th>{showProduct && <th>สินค้า</th>}<th>ประเภท</th><th className="r">เปลี่ยน</th><th className="r">คงเหลือ</th><th>อ้างอิง / หมายเหตุ</th><th>ผู้ทำ</th></tr>
      </thead>
      <tbody>
        {rows.map((m) => (
          <tr key={m.id}>
            <td data-l="เวลา">{fmt(m.createdAt)}</td>
            {showProduct && <td className="main"><Link className="link" href={`/admin/stock/${m.product.id}`}>{m.product.name}</Link><span className="sub">{m.product.sku}</span></td>}
            <td data-l="ประเภท">{STOCK_REASONS[m.reason as keyof typeof STOCK_REASONS] ?? m.reason}</td>
            <td className="r" data-l="เปลี่ยน"><b className={m.change > 0 ? "l3-pos" : "l3-neg"}>{m.change > 0 ? `+${m.change}` : m.change}</b></td>
            <td className="r" data-l="คงเหลือ">{m.balance}</td>
            <td data-l="อ้างอิง">
              {m.ref ? (/^MDW-/.test(m.ref) ? <Link className="link" href={`/admin?tab=ALL&open=${encodeURIComponent(m.ref)}`}>{m.ref}</Link> : m.ref) : ""}
              {m.note ? <span className="sub">{m.note}</span> : null}
              {!m.ref && !m.note ? "—" : null}
            </td>
            <td data-l="ผู้ทำ">{m.admin?.displayName ?? "ระบบ"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
