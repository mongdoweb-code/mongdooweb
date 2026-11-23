// Data Sheet สินค้า (src/lib/datasheet.ts): ตรวจค่า · วางจาก Excel · ป้ายค่าหลายตัวเลือก · แม่แบบ · ตารางเทียบรุ่น
import assert from "node:assert/strict";
import { applyTemplate, dsChips, dsCompare, dsEmpty, dsHighlights, dsIcon, dsStyleOf, fromSpecs, parseDatasheet, parsePaste, parseTemplate, toTemplate } from "../../src/lib/datasheet";

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => { assert.deepEqual(a, b, m); n++; };

// ตรวจค่า
const d = parseDatasheet({
  style: "X", note: "  * ขนาด   โดยประมาณ ",
  groups: [
    { title: " ระบบไฟฟ้า ", en: "Electrical", rows: [{ label: "กำลังไฟ", en: "Power", value: " 10W ", hl: true }, { label: "ว่าง", value: "" }, { label: "<b>", value: "x".repeat(400) }] },
    { title: "ว่างทั้งกลุ่ม", rows: [{ label: "a", value: " " }] },
    ...Array.from({ length: 3 }, (_, i) => ({ title: `G${i}`, rows: Array.from({ length: 4 }, (_, j) => ({ label: `L${i}${j}`, value: "v", hl: true })) })),
  ],
});
eq(d.style, "", "รูปแบบผิด = ตามค่าร้าน");
eq(d.note, "* ขนาด โดยประมาณ", "หมายเหตุตัดช่องว่าง");
eq(d.groups.length, 4, "กลุ่มที่ไม่มีแถวถูกตัด");
eq(d.groups[0].rows.map((r) => r.value.length), [3, 300], "แถวว่างตัด · ค่ายาวตัดที่ 300");
eq(d.groups[0].rows[1].label, "<b>", "เก็บเป็นข้อความ (escape ตอนแสดง)");
eq(dsHighlights(d).length, 6, "ไฮไลต์ไม่เกิน 6");
eq(dsEmpty(parseDatasheet(null)), true, "null = ว่าง");
eq([dsStyleOf(d, "A"), dsStyleOf({ ...d, style: "B" }, "A"), dsStyleOf(d, "zz")], ["A", "B", "B"], "รูปแบบ: สินค้า → ร้าน → B");
const many = parseDatasheet({ groups: [{ title: "", rows: Array.from({ length: 100 }, (_, i) => ({ label: `r${i}`, value: "v" })) }] });
eq(many.groups[0].rows.length, 80, "รวมไม่เกิน 80 แถว");

// ป้ายค่าหลายตัวเลือก
eq(dsChips("15° / 25° / 35° / 45° / 60° / 90° / 120° / 15×45° / 30×60°")?.length, 9, "มุมลำแสง → ป้าย");
eq(dsChips("220V/50Hz"), null, "2 ค่า = ข้อความ");
eq(dsChips("Aluminum + Glass"), null, "ไม่มี / = ข้อความ");
eq(dsChips("a / b / ค่าที่ยาวมากเกินกว่าสิบหกตัวอักษร"), null, "ค่ายาว = ข้อความ");
eq([dsIcon({ label: "กำลังไฟ", en: "" }), dsIcon({ label: "", en: "IP Rating" }), dsIcon({ label: "อื่น", en: "" })], ["⚡", "💧", "★"], "ไอคอนไฮไลต์");

// วางจาก Excel / ตาราง / คำอธิบายเดิม
const tsv = parsePaste("รายการ\tSpecification\nPower\t10W\nInput Voltage\tAC 220V\n\nBeam Angle\t15° / 25° / 35°\n");
eq(tsv.length, 1, "TSV กลุ่มเดียว · ข้ามหัวตาราง");
eq(tsv[0].rows.map((r) => [r.label, r.value]), [["Power", "10W"], ["Input Voltage", "AC 220V"], ["Beam Angle", "15° / 25° / 35°"]], "TSV แถว");
const grouped = parsePaste("ระบบไฟฟ้า\nกำลังไฟ | Power | 10W\nแรงดัน: AC 220V\nตัวโคม:\n- วัสดุ....... อลูมิเนียม\nน้ำหนัก   0.6 kg");
eq(grouped.map((g) => g.title), ["ระบบไฟฟ้า", "ตัวโคม"], "บรรทัดเดี่ยว = ชื่อกลุ่ม");
eq(grouped[0].rows.map((r) => [r.label, r.en, r.value]), [["กำลังไฟ", "Power", "10W"], ["แรงดัน", "", "AC 220V"]], "3 คอลัมน์ | และ :");
eq(grouped[1].rows.map((r) => [r.label, r.value]), [["วัสดุ", "อลูมิเนียม"], ["น้ำหนัก", "0.6 kg"]], "...... และช่องว่างหลายตัว · ตัด - หน้าบรรทัด");
eq(parsePaste("").length, 0, "ว่าง");

// สเปกเดิม → กลุ่มเดียว (สเปกตามหมวดก่อน ไม่ซ้ำหัวข้อ)
eq(fromSpecs([{ label: "กำลังไฟ", value: "10W" }, { label: "IP", value: "IP68" }], [{ label: "IP", value: "IP65" }])[0].rows.map((r) => r.value), ["IP65", "10W"], "fromSpecs");

// แม่แบบ
const tpl = toTemplate(d.groups);
eq(tpl[0].rows[0], { label: "กำลังไฟ", en: "Power", value: "", hl: true }, "แม่แบบไม่มีค่า");
eq(parseTemplate({ groups: tpl }).length, tpl.length, "อ่านแม่แบบ");
const applied = applyTemplate(tpl.slice(0, 1), [{ title: "", en: "", rows: [{ label: "กำลังไฟ", en: "", value: "48W", hl: false }, { label: "สี", en: "", value: "ขาว", hl: false }] }]);
eq(applied[0].rows[0].value, "48W", "ค่าเดิมที่หัวข้อตรงยังอยู่");
eq(applied[1], { title: "อื่น ๆ", en: "Others", rows: [{ label: "สี", en: "", value: "ขาว", hl: false }] }, "หัวข้อที่ไม่มีในแม่แบบ → อื่น ๆ");

// ตารางเทียบรุ่น
const ds = (rows: [string, string][]) => parseDatasheet({ groups: [{ title: "", rows: rows.map(([label, value]) => ({ label, value })) }] });
const cmp = dsCompare([
  { slug: "a", label: "10W", current: false, price: 690, inStock: true, ds: ds([["Power", "10W"], ["IP", "IP65"]]) },
  { slug: "b", label: "24W", current: true, price: 1290, inStock: true, ds: ds([["Power", "24W"], ["IP", "IP65"], ["Weight", "1.1 kg"]]) },
  { slug: "c", label: "36W", current: false, price: 1690, inStock: false, ds: ds([]) },
]);
eq(cmp?.cols.map((c) => c.slug), ["a", "b"], "รุ่นที่ไม่มี Data Sheet ไม่อยู่ในตาราง");
eq(cmp?.rows.map((r) => [r.label, r.values, r.same]), [["Power", ["10W", "24W"], false], ["IP", ["IP65", "IP65"], true], ["Weight", ["", "1.1 kg"], false]], "เรียงตามรุ่นที่ดู · ค่าที่เหมือนกัน");
eq(dsCompare([{ slug: "a", label: "", current: true, price: 0, inStock: true, ds: ds([["P", "1"]]) }]), null, "รุ่นเดียว = ไม่แสดง");
console.log(`datasheet: ผ่าน ${n} ข้อ`);
