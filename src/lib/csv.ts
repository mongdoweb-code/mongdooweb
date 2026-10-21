// สร้างไฟล์ CSV ที่ Excel (ภาษาไทย) เปิดได้ทันที: มี BOM, ขึ้นบรรทัดแบบ CRLF
// กัน CSV/formula injection: ค่าที่ขึ้นต้นด้วย = + - @ tab CR ใส่ ' นำหน้า

export function csvCell(v: unknown) {
  let s = v instanceof Date ? v.toISOString() : String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export function toCsv(head: string[], rows: unknown[][]) {
  return "﻿" + [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** วันเวลาแบบไทย อ่านง่ายใน Excel (เขตเวลา กรุงเทพฯ) */
export const csvTime = (d: Date | null | undefined) =>
  d ? d.toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" }) : "";

export const satangToBaht = (n: number | null | undefined) => (n == null ? "" : (n / 100).toFixed(2));

export function csvResponse(body: string | Uint8Array, filename: string, type = "text/csv; charset=utf-8") {
  return new Response(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
