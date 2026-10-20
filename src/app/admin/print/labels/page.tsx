// /admin/print/labels — ใบปะหน้าส่งของจากคำสั่งซื้อ (?orders=MDW-…,MDW-… หรือ ?status=PAID = ทุกออเดอร์ที่รอจัดส่ง) หรือจากเอกสาร (?doc=id)
// ตัวเลือก: size=A6|A4, boxes=จำนวนกล่อง, cod=บาท, marks=fragile,noThrow,upright, items=1
import { requireAdmin } from "@/lib/auth";
import { addrText } from "@/lib/doc-calc";
import { MARKS, labelSetHtml, type LabelData, type LabelOpts, type MarkKey } from "@/lib/doc-render";
import { DOC_INCLUDE, docLabel, docPath, senderOf } from "@/lib/docs";
import { formatPhone } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { PrintLabels } from "../PrintClient";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function PrintLabelsPage({ searchParams }: PageProps<"/admin/print/labels">) {
  await requireAdmin();
  const sp = await searchParams;
  const s = await getSettings();
  const list: LabelData[] = [];
  let back = "/admin";
  const docId = one(sp.doc);
  if (docId) {
    const d = await prisma.salesDocument.findUnique({ where: { id: docId }, include: DOC_INCLUDE });
    if (d) {
      const services = new Set((await prisma.product.findMany({ where: { isService: true }, select: { sku: true } })).map((p) => p.sku));
      list.push(docLabel(d, services));
      back = docPath(d);
    }
  } else {
    const nos = one(sp.orders).split(",").map((x) => x.trim()).filter(Boolean).slice(0, 200);
    const where = nos.length ? { orderNo: { in: nos } } : one(sp.status) === "PAID" ? { status: "PAID" as const } : null;
    if (where) {
      const orders = await prisma.order.findMany({ where, include: { items: true }, orderBy: { createdAt: "asc" }, take: 200 });
      for (const o of orders)
        list.push({
          ref: o.orderNo, name: o.customerName, phone: formatPhone(o.phone),
          addr: addrText({ line: o.addressLine, sub: o.subdistrict, dist: o.district, prov: o.province }, { noZip: true }), zip: o.postalCode,
          carrier: o.trackingNo ? `${o.carrier ?? ""} · ${o.trackingNo}` : o.shippingName, items: o.items.map((i) => ({ name: i.nameSnapshot, qtyMilli: i.qty * 1000 })),
        });
      back = nos.length === 1 ? `/admin?tab=ALL&open=${nos[0]}` : "/admin?tab=PAID";
    }
  }
  const markList = one(sp.marks) ? one(sp.marks).split(",") : Object.keys(MARKS);
  const opts: LabelOpts = {
    size: one(sp.size) === "A4" ? "A4" : "A6",
    boxes: Math.min(50, Math.max(1, Math.round(Number(one(sp.boxes)) || 1))),
    codSatang: Math.max(0, Math.round((Number(one(sp.cod)) || 0) * 100)),
    marks: Object.fromEntries((Object.keys(MARKS) as MarkKey[]).map((k) => [k, markList.includes(k)])) as LabelOpts["marks"],
    showItems: one(sp.items) === "1",
  };
  if (!list.length)
    return (
      <main className="main"><div className="empty"><b>ไม่พบรายการสำหรับพิมพ์ใบปะหน้า</b><p><a className="link" href={back}>กลับ</a></p></div></main>
    );
  const html = labelSetHtml(list, opts, senderOf(s));
  return <PrintLabels html={html} size={opts.size} count={list.length * opts.boxes} refText={list.length === 1 ? list[0].ref : `${list.length}-รายการ`} back={back} auto={one(sp.auto) === "1"} />;
}
