// CSV สำหรับหลังบ้าน: ส่งออกแบบมี BOM (Excel อ่านภาษาไทยได้) + กันสูตรอันตราย, อ่านไฟล์ที่ผู้ใช้อัปโหลด
import "server-only";
import { parse } from "csv-parse/sync";

/** กัน CSV/formula injection: ค่าที่ขึ้นต้นด้วย = + - @ ใส่ ' นำหน้า (ตัวเลขติดลบปล่อยไว้) */
export function csvCell(v: unknown) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) || s !== s.trim() ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export const csvText = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

export function csvResponse(filename: string, rows: unknown[][]) {
  return new Response(csvText(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** อ่าน CSV (รองรับ BOM, คั่นด้วย , หรือ ; หรือ tab) → แถวเป็น object ตามหัวคอลัมน์ (ตัวพิมพ์เล็ก ตัดช่องว่าง) */
export function parseCsv(text: string): { rows: Record<string, string>[]; error?: string } {
  const src = text.replace(/^﻿/, "");
  if (!src.trim()) return { rows: [], error: "ไฟล์ว่างเปล่า" };
  const first = src.split(/\r?\n/, 1)[0];
  const delimiter = first.includes("\t") ? "\t" : first.split(";").length > first.split(",").length ? ";" : ",";
  try {
    const rows = parse(src, {
      columns: (h: string[]) => h.map((x) => x.trim().toLowerCase().replace(/^'/, "")),
      delimiter, skip_empty_lines: true, trim: true, relax_column_count: true, bom: true,
    }) as Record<string, string>[];
    // ค่าที่ส่งออกไปแล้วมี ' นำหน้า (กันสูตร) → ตัดออกตอนอ่านกลับ
    return { rows: rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? "").replace(/^'(?=[=+\-@])/, "")]))) };
  } catch (e) {
    return { rows: [], error: `อ่านไฟล์ CSV ไม่ได้: ${e instanceof Error ? e.message.slice(0, 120) : ""}` };
  }
}

/** หัวคอลัมน์ + แถว → ข้อความ CSV (มี BOM) */
export const toCsv = (head: string[], rows: unknown[][]) => csvText([head, ...rows]);

/** วันเวลาแบบไทย อ่านง่ายใน Excel (เขตเวลา กรุงเทพฯ) */
export const csvTime = (d: Date | null | undefined) => (d ? d.toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" }) : "");

export const satangToBaht = (n: number | null | undefined) => (n == null ? "" : (n / 100).toFixed(2));

/** ไฟล์ดาวน์โหลดทั่วไป (CSV ที่สร้างไว้แล้ว / ZIP) */
export function fileResponse(body: string | Uint8Array, filename: string, type = "text/csv; charset=utf-8") {
  return new Response(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
