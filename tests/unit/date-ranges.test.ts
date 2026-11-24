// ช่วงเวลาด่วน + ช่วงก่อนหน้าสำหรับลูกศรเทียบ (src/lib/date-ranges.ts)
import assert from "node:assert/strict";
import { change, changeText, matchQuick, prevSpan, quickSpan } from "../../src/lib/date-ranges";

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => { assert.deepEqual(a, b, m); n++; };
const T = "2026-11-24";
eq(quickSpan("today", T), { from: T, to: T }, "วันนี้");
eq(quickSpan("yest", T), { from: "2026-11-23", to: "2026-11-23" }, "เมื่อวาน");
eq(quickSpan("d7", T), { from: "2026-11-18", to: T }, "7 วันรวมวันนี้");
eq(quickSpan("month", T), { from: "2026-11-01", to: T }, "เดือนนี้");
eq(quickSpan("last", T), { from: "2026-10-01", to: "2026-10-31" }, "เดือนก่อนทั้งเดือน");
eq(quickSpan("last", "2026-01-15"), { from: "2025-12-01", to: "2025-12-31" }, "ข้ามปี");
eq(quickSpan("year", T), { from: "2026-01-01", to: T }, "ปีนี้");
eq(matchQuick("2026-11-01", T, T), "month", "จับคู่เดือนนี้");
eq(matchQuick("2026-11-02", T, T), null, "ช่วงกำหนดเอง");
eq(prevSpan({ from: "2026-11-01", to: T }, T), { from: "2026-10-01", to: "2026-10-24", label: "เดือนก่อน" }, "เดือนนี้ → เดือนก่อน ณ วันเดียวกัน");
eq(prevSpan({ from: "2026-03-01", to: "2026-03-31" }, "2026-03-31"), { from: "2026-02-01", to: "2026-02-28", label: "เดือนก่อน" }, "31 มี.ค. → 28 ก.พ.");
eq(prevSpan({ from: "2026-10-01", to: "2026-10-31" }, T), { from: "2026-09-01", to: "2026-09-30", label: "เดือนก่อนหน้า" }, "เดือนก่อน → เดือนก่อนหน้าทั้งเดือน");
eq(prevSpan({ from: T, to: T }, T), { from: "2026-11-23", to: "2026-11-23", label: "เมื่อวาน" }, "วันนี้ → เมื่อวาน");
eq(prevSpan({ from: "2026-11-18", to: T }, T), { from: "2026-11-11", to: "2026-11-17", label: "7 วันก่อนหน้า" }, "7 วัน");
eq(prevSpan({ from: "2026-01-01", to: T }, T), { from: "2025-01-01", to: "2025-11-24", label: "ปีก่อน" }, "ปีนี้ → ปีก่อนช่วงเดียวกัน");
eq(prevSpan({ from: "2026-11-10", to: "2026-11-20" }, T), { from: "2026-10-30", to: "2026-11-09", label: "ช่วงก่อนหน้า" }, "กำหนดเอง 11 วัน");
eq(change(118, 100, "เดือนก่อน"), { dir: "up", pct: 18, label: "เดือนก่อน" }, "เพิ่ม");
eq(changeText(change(88, 100, "เมื่อวาน")), "▼ 12% จากเมื่อวาน", "ลด");
eq(changeText(change(5, 0, "เดือนก่อน")), "▲ เดือนก่อนไม่มียอด", "ช่วงก่อนเป็น 0");
eq(changeText(change(0, 0, "เดือนก่อน")), "เท่ากับเดือนก่อน", "ทั้งคู่ 0");
console.log(`date-ranges: ผ่าน ${n} ข้อ`);
