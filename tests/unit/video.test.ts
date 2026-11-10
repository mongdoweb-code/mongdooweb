// ทดสอบหน่วย: ตรวจไฟล์วิดีโอสินค้า (MP4 + ความยาวจาก mvhd) และรูปแบบ key — รัน: npm run test:unit
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isMp4, isPosterKey, isVideoKey, mp4Duration } from "../../src/lib/video";

let n = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n++; };

const clip12 = readFileSync("tests/fixtures/clip-12s.mp4");
const clip5 = readFileSync("tests/fixtures/clip-5s.mp4");
ok(isMp4(clip12) && isMp4(clip5), "ไฟล์ทดสอบเป็น MP4");
ok(Math.abs(mp4Duration(clip12)! - 12) < 0.2, "อ่านความยาว 12 วินาที");
ok(Math.abs(mp4Duration(clip5)! - 5) < 0.2, "อ่านความยาว 5 วินาที");
ok(!isMp4(readFileSync("tests/fixtures/slip.png")), "PNG ไม่ใช่ MP4");
ok(mp4Duration(Buffer.from("not a video at all")) === null, "ไฟล์เสียคืน null");
ok(mp4Duration(clip12.subarray(0, 40)) === null, "ไฟล์ถูกตัดไม่ทำให้พัง");

// mvhd version 1 (64-bit) — สร้าง moov เอง: timescale 1000, duration 30500 → 30.5 s
const box = (type: string, body: Buffer) => { const h = Buffer.alloc(8); h.writeUInt32BE(8 + body.length); h.write(type, 4, "latin1"); return Buffer.concat([h, body]); };
const mvhd1 = Buffer.alloc(4 + 8 + 8 + 4 + 8); mvhd1.writeUInt8(1, 0); mvhd1.writeUInt32BE(1000, 20); mvhd1.writeBigUInt64BE(BigInt(30500), 24);
const v1 = Buffer.concat([box("ftyp", Buffer.from("isom\0\0\0\0isom", "latin1")), box("moov", box("mvhd", mvhd1))]);
ok(isMp4(v1) && mp4Duration(v1) === 30.5, "mvhd version 1");

ok(isVideoKey("videos/2026/11/abc123.mp4") && !isVideoKey("videos/2026/11/../x.mp4") && !isVideoKey("products/2026/11/a.mp4"), "isVideoKey");
ok(isPosterKey("videos/2026/11/abc123.webp") && !isPosterKey("videos/2026/11/abc123.mp4") && !isPosterKey(null), "isPosterKey");
console.log(`video: ${n} ข้อผ่าน`);
