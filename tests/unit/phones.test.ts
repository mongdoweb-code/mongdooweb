// ทดสอบหน่วย: หลายเบอร์โทร/โทรสารของลูกค้า (src/lib/phones.ts) + แถวติดต่อในเอกสาร — รัน: npm run test:unit
import assert from "node:assert/strict";
import { custContact } from "../../src/lib/doc-render";
import { customerPhones, formatPhoneEntry, normalizePhone, parsePhoneList, phoneMain, PHONES_MAX, splitPhones } from "../../src/lib/phones";

let n = 0;
const eq = (a: unknown, b: unknown, msg: string) => { assert.deepEqual(a, b, msg); n++; };

// แยกหลายเบอร์ในช่องเดียว (กรณีจากหน้าจอจริง: "086-309-9066, 044-25…")
eq(splitPhones("086-309-9066, 044-251234"), ["086-309-9066", "044-251234"], "คั่นด้วย ,");
eq(splitPhones("0863099066 / 044251234"), ["0863099066", "044251234"], "คั่นด้วย /");
eq(splitPhones("086-309-9066/044-251-234"), ["086-309-9066", "044-251-234"], "คั่นด้วย / ติดกัน");
eq(splitPhones("081 111 2222 หรือ 02-123-4567"), ["081 111 2222", "02-123-4567"], "คั่นด้วย หรือ");
eq(splitPhones("0811112222;0822223333\n0833334444"), ["0811112222", "0822223333", "0833334444"], "; และขึ้นบรรทัด");
eq(splitPhones("   "), [], "ว่าง");

// รูปแบบที่เก็บ
eq(normalizePhone("086-309-9066"), "0863099066", "มือถือมีขีด");
eq(normalizePhone("(044) 251-234"), "044251234", "เบอร์บ้านมีวงเล็บ");
eq(normalizePhone("02 123 4567 ต่อ 12"), "021234567#12", "เบอร์ต่อ (ไทย)");
eq(normalizePhone("02-123-4567 ext. 305"), "021234567#305", "เบอร์ต่อ ext.");
eq(normalizePhone("021234567#9"), "021234567#9", "เบอร์ต่อ #");
eq(normalizePhone("+66 86 309 9066"), "0863099066", "+66 → 0");
eq(normalizePhone("+66 (0)86 309 9066"), "0863099066", "+66 (0)");
eq(normalizePhone("0066863099066"), "0863099066", "0066");
eq(normalizePhone("+86 138 1234 5678"), "+8613812345678", "ต่างประเทศ");
eq(normalizePhone("1677"), "1677", "เบอร์สั้น 4 หลัก");
eq(normalizePhone("1800-123-456"), "1800123456", "1800");
eq(normalizePhone("086-309-9066, 044-25"), null, "สองเบอร์ในค่าเดียว = ผิด (ต้องแยกก่อน)");
eq(normalizePhone("044-25"), null, "สั้นเกิน");
eq(normalizePhone("02-123-4567-8"), null, "02 ยาว 10 หลัก = ผิด");
eq(normalizePhone("0123456789"), null, "01 ไม่ใช่เบอร์ไทย");
eq(normalizePhone("โทร 0863099066"), null, "มีตัวอักษร");
eq(normalizePhone(""), null, "ว่าง");

// แสดงผล
eq(formatPhoneEntry("0863099066"), "086-309-9066", "แสดงมือถือ");
eq(formatPhoneEntry("044251234"), "044-251-234", "แสดงเบอร์ต่างจังหวัด");
eq(formatPhoneEntry("021234567"), "02-123-4567", "แสดงเบอร์กรุงเทพฯ");
eq(formatPhoneEntry("021234567#12"), "02-123-4567 ต่อ 12", "แสดงเบอร์ต่อ");
eq(formatPhoneEntry("1800123456"), "1800-123-456", "แสดง 1800");
eq(formatPhoneEntry("+8613812345678"), "+86 13812345678", "แสดงต่างประเทศ");
eq(phoneMain("021234567#12"), "021234567", "เลขหลักไม่รวมเบอร์ต่อ");
// แปลงไป-กลับได้ค่าเดิม (ฟอร์มแก้ไขแสดงรูปแบบอ่านง่าย แล้วบันทึกกลับ)
for (const v of ["0863099066", "044251234", "021234567#12", "1800123456", "+8613812345678", "1677"]) eq(normalizePhone(formatPhoneEntry(v)), v, `ไป-กลับ ${v}`);

// หลายช่อง → รายการ
eq(parsePhoneList(["086-309-9066, 044-251234", "", "0863099066"]), { phones: ["0863099066", "044251234"], bad: [], tooMany: false }, "ตัดซ้ำ เก็บลำดับ");
eq(parsePhoneList(["0863099066", "044-25"]).bad, ["044-25"], "บอกเบอร์ที่ผิด");
const many = parsePhoneList(["0811111111,0822222222,0833333333,0844444444,0855555555,0866666666"]);
eq([many.phones.length, many.tooMany], [PHONES_MAX, true], "เกินจำนวนสูงสุด");
eq(customerPhones({ phones: [], phone: "0811112222" }), ["0811112222"], "ข้อมูลเก่ามีแค่ phone");
eq(customerPhones({ phones: ["0811112222", "021234567"], phone: "0811112222" }), ["0811112222", "021234567"], "หลายเบอร์");
eq(customerPhones({ phones: [], phone: null }), [], "ไม่มีเบอร์");

// แถวติดต่อในเอกสาร: ทุกเบอร์ + โทรสาร + อีเมล · escape · เอกสารเก่ามีแค่ phone
const html = custContact({ phones: ["086-309-9066", "044-251-234"], fax: "02-123-4568", email: "a&b@x.co.th" });
eq(/โทร<\/span> <span class="nw">086-309-9066<\/span>, <span class="nw">044-251-234<\/span>/.test(html), true, "พิมพ์ทุกเบอร์");
eq(html.includes("โทรสาร</span> 02-123-4568") && html.includes("อีเมล</span> a&amp;b@x.co.th"), true, "โทรสาร + อีเมล (escape)");
eq(custContact({ phone: "081-111-2222" }).includes("081-111-2222"), true, "เอกสารเก่า");
eq(custContact({}), "", "ไม่มีข้อมูลติดต่อ = ไม่พิมพ์แถว");

console.log(`phones: ${n} ข้อผ่าน`);
