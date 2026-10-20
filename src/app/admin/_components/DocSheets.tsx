"use client";
// แผ่นเอกสาร A4: วัดความสูงจริงในเบราว์เซอร์แล้วแบ่งหน้า (หัวตารางซ้ำทุกหน้า ยอดรวม/ลายเซ็นอยู่หน้าสุดท้าย)
// fit = ย่อให้พอดีกรอบ (ตัวอย่างในหน้าจอ) · ไม่ fit = ขนาดจริงสำหรับพิมพ์
import { useEffect, useRef, useState } from "react";
import { buildDocParts, paginateDoc, sheetsHtml, type DocView } from "@/lib/doc-render";

const SHEET_W = 793.7; // 210mm @96dpi

function render(view: DocView, copies: string[]) {
  let m = document.getElementById("docMeasure");
  if (!m) {
    m = document.createElement("div");
    m.id = "docMeasure";
    m.setAttribute("aria-hidden", "true");
    document.body.appendChild(m);
  }
  const P = buildDocParts(view);
  const pages = paginateDoc(P, m);
  return (copies.length ? copies : [""]).map((c) => sheetsHtml(P, pages, c || undefined)).join("");
}

export function DocSheets({ view, copies = [], fit = false, onPages }: { view: DocView; copies?: string[]; fit?: boolean; onPages?: (n: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState("");
  const [scale, setScale] = useState(0.6);

  useEffect(() => {
    let alive = true;
    // รอฟอนต์โหลดก่อนวัด ไม่งั้นความสูงแถวคลาดเคลื่อน
    const run = () => {
      if (!alive) return;
      const h = render(view, copies);
      setHtml(h);
      onPages?.((h.match(/class="sheet"/g) ?? []).length);
    };
    const t = setTimeout(() => (document.fonts?.ready ?? Promise.resolve()).then(run), 60);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(view), copies.join("|")]);

  useEffect(() => {
    if (!fit || !box.current) return;
    const el = box.current;
    const ro = new ResizeObserver(() => setScale(Math.min(1, Math.max(160, el.clientWidth - 2) / SHEET_W)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  if (!fit) return <div className="pp-sheets" dangerouslySetInnerHTML={{ __html: html }} />;
  const wrapped = html.replace(/<div class="sheet"/g, '</div><div class="pv-sheet"><div class="sheet"').replace(/^<\/div>/, "") + (html ? "</div>" : "");
  return <div ref={box} className="pv-sheets" style={{ ["--s" as string]: scale.toFixed(4) }} dangerouslySetInnerHTML={{ __html: wrapped }} />;
}
