// ส่วนแสดงผลร่วมของแดชบอร์ด/รายงาน (server components)
import { pctChange } from "@/lib/sales-report";

export const baht = (satang: number) =>
  "฿" + (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: satang % 100 ? 2 : 0, maximumFractionDigits: 2 });
export const qtyText = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 3 });
const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** "2026-10-05" → "5 ต.ค." · "2026-10" → "ต.ค. 69" */
export function shortDate(key: string, withYear = false) {
  const [y, m, d] = key.split("-").map(Number);
  if (!d) return `${TH_MONTH[m - 1]} ${String(y + 543).slice(2)}`;
  return `${d} ${TH_MONTH[m - 1]}${withYear ? ` ${String(y + 543).slice(2)}` : ""}`;
}

const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
/** "2026-10" → "ตุลาคม 2569" */
export const monthTh = (m: string) => `${TH_MONTHS[Number(m.slice(5, 7)) - 1]} ${Number(m.slice(0, 4)) + 543}`;

/** เปอร์เซ็นต์เทียบช่วงก่อน */
export function Delta({ now, prev }: { now: number; prev: number }) {
  const p = pctChange(now, prev);
  if (p === null) return <span className="l3-delta flat">{now ? "ใหม่" : "—"}</span>;
  const cls = p > 0.05 ? "up" : p < -0.05 ? "down" : "flat";
  return (
    <span className={`l3-delta ${cls}`} title={`ช่วงก่อน ${baht(prev)}`}>
      {cls === "up" ? "▲" : cls === "down" ? "▼" : "•"} {Math.abs(p).toLocaleString("th-TH", { maximumFractionDigits: 1 })}%
    </span>
  );
}

/** กราฟแท่งยอดขาย (SVG ล้วน ไม่ใช้ไลบรารี) */
export function BarChart({ data, title, label }: { data: { key: string; satang: number; count: number }[]; title: string; label: (k: string) => string }) {
  const W = 1000, H = 230, top = 22, bottom = 30, left = 8;
  const slot = (W - left * 2) / Math.max(1, data.length);
  const max = Math.max(...data.map((d) => d.satang), 1);
  const every = Math.ceil(data.length / 16); // ป้ายแกนไม่ให้ทับกัน
  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} style={{ height: "auto" }} role="img" aria-label={title}>
      <line className="base" x1={0} x2={W} y1={H - bottom} y2={H - bottom} />
      {data.map((d, i) => {
        const h = ((H - top - bottom) * d.satang) / max;
        const x = left + i * slot + slot * 0.18;
        const w = slot * 0.64;
        return (
          <g key={d.key} className="day">
            <title>{`${label(d.key)}: ${baht(d.satang)} (${d.count} รายการ)`}</title>
            <rect className="bar" x={x} y={H - bottom - h} width={w} height={h} />
            {d.satang > 0 && data.length <= 16 && (
              <text className="vlab" x={x + w / 2} y={H - bottom - h - 6} textAnchor="middle">
                {(d.satang / 100).toLocaleString("th-TH", { notation: "compact" })}
              </text>
            )}
            {i % every === 0 && (
              <text x={x + w / 2} y={H - 10} textAnchor="middle">
                {label(d.key)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** ตารางอันดับพร้อมแถบสัดส่วน */
export function RankTable({ rows, empty, unit = true }: { rows: { key: string; label: string; sku?: string; qty?: number; satang: number; count: number }[]; empty: string; unit?: boolean }) {
  if (!rows.length) return <div className="empty"><b>{empty}</b></div>;
  const max = Math.max(...rows.map((r) => r.satang), 1);
  return (
    <table className="l3-tbl">
      <thead>
        <tr><th className="rank">#</th><th>รายการ</th>{unit && <th className="r">จำนวน</th>}<th className="r">ยอดขาย</th></tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.key}>
            <td className="rank">{i + 1}</td>
            <td className="main">
              {r.label}
              {r.sku ? <span className="sub">{r.sku}</span> : null}
              <div className="l3-bar"><i style={{ width: `${(r.satang / max) * 100}%` }} /></div>
            </td>
            {unit && <td className="r" data-l="จำนวน">{qtyText(r.qty ?? 0)}</td>}
            <td className="r" data-l="ยอดขาย"><b>{baht(r.satang)}</b></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
