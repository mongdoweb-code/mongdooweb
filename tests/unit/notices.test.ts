// ข้อความแจ้งเตือนหน้าสินค้า: ตัวหนา · ตรวจข้อมูล · กฎแสดงอัตโนมัติ/เลือกเอง/ปิดเฉพาะตัว (src/lib/notices.ts)
import assert from "node:assert/strict";
import { NOTICE_ICONS, cleanNotice, noticeNameFrom, noticeParts, noticesFor, parseProductNotices, type NoticeRow } from "../../src/lib/notices";

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => { assert.deepEqual(a, b, m); n++; };

eq(noticeParts("ไฟแรงดันต่ำ · **ห้ามต่อไฟบ้าน 220V โดยตรง**"), [{ t: "ไฟแรงดันต่ำ · ", b: false }, { t: "ห้ามต่อไฟบ้าน 220V โดยตรง", b: true }], "ตัวหนา");
eq(noticeParts("<b>x</b> ** ไม่ปิด"), [{ t: "<b>x</b> ** ไม่ปิด", b: false }], "ไม่มี HTML · ** เดี่ยวเป็นข้อความธรรมดา");
eq(noticeNameFrom("ไฟแรงดันต่ำ ต้องต่อผ่านหม้อแปลง · **ห้าม**"), "ไฟแรงดันต่ำ ต้องต่อผ่านหม้อแปลง", "ชื่ออัตโนมัติ");

const cats = new Set(["c1", "c2"]);
eq(cleanNotice({ text: "  " }, cats).fields, ["text"], "ข้อความว่าง");
eq(cleanNotice({ text: "abc **x" }, cats).fields, ["text"], "** ไม่ครบคู่");
eq(cleanNotice({ text: "x".repeat(230) }, cats).fields, ["text"], "ยาวเกิน");
eq(cleanNotice({ text: "ทดสอบ", scope: "CATEGORIES", categoryIds: ["zz"] }, cats).fields, ["categories"], "หมวดต้องมีจริง");
const ok = cleanNotice({ text: "ใช้ไฟ  AC 220V", tone: "BAD", icon: "<x>", scope: "CATEGORIES", categoryIds: ["c1", "c1", "zz"] }, cats).data!;
eq([ok.tone, ok.icon, ok.categoryIds, ok.name, ok.text], ["WARNING", "info", ["c1"], "ใช้ไฟ AC 220V", "ใช้ไฟ AC 220V"], "ค่าเริ่มต้น + ตัดซ้ำ");
eq(cleanNotice({ text: "abc", scope: "MANUAL", categoryIds: ["c1"] }, cats).data!.categoryIds, [], "เลือกเองไม่เก็บหมวด");
eq(NOTICE_ICONS.every((i) => /^(<(path|circle|rect) [^<>]*\/>)+$/.test(i.path)), true, "ไอคอนเป็น SVG ล้วน");

const row = (id: string, x: Partial<NoticeRow> = {}): NoticeRow => ({ id, name: id, text: id, tone: "INFO", icon: "info", scope: "MANUAL", categoryIds: [], skipAccessory: true, isActive: true, sortOrder: 0, ...x });
const lib = [row("all", { scope: "ALL" }), row("cat", { scope: "CATEGORIES", categoryIds: ["c1"] }), row("man"), row("off", { isActive: false }), row("acc", { scope: "ALL", skipAccessory: false })];
const ids = (p: Parameters<typeof noticesFor>[1]) => noticesFor(lib, p).map((x) => x.id);
eq(ids({ categoryId: "c1", isAccessory: false, noticeIds: [], noticeOff: [] }), ["all", "cat", "acc"], "อัตโนมัติ ทุกสินค้า + หมวด");
eq(ids({ categoryId: "c2", isAccessory: false, noticeIds: ["man", "off"], noticeOff: ["all"] }), ["man", "acc"], "เลือกเอง · ปิดเฉพาะตัว · ปิดใช้งานไม่แสดง");
eq(ids({ categoryId: "c1", isAccessory: true, noticeIds: [], noticeOff: [] }), ["acc"], "อุปกรณ์เสริมข้ามข้อความที่ตั้งไว้");
eq(ids({ categoryId: "c1", isAccessory: false, noticeIds: ["cat"], noticeOff: ["cat"] }), ["all", "cat", "acc"], "เลือกเองชนะการปิด");
eq(noticesFor(lib, { categoryId: "c1", isAccessory: false, noticeIds: [], noticeOff: [] })[0], { id: "all", text: "all", tone: "INFO", icon: "info" }, "ส่งเฉพาะที่หน้าร้านใช้");

const known = new Set(["a", "b"]);
eq(parseProductNotices('{"ids":["a","x","a"],"off":["b",1]}', known), { noticeIds: ["a"], noticeOff: ["b"] }, "รับเฉพาะ id ที่มีจริง");
eq(parseProductNotices("{bad", known), null, "JSON เสีย");
console.log(`notices: ผ่าน ${n} ข้อ`);
