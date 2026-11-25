// แท็กคำที่ใช้บ่อยในหมายเหตุสถานะงาน (src/lib/doc-work.ts)
import assert from "node:assert/strict";
import { WORK_NOTE_MAX, WORK_SUGGEST, WORK_SUGGEST_MAX, addWorkNote, workSuggestions } from "../../src/lib/doc-work";

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => { assert.deepEqual(a, b, m); n++; };
eq(addWorkNote("", "รอโอนเงิน"), "รอโอนเงิน", "ว่าง = ใส่แท็ก");
eq(addWorkNote("  ", "รอโอนเงิน"), "รอโอนเงิน", "ช่องว่างล้วน = ใส่แท็ก");
eq(addWorkNote("โทรแล้ว", "รอโอนเงิน"), "โทรแล้ว · รอโอนเงิน", "ต่อท้ายด้วย ·");
eq(addWorkNote("โทรแล้ว · รอโอนเงิน", "รอโอนเงิน"), "โทรแล้ว · รอโอนเงิน", "ไม่ซ้ำ");
eq(addWorkNote("x".repeat(WORK_NOTE_MAX), "รอโอนเงิน").length, WORK_NOTE_MAX, "ไม่เกินความยาวสูงสุด");
const s = workSuggestions("INVOICE", ["วางบิลแล้ว", "  ลูกค้าขอเลื่อนจ่าย ", "", "x".repeat(50)]);
eq(s[0], "วางบิลแล้ว", "คำที่ร้านใช้บ่อยมาก่อน");
eq(s[1], "ลูกค้าขอเลื่อนจ่าย", "ตัดช่องว่าง");
eq(s.filter((x) => x === "วางบิลแล้ว").length, 1, "ไม่ซ้ำกับคำแนะนำ");
eq(s.some((x) => x.length > 40), false, "ตัดคำยาวเกิน");
eq(s.length <= WORK_SUGGEST_MAX, true, "จำกัดจำนวน");
for (const t of Object.keys(WORK_SUGGEST) as (keyof typeof WORK_SUGGEST)[]) eq(workSuggestions(t).length > 4, true, `มีแท็กของ ${t}`);
console.log(`doc-work-tags: ผ่าน ${n} ข้อ`);
