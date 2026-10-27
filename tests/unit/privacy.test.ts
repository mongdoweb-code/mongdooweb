// ทดสอบหน่วยรอบตรวจซ้ำ 3 (ความเป็นส่วนตัว/หน้าร้าน): ปิดบังข้อมูลตามคำขอลบ PDPA (D7), คัดค้านการตลาด (D8), ไฟล์ส่งออกทั้งร้าน (D9), หน้าแรก (D14)
// รัน: npm run test:unit
import assert from "node:assert/strict";
import { SECRET_COLUMN, csvName, stripSecrets } from "../../src/lib/export-rules";
import { withFeatureProject, withPayOptions } from "../../src/app/(shop)/_lot10/home-chunks";
import { HOME_MAIN } from "../../src/app/(shop)/_markup/home";
import { REDACTED, marketingAllowed, needlesOf, redactDiff, redactEventNote, redactLogNote, scrubText } from "../../src/lib/pdpa-rules";

// ---------- needles / scrubText ----------
const needles = needlesOf(["สมชาย ใจดี", "  somchai@example.com ", "12/3 หมู่ 4", "-", "ab", null, REDACTED]);
assert.deepEqual(needles, ["somchai@example.com", "12/3 หมู่ 4", "สมชาย ใจดี"]); // ยาวก่อน · ตัดค่าสั้น/ว่าง/ขีด/ค่าที่ลบแล้ว
const phones = ["0811112222"];
assert.equal(scrubText("โทร 081-111-2222 หรือ 0811112222 หรือ 081 111 2222", needles, phones), "โทร [ลบแล้ว] หรือ [ลบแล้ว] หรือ [ลบแล้ว]");
assert.equal(scrubText("ส่งให้ SOMCHAI@example.com ที่ 12/3 หมู่ 4 (สมชาย ใจดี)", needles), "ส่งให้ [ลบแล้ว] ที่ [ลบแล้ว] ([ลบแล้ว])");
assert.equal(scrubText("อนุมัติสลิป ยอด 1,200 บาท", needles, phones), "อนุมัติสลิป ยอด 1,200 บาท"); // ข้อความที่ไม่มีข้อมูลบุคคลไม่เปลี่ยน
assert.equal(scrubText("a.b", ["a.b"]), "[ลบแล้ว]"); // อักขระพิเศษใน needle ไม่ทำให้ regex พัง
assert.equal(scrubText("axb", ["a.b"]), "axb");

// ---------- diff ของ AdminLog ----------
const diff = redactDiff({ phone: ["0811112222", "0899999999"], addressLine: ["บ้านเก่า", "บ้านใหม่"], status: ["PAID", "SHIPPED"], trackingNo: ["", "TH123 สมชาย ใจดี"], x: "ไม่ใช่ array" }, needles, phones);
assert.deepEqual(diff, { phone: [REDACTED, REDACTED], addressLine: [REDACTED, REDACTED], status: ["PAID", "SHIPPED"], trackingNo: ["", "TH123 [ลบแล้ว]"] });
assert.deepEqual(redactDiff({ email: [null, "a@b.co"] }, []), { email: [null, REDACTED] }); // ค่าว่างคงว่าง
assert.equal(redactDiff(null, []), null);
assert.equal(redactDiff(["x"], []), null);

// ---------- ข้อความประวัติคำสั่งซื้อ / บันทึกหลังบ้าน ----------
assert.equal(redactEventNote("EDITED", "เบอร์: 0811112222 → 0899999999 · ที่อยู่: บ้านเก่า → บ้านใหม่", needles, phones), REDACTED);
assert.equal(redactEventNote("CANCELLED", "ลูกค้ายกเลิก: ย้ายบ้าน", needles), REDACTED);
assert.equal(redactEventNote("NOTE", "โทรหาคุณสมชาย", needles), REDACTED);
assert.equal(redactEventNote("APPROVED", "ยอดตรง โทรแจ้ง 0811112222 แล้ว", needles, phones), "ยอดตรง โทรแจ้ง [ลบแล้ว] แล้ว");
assert.equal(redactEventNote("SHIPPED", null, needles), null);
assert.equal(redactLogNote("ORDER", "MDW-1: แก้ไขข้อมูล — ชื่อ: ก → ข", "MDW-1", needles), `MDW-1: ${REDACTED}`);
assert.equal(redactLogNote("NOTE", "เพิ่มโน้ตลูกค้า: ชอบไฟสีวอร์ม", "ลูกค้า 0012", needles), `ลูกค้า 0012: ${REDACTED}`);
assert.equal(redactLogNote("ORDER", "MDW-1: อนุมัติการชำระเงิน (สมชาย ใจดี)", "MDW-1", needles), "MDW-1: อนุมัติการชำระเงิน ([ลบแล้ว])");

