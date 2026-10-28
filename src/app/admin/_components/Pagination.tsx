// แบ่งหน้าแบบมาตรฐานของหลังบ้าน: "กำลังแสดง 1 ถึง 20 จาก 109 รายการ" · ต่อหน้า [10|20|30|50|100] · ก่อนหน้า 1 2 3 … 11 ถัดไป
// ใช้กับทุกตาราง: หน้า (server component) ส่ง href(page, per) มาเอง — ตัวกรองอื่นใน URL จึงคงอยู่
import { PerPageSelect } from "./PerPageSelect";

export const PER_OPTIONS = [10, 20, 30, 50, 100] as const;

/** อ่านจำนวนต่อหน้าจาก URL (?per=) — ค่าอื่นนอกตัวเลือกใช้ค่าเริ่มต้น */
export function readPer(v: string | string[] | undefined, fallback = 20) {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return (PER_OPTIONS as readonly number[]).includes(n) ? n : fallback;
}

/** เลขหน้าที่แสดง: หน้าแรก หน้าสุดท้าย และรอบหน้าปัจจุบัน — ที่เหลือเป็น … */
export function pageList(page: number, pages: number): (number | "…")[] {
  if (pages <= 9) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, 2, pages - 1, pages, page - 1, page, page + 1]);
  if (page <= 4) [3, 4, 5].forEach((n) => set.add(n));
  if (page >= pages - 3) [pages - 4, pages - 3, pages - 2].forEach((n) => set.add(n));
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  nums.forEach((n, i) => {
    if (i && n - nums[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

export function Pagination({
  page,
  pages,
  total,
  shown,
  per,
  href,
  unit = "รายการ",
  perOptions = PER_OPTIONS,
  note,
}: {
  page: number;
  pages: number;
  total: number;
  /** จำนวนแถวที่แสดงในหน้านี้ */
  shown: number;
  per: number;
  href: (page: number, per: number) => string;
  unit?: string;
  perOptions?: readonly number[];
  note?: string;
}) {
  if (total <= 0) return null;
  const from = (page - 1) * per + 1;
  return (
    <div className="tbl-foot pg-foot">
      <span className="pg-sum" role="status">
        กำลังแสดง <b className="num">{from.toLocaleString("th-TH")}</b> ถึง <b className="num">{(from + shown - 1).toLocaleString("th-TH")}</b> จาก <b className="num">{total.toLocaleString("th-TH")}</b> {unit}
        {note}
      </span>
      <div className="pg-right">
        <PerPageSelect value={per} options={perOptions.map((n) => ({ n, href: href(1, n) }))} />
        {pages > 1 && (
          <nav className="pg-nav" aria-label="เลขหน้า">
            {page > 1 ? <a className="pg-btn pg-txt" href={href(page - 1, per)} rel="prev">ก่อนหน้า</a> : <span className="pg-btn pg-txt" aria-disabled="true">ก่อนหน้า</span>}
            {pageList(page, pages).map((n, i) =>
              n === "…" ? (
                <span key={`e${i}`} className="pg-gap" aria-hidden="true">…</span>
              ) : (
                <a key={n} className={`pg-btn num${n === page ? " on" : ""}`} href={href(n, per)} aria-current={n === page ? "page" : undefined} aria-label={`หน้า ${n}`}>
                  {n}
                </a>
              ),
            )}
            {page < pages ? <a className="pg-btn pg-txt" href={href(page + 1, per)} rel="next">ถัดไป</a> : <span className="pg-btn pg-txt" aria-disabled="true">ถัดไป</span>}
          </nav>
        )}
      </div>
    </div>
  );
}
