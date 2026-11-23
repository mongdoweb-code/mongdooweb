// Data Sheet หน้าสินค้า (server component — ไม่มี JS ฝั่งเบราว์เซอร์)
// A ตารางเรียบ "รายการ | Specification" · B แผ่นข้อมูลจัดกลุ่ม + แถบไฮไลต์ + ไทย/EN + ป้ายค่าหลายตัวเลือก · C ตารางเทียบทุกรุ่น (ซ่อนค่าที่เหมือนกันได้ด้วย CSS)
import type { DsCompare, Datasheet as DS, DsStyle } from "@/lib/datasheet";
import { dsChips, dsHighlights, dsIcon, dsLabel, dsRows } from "@/lib/datasheet";
import { formatBaht } from "../../_components/ProductCard";
import "./datasheet.css";

function Value({ v }: { v: string }) {
  const chips = dsChips(v);
  return chips ? (
    <span className="ds-chips">{chips.map((c, i) => <span key={i}>{c}</span>)}</span>
  ) : (
    <>{v}</>
  );
}

export function DatasheetSection({ ds, name, sku, slug, compare }: { ds: (DS & { style: DsStyle }) | null; name: string; sku: string; slug: string; compare: DsCompare | null }) {
  if (!ds && !compare) return null;
  const printHref = `/datasheet/${encodeURIComponent(slug)}`;
  const hls = ds ? dsHighlights(ds) : [];
  const grouped = !!ds && ds.groups.some((g) => g.title || g.en);
  return (
    <section className={`pdp-ds ds-${ds?.style ?? "C"}`} aria-labelledby="ds-h" data-datasheet={ds?.style ?? "C"}>
      <div className="ds-head">
        <div>
          <h2 className="sec-title" id="ds-h">Data Sheet</h2>
          <p className="ds-sub">ข้อมูลทางเทคนิค{ds?.style === "B" ? " · Technical Specifications" : ""}</p>
        </div>
        <div className="ds-acts">
          {ds && <a className="ds-pill" href={printHref} target="_blank" rel="noopener" data-ds-print>พิมพ์ / บันทึก PDF</a>}
          {ds?.style === "B" && <a className="ds-pill or" href="/quote">ขอใบเสนอราคา</a>}
        </div>
      </div>

      {ds?.style === "A" && (
        <table className="ds-a">
          <caption className="sr-only">Data Sheet {name}</caption>
          <thead><tr><th scope="col">รายการ</th><th scope="col">Specification</th></tr></thead>
          <tbody>
            {dsRows(ds).map((r, i) => (
              <tr key={i}><th scope="row">{dsLabel(r)}</th><td><Value v={r.value} /></td></tr>
            ))}
          </tbody>
        </table>
      )}

      {ds?.style === "B" && (
        <>
          {hls.length > 0 && (
            <ul className="ds-hl" aria-label="สเปกเด่น">
              {hls.map((r, i) => (
                <li key={i}><i aria-hidden="true">{dsIcon(r)}</i><b>{r.value}</b><small>{dsLabel(r)}</small></li>
              ))}
            </ul>
          )}
          <div className="ds-sheet">
            <div className="ds-sheet-top"><b>{name}</b><span>รหัสสินค้า {sku}</span></div>
            {ds.groups.map((g, gi) => (
              <div className={`ds-grp${grouped ? "" : " no-title"}`} key={gi}>
                {grouped && (
                  <h3><em aria-hidden="true">{gi + 1}</em><span>{g.title || g.en || "ข้อมูลทั่วไป"}{g.en && g.title && <small>{g.en}</small>}</span></h3>
                )}
                <dl>
                  {g.rows.map((r, i) => (
                    <div key={i} className="ds-r">
                      <dt>{dsLabel(r)}{r.en && r.label && <small>{r.en}</small>}</dt>
                      <dd><Value v={r.value} /></dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
            {ds.note && <p className="ds-note">{ds.note}</p>}
          </div>
        </>
      )}
      {ds?.style === "A" && ds.note && <p className="ds-note-a">{ds.note}</p>}

      {compare && (
        <div className="ds-cmp" data-ds-compare>
          <h3 className="ds-cmp-h">เทียบทุกรุ่น <small>รุ่นที่กำลังดูเป็นสีส้ม</small></h3>
          <input type="checkbox" id="dsDiff" className="ds-diff-cb" />
          <label htmlFor="dsDiff" className="ds-diff">แสดงเฉพาะค่าที่แตกต่างกัน</label>
          <div className="ds-cmp-wrap">
            <table className="ds-c">
              <caption className="sr-only">ตารางเทียบรุ่น {name}</caption>
              <thead>
                <tr>
                  <th scope="col">รายการ</th>
                  {compare.cols.map((c) => <th scope="col" key={c.slug} className={c.current ? "cur" : ""}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {compare.rows.map((r, i) =>
                  r.same ? (
                    <tr key={i} data-same>
                      <th scope="row">{dsLabel(r)}</th>
                      <td colSpan={compare.cols.length} className="same"><Value v={r.values[0]} /></td>
                    </tr>
                  ) : (
                    <tr key={i}>
                      <th scope="row">{dsLabel(r)}</th>
                      {r.values.map((v, j) => <td key={j} className={compare.cols[j].current ? "cur" : ""}>{v ? <Value v={v} /> : "—"}</td>)}
                    </tr>
                  ),
                )}
                <tr className="ds-c-price">
                  <th scope="row">ราคา</th>
                  {compare.cols.map((c) => <td key={c.slug} className={c.current ? "cur" : ""}>{c.price > 0 ? formatBaht(c.price) : "สอบถามราคา"}{!c.inStock && <small> · หมด</small>}</td>)}
                </tr>
                <tr className="ds-c-pick">
                  <th scope="row"><span className="sr-only">เลือกรุ่น</span></th>
                  {compare.cols.map((c) => (
                    <td key={c.slug} className={c.current ? "cur" : ""}>
                      {c.current ? <span className="ds-cur">กำลังดู</span> : <a className="ds-pick" href={`/product/${encodeURIComponent(c.slug)}`}>เลือกรุ่นนี้</a>}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
