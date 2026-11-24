// GET /admin/orders.csv — ส่งออกคำสั่งซื้อตามตัวกรองปัจจุบัน (มี BOM ให้ Excel อ่านภาษาไทยได้)
import { RANGES, STATUS_LABEL, TABS, bkkToday, listOrders, orderSpan, parseFilter } from "@/lib/admin-orders";
import { routeAdmin } from "@/lib/auth";
import { formatPhone } from "@/lib/orders";
import { prisma } from "@/lib/prisma";

// กัน CSV/formula injection: ค่าที่ขึ้นต้นด้วย = + - @ ใส่ ' นำหน้า
const q = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
};

export async function GET(req: Request) {
  const admin = await routeAdmin();
  if (admin instanceof Response) return admin;
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const f = { ...parseFilter(sp), page: 1, size: 10_000 };
  const { rows } = await listOrders(f);
  const orders = await prisma.order.findMany({
    where: { orderNo: { in: rows.map((r) => r.orderNo) } },
    include: { items: true },
    orderBy: { createdAt: "asc" },
  });
  const head = ["เลขที่", "วันที่", "สถานะ", "ชื่อผู้รับ", "เบอร์โทร", "ที่อยู่", "รหัสไปรษณีย์", "รายการ", "วิธีส่ง", "ยอดรวม", "ขนส่ง", "เลขพัสดุ", "หมายเหตุ", "การชำระเงิน", "คูปอง", "ส่วนลด", "ค่าธรรมเนียม COD", "ค่าส่งพื้นที่ห่างไกล"];
  const lines = orders.map((o) =>
    [
      o.orderNo,
      o.createdAt.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }),
      STATUS_LABEL[o.status],
      o.customerName,
      formatPhone(o.phone),
      [o.addressLine, o.subdistrict, o.district, o.province].join(" "),
      o.postalCode,
      o.items.map((i) => `${i.nameSnapshot} x${i.qty}`).join(" | "),
      o.shippingName,
      (o.totalSatang / 100).toFixed(2),
      o.carrier,
      o.trackingNo,
      o.note,
      o.paymentMethod === "COD" ? "เก็บเงินปลายทาง" : "โอน/พร้อมเพย์",
      o.couponCode,
      (o.discountSatang / 100).toFixed(2),
      (o.codFeeSatang / 100).toFixed(2),
      (o.remoteFeeSatang / 100).toFixed(2),
    ].map(q).join(","),
  );
  // หัวไฟล์: ตัวกรอง · ท้ายไฟล์: ยอดรวม/เฉลี่ย ไม่นับคำสั่งซื้อที่ยกเลิก — ตรงกับการ์ดยอดรวมในหน้าคำสั่งซื้อ
  const money = (s: number) => (s / 100).toFixed(2);
  const counted = orders.filter((o) => o.status !== "CANCELLED");
  const sum = (k: "totalSatang" | "discountSatang" | "codFeeSatang" | "remoteFeeSatang") => counted.reduce((a, o) => a + o[k], 0);
  const pad = (cells: unknown[]) => [...cells, ...Array(Math.max(0, head.length - cells.length)).fill("")].map(q).join(",");
  const span = orderSpan(f, bkkToday());
  const dmy = (ymd: string) => ymd.split("-").reverse().join("/");
  const at = new Date().toLocaleString("en-GB", { timeZone: "Asia/Bangkok", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "");
  const chips = [
    TABS.find(([k]) => k === f.tab)![1],
    f.range !== "all" ? `${RANGES[f.range]}${span ? ` (${dmy(span.from)} – ${dmy(span.to)})` : ""}` : "",
    f.q ? `ค้นหา “${f.q}”` : "",
  ].filter(Boolean);
  const cancelled = orders.length - counted.length;
  const top = [
    pad(["คำสั่งซื้อหน้าเว็บ — ส่งออกจากหลังบ้าน"]),
    pad([`ตัวกรอง: ${chips.join(" · ")} · ${cancelled ? `ไม่รวมที่ยกเลิก ${cancelled} รายการในยอดรวม` : "ไม่มีรายการที่ยกเลิก"} · ส่งออกเมื่อ ${at}`]),
  ];
  const bottom = [
    pad([]),
    pad([`ยอดรวม (${counted.length} คำสั่งซื้อ)`, "", "", "", "", "", "", "", "", money(sum("totalSatang")), "", "", "", "", "", money(sum("discountSatang")), money(sum("codFeeSatang")), money(sum("remoteFeeSatang"))]),
    pad(["เฉลี่ยต่อคำสั่งซื้อ", "", "", "", "", "", "", "", "", money(counted.length ? Math.round(sum("totalSatang") / counted.length) : 0)]),
  ];
  await prisma.adminLog.create({ data: { type: "ORDERS_EXPORT", note: `ส่งออก CSV ${orders.length} รายการ`, adminId: admin.id } });
  const name = `orders-${f.tab.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response("﻿" + [...top, head.map(q).join(","), ...lines, ...bottom].join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