// ---------- คัดค้านการตลาด ----------
const blocked = { phones: new Set(["0822223333"]), emails: new Set(["no@mail.com"]) };
assert.equal(marketingAllowed({ marketingOptOut: false, phone: "0811112222", email: null }, blocked), true);
assert.equal(marketingAllowed({ marketingOptOut: true, phone: "0811112222", email: null }, blocked), false);
assert.equal(marketingAllowed({ marketingOptOut: false, phone: "082-222-3333", email: null }, blocked), false); // เบอร์มีขีดก็ตรง
assert.equal(marketingAllowed({ marketingOptOut: false, phone: null, email: "NO@mail.com" }, blocked), false);

// ---------- ไฟล์ส่งออกทั้งร้าน ----------
assert.equal(csvName("Order"), "orders.csv");
assert.equal(csvName("Admin"), "admin_users.csv");
assert.equal(csvName("SalesDocument"), "sales_documents.csv");
assert.equal(csvName("CouponRedemption"), "coupon_redemptions.csv"); // ตารางรอบ 3 ใช้ชื่อจากชื่อตาราง
assert.equal(csvName("DocSlip"), "doc_slips.csv");
for (const k of ["passwordHash", "totpSecret", "backupCodes", "publicToken", "apiKeySecret"]) assert.ok(SECRET_COLUMN.test(k), k);
for (const k of ["totpEnabled", "mustChangePassword", "backupRetentionDays", "ipHash", "username"]) assert.ok(!SECRET_COLUMN.test(k), k);
assert.deepEqual(stripSecrets([{ id: "1", username: "a", passwordHash: "x", totpSecret: "y", backupCodes: [], totpEnabled: true }]), [{ id: "1", username: "a", totpEnabled: true }]);

// ---------- หน้าแรก (D14) ----------
assert.ok(!HOME_MAIN.includes("TODO"), "ไม่มี TODO ค้างในหน้าแรก");
const proj = [{ title: "สระ <โรงแรม> A&B", kind: "สระว่ายน้ำ", location: "ภูเก็ต", cover: { full: "/media/p/1.webp", sm: "/media/p/1-sm.webp" } }];
const why = withFeatureProject(HOME_MAIN, proj);
assert.ok(why.includes('<a class="feature-visual reveal has-img" href="/projects"'));
assert.ok(why.includes('src="/media/p/1.webp"') && why.includes("สระ &lt;โรงแรม&gt; A&amp;B") && why.includes("สระว่ายน้ำ · ภูเก็ต"));
assert.ok(!why.includes("ภาพผลงาน / งานติดตั้งจากลูกค้า"));
assert.equal(withFeatureProject(HOME_MAIN, []), HOME_MAIN); // ไม่มีผลงาน → ภาพเดิม
assert.equal(withFeatureProject(HOME_MAIN, [{ ...proj[0], cover: null }]), HOME_MAIN); // ผลงานไม่มีรูป → ภาพเดิม
assert.equal(withPayOptions(HOME_MAIN, { codEnabled: false, pickupEnabled: false }), HOME_MAIN);
const pay = withPayOptions(HOME_MAIN, { codEnabled: true, pickupEnabled: false });
assert.ok(pay.includes('data-pay="cod"') && !pay.includes('data-pay="pickup"'));
const payRow = pay.slice(pay.indexOf('<div class="pay-row'), pay.indexOf("</div>", pay.indexOf('<div class="pay-row')));
assert.ok(payRow.includes("QR PromptPay") && payRow.includes("เก็บเงินปลายทาง"), "ชิปอยู่ในแถวช่องทางชำระเงิน");
assert.ok(withPayOptions(HOME_MAIN, { codEnabled: true, pickupEnabled: true }).includes('data-pay="pickup"'));

console.log("privacy unit: ok");
