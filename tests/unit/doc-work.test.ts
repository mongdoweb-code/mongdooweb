// ทดสอบหน่วย: สถานะงานภายในร้านของเอกสารขาย (src/lib/doc-work.ts) — รัน: npm run test:unit
import assert from "node:assert/strict";
import { parseWorkFilter, parseWorkState, workEventNote, workWhere } from "../../src/lib/doc-work";

let n = 0;
const eq = (a: unknown, b: unknown, msg: string) => { assert.deepEqual(a, b, msg); n++; };

eq(parseWorkState("TODO"), "TODO", "ต้องดำเนินการ");
eq(parseWorkState("DONE"), "DONE", "เสร็จสิ้น");
eq(parseWorkState("NONE"), null, "ล้าง");
eq(parseWorkState(""), null, "ค่าว่าง = ล้าง");
eq(parseWorkState("todo"), undefined, "ตัวพิมพ์เล็ก = ไม่ถูกต้อง");
eq(parseWorkState("DELETE"), undefined, "ค่าแปลก = ไม่ถูกต้อง");
eq(parseWorkFilter("todo"), "todo", "กรองต้องดำเนินการ");
eq(parseWorkFilter("none"), "none", "กรองยังไม่ระบุ");
eq(parseWorkFilter("x"), "", "ค่าแปลก = ไม่กรอง");
eq(parseWorkFilter(undefined), "", "ไม่มี = ไม่กรอง");
eq(workWhere("todo"), { workState: "TODO" }, "where ต้องดำเนินการ");
eq(workWhere("done"), { workState: "DONE" }, "where เสร็จสิ้น");
eq(workWhere("none"), { workState: null }, "where ยังไม่ระบุ");
eq(workWhere(""), {}, "where ไม่กรอง");
eq(workEventNote("TODO", "รอลูกค้าโอน"), "ต้องดำเนินการ — รอลูกค้าโอน", "ประวัติ + หมายเหตุ");
eq(workEventNote("DONE", ""), "เสร็จสิ้น", "ประวัติไม่มีหมายเหตุ");
eq(workEventNote(null, ""), "ล้างสถานะงาน", "ประวัติการล้าง");

console.log(`doc-work: ผ่าน ${n} ข้อ`);
