// ทดสอบหน่วย: คำเตือนการต่อไฟในหน้าสินค้า (src/lib/supply-note.ts) — รัน: npm run test:unit
import assert from "node:assert/strict";
import { cleanSupplyNote, isLowVoltageText, isMainsText, parseSupplyType, supplyNoteFor, SUPPLY_NOTE_MAX } from "../../src/lib/supply-note";

let n = 0;
const eq = (a: unknown, b: unknown, msg: string) => { assert.deepEqual(a, b, msg); n++; };
const base = { supplyType: "AUTO" as const, supplyNote: null, isAccessory: false, includesPsu: false, categorySlug: "garden-light", text: "" };
const kind = (o: Partial<Parameters<typeof supplyNoteFor>[0]>) => supplyNoteFor({ ...base, ...o })?.kind ?? null;

// ตรวจข้อความไฟบ้าน / แรงดันต่ำ
eq([isMainsText("ใช้ต่อกับไฟบ้าน AC 85-265V"), isMainsText("AC220V"), isMainsText("Input 100-240V AC"), isMainsText("AC: 85–265 V")], [true, true, true, true], "ไฟบ้าน");
eq([isMainsText("DC12V"), isMainsText("ห้ามต่อไฟบ้าน 220V โดยตรง"), isMainsText("AC24V"), isMainsText("AC12V")], [false, false, false, false], "ไม่ใช่ไฟบ้าน (AC24V = แรงดันต่ำ)");
eq([isLowVoltageText("DC12V"), isLowVoltageText("24V DC"), isLowVoltageText("12VDC"), isLowVoltageText("AC 220V")], [true, true, true, false], "แรงดันต่ำ");

// อัตโนมัติ = พฤติกรรมเดิม + ไฟบ้านจากสเปก
eq(kind({}), "low", "หมวดไฟสวน ไม่ระบุ = แรงดันต่ำ (เดิม)");
eq(kind({ includesPsu: true }), "kit", "ชุดพร้อมใช้ (เดิม)");
eq(kind({ text: "สปอตไลท์ 48W ใช้ต่อกับไฟบ้าน AC 85-265V" }), "mains", "สเปก AC 85-265V = ไฟบ้าน");
eq(kind({ text: "Input AC220V Output DC12V" }), "low", "มีทั้ง AC และ DC12V = ยังเป็นแรงดันต่ำ");
eq(kind({ categorySlug: "strip-light" }), null, "หมวดอื่นไม่แสดง (เดิม)");
eq(kind({ isAccessory: true }), null, "อุปกรณ์เสริมไม่แสดง (เดิม)");

// ตั้งเองรายสินค้า
eq(kind({ supplyType: "MAINS" }), "mains", "เลือกไฟบ้าน");
eq(kind({ supplyType: "MAINS", categorySlug: "strip-light" }), "mains", "เลือกเองแสดงได้ทุกหมวด");
eq(kind({ supplyType: "LOW_VOLTAGE", text: "AC 85-265V" }), "low", "เลือกแรงดันต่ำชนะการเดา");
eq(kind({ supplyType: "LOW_VOLTAGE", includesPsu: true }), "kit", "แรงดันต่ำ + ชุดพร้อมใช้");
eq(kind({ supplyType: "HIDDEN" }), null, "ไม่แสดง");
eq(kind({ supplyType: "HIDDEN", supplyNote: "ข้อความ" }), null, "ไม่แสดง แม้มีข้อความ");
eq(supplyNoteFor({ ...base, supplyNote: "  ต่อไฟบ้านได้\r\n\r\n\r\nให้ช่างติดตั้ง  " }), { kind: "custom", lead: "ต่อไฟบ้านได้\n\nให้ช่างติดตั้ง", strong: "" }, "ข้อความเฉพาะสินค้าแทนมาตรฐาน");
eq(kind({ supplyNote: "เฉพาะรุ่นนี้", categorySlug: "strip-light" }), "custom", "ข้อความเฉพาะแสดงได้ทุกหมวด");
eq(supplyNoteFor({ ...base, supplyType: "MAINS" }), { kind: "mains", lead: "ต่อไฟบ้าน 220V ได้โดยตรง · ", strong: "ควรให้ช่างไฟติดตั้ง" }, "ข้อความไฟบ้านมาตรฐาน");

// ค่าจากฟอร์ม
eq([parseSupplyType("MAINS"), parseSupplyType("x"), parseSupplyType(undefined)], ["MAINS", "AUTO", "AUTO"], "ประเภทที่ไม่รู้จัก = อัตโนมัติ");
eq(cleanSupplyNote("x".repeat(400)).length, SUPPLY_NOTE_MAX, "ตัดความยาว");
eq(cleanSupplyNote("   \n  "), "", "ช่องว่างล้วน = ไม่มีข้อความ");

console.log(`supply-note: ผ่าน ${n} ข้อ`);
