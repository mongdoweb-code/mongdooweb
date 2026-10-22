// ตัวเขียนไฟล์ ZIP ขนาดเล็ก (ไม่พึ่งไลบรารีภายนอก) — บีบอัดแบบ deflate ด้วย node:zlib, ชื่อไฟล์ UTF-8
// รองรับไฟล์รวมไม่เกิน 4 GB (ZIP แบบปกติ ไม่ใช่ ZIP64) — พอสำหรับสำรองข้อมูลร้านเป็น CSV
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

export type ZipEntry = { name: string; data: Buffer | string; date?: Date };

function dosTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export function createZip(entries: ZipEntry[]) {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name.replace(/^\/+/, ""), "utf8");
    const raw = typeof e.data === "string" ? Buffer.from(e.data, "utf8") : e.data;
    const comp = deflateRawSync(raw, { level: 9 });
    const useDeflate = comp.length < raw.length;
    const body = useDeflate ? comp : raw;
    const crc = crc32(raw) >>> 0;
    const { time, date } = dosTime(e.date ?? new Date());
    const flags = 0x0800; // ชื่อไฟล์เป็น UTF-8

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(flags, 6);
    lh.writeUInt16LE(useDeflate ? 8 : 0, 8);
    lh.writeUInt16LE(time, 10);
    lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    local.push(lh, name, body);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(0x0314, 4); // made by: UNIX, v2.0
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(flags, 8);
    ch.writeUInt16LE(useDeflate ? 8 : 0, 10);
    ch.writeUInt16LE(time, 12);
    ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE((0o100644 << 16) >>> 0, 38); // สิทธิ์ไฟล์ rw-r--r--
    ch.writeUInt32LE(offset, 42);
    central.push(ch, name);

    offset += lh.length + name.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

/** อ่านไฟล์ ZIP ที่สร้างด้วย createZip (store/deflate, ไม่ใช่ ZIP64) — ใช้ตอนกู้คืนสำรองข้อมูล (scripts/restore-backup.ts) */
export function readZip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error("ไม่ใช่ไฟล์ ZIP");
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("ZIP เสีย (central directory)");
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const body = buf.subarray(dataAt, dataAt + csize);
    const raw = method === 8 ? inflateRawSync(body) : method === 0 ? Buffer.from(body) : null;
    if (!raw) throw new Error(`ZIP: ไม่รองรับวิธีบีบอัด ${method} (${name})`);
    if ((crc32(raw) >>> 0) !== crc) throw new Error(`ZIP เสีย: ${name} (CRC ไม่ตรง)`);
    out.set(name, raw);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
