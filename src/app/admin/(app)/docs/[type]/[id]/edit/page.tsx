// /admin/docs/:type/new/edit (สร้างใหม่, ?customer=id) และ /admin/docs/:type/:id/edit (แก้ฉบับร่าง)
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { docDateTime, fromYmd, ymdBkk } from "@/lib/doc-calc";
import { DOC_META } from "@/lib/doc-render";
import { CREDIT_REASONS, LINKED_WHERE, quoteEditBlock, DOC_INCLUDE, PAY_METHODS, UNITS, asSnap, custSnapshot, defaultTerms, docPath, isDocType, refLine, shopHead, todayYmd, ymdOf } from "@/lib/docs";
import { CARRIERS } from "@/lib/admin-orders";
import { parseTiers, unitPriceSatang } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { DocEditor, type EditorInit } from "../../../DocEditor";

export const instant = false;

export default async function DocEditPage({ params, searchParams }: PageProps<"/admin/docs/[type]/[id]/edit">) {
  const admin = await requireAdmin();
  // ต้นทุน/กำไรแสดงเฉพาะเจ้าของร้าน (เหมือนรายงานกำไร) — ไม่ส่งไปเบราว์เซอร์ของพนักงาน
  const owner = admin.role === "OWNER";
  const [{ type, id }, sp] = await Promise.all([params, searchParams]);
  if (!isDocType(type)) notFound();
  const s = await getSettings();
  const today = todayYmd();
  const plus = (n: number) => ymdBkk(new Date(fromYmd(today).getTime() + n * 864e5));

  let init: EditorInit;
  let ref = "";
  /** แก้ใบที่ออกแล้วด้วยเลขที่เดิม */
  let sameNo = "";
  /** ฉบับร่างแก้ไขที่บันทึกทับใบเดิมได้ (เลขที่ของใบเดิม) */
  let overwriteNo = "";
  if (id === "new") {
    if (type === "CREDIT_NOTE") redirect(`/admin/docs/RECEIPT?err=${encodeURIComponent("ใบลดหนี้สร้างจากหน้าใบเสร็จรับเงิน — เปิดใบเสร็จแล้วกด \"ออกใบลดหนี้ / คืนเงิน\"")}`);
    const cid = typeof sp.customer === "string" ? sp.customer : "";
    const c = cid ? await prisma.customer.findUnique({ where: { id: cid } }) : null;
    init = {
      type, customerId: c?.id ?? "", customer: c ? custSnapshot(c) : null, issueDate: today,
      validUntil: type === "QUOTATION" ? plus(s.quoteValidDays) : "", dueDate: type === "INVOICE" ? plus(s.invoiceDueDays) : "",
      items: [], discount: "", vatMode: s.vatEnabled ? s.vatMode : "NONE", signDate: "",
      // ค่าเริ่มต้นของเอกสารใหม่: มีลายเซ็น/ตราในตั้งค่า = ใส่ · เลขบัญชีตามตั้งค่าร้าน
      signImage: !!(s.signatureKey || s.stampKey), showBank: s.quotePayInfo,
      paymentMethod: type === "QUOTATION" ? "โอนเงินผ่านธนาคาร" : PAY_METHODS[0], paymentTerms: defaultTerms(s, type), carrier: "", note: "", internalNote: "",
    };
  } else {
    const d = await prisma.salesDocument.findUnique({ where: { id }, include: DOC_INCLUDE });
    if (!d || d.type !== type) notFound();
    if (d.status !== "DRAFT") {
      // ใบเสนอราคาที่ออกแล้ว: แก้ไขด้วยเลขที่เดิมได้ (รอตอบรับ + ยังไม่มีเอกสารต่อเนื่อง)
      const block = d.type === "QUOTATION" ? quoteEditBlock(d, await prisma.salesDocument.count({ where: { sourceId: d.id, ...LINKED_WHERE } })) : "เอกสารที่ออกแล้วแก้ไขไม่ได้ — ยกเลิกแล้วออกใหม่";
      if (block) redirect(`${docPath(d)}?err=${encodeURIComponent(block)}`);
      sameNo = d.docNo ?? "";
    } else if (d.type === "QUOTATION" && d.source?.type === "QUOTATION" && d.source.docNo) {
      // ฉบับร่างแก้ไข: บันทึกทับใบเดิม (เลขที่เดิม) ได้ถ้าใบเดิมยังแก้ได้
      const src = d.source;
      if (!quoteEditBlock(src, await prisma.salesDocument.count({ where: { sourceId: src.id, ...LINKED_WHERE } }))) overwriteNo = src.docNo ?? "";
    }
    ref = refLine(d);
    const c = d.customerId ? await prisma.customer.findUnique({ where: { id: d.customerId } }) : null;
    init = {
      id: d.id, type, customerId: c?.id ?? "", customer: c ? custSnapshot(c) : asSnap(d.customerSnapshot).name ? asSnap(d.customerSnapshot) : null,
      issueDate: ymdOf(d.issueDate) || today, validUntil: ymdOf(d.validUntil), dueDate: ymdOf(d.dueDate),
      items: d.items.map((i) => ({ productId: i.productId ?? "", sku: i.sku ?? "", name: i.name, detail: i.detail ?? "", unit: i.unit, qty: String(i.qtyMilli / 1000), price: (i.priceSatang / 100).toFixed(2), discount: i.discountSatang ? (i.discountSatang / 100).toFixed(2) : "", image: i.image })),
      discount: d.discountSatang ? (d.discountSatang / 100).toFixed(2) : "", vatMode: s.vatEnabled ? d.vatMode : "NONE", signDate: ymdOf(d.signDate),
      signImage: d.signImage, showBank: d.showBank, ...(sameNo ? { docNo: sameNo } : {}), ...(overwriteNo ? { overwriteNo } : {}),
      paymentMethod: d.paymentMethod ?? "", paymentTerms: d.paymentTerms ?? "", carrier: d.carrier ?? "", note: d.note ?? "", internalNote: d.internalNote ?? "",
    };
    if (type === "CREDIT_NOTE" && d.source) {
      const prev = await prisma.salesDocument.aggregate({ where: { sourceId: d.source.id, type: "CREDIT_NOTE", status: "ISSUED", NOT: { id: d.id } }, _sum: { grandSatang: true } });
      Object.assign(init, { creditReason: d.creditReason ?? "", creditOriginal: d.source.grandSatang, creditMax: d.source.grandSatang - (prev._sum.grandSatang ?? 0) });
    }
  }
  const [customers, products] = await Promise.all([
    prisma.customer.findMany({ orderBy: { code: "desc" }, take: 3000 }),
    prisma.product.findMany({ orderBy: [{ isActive: "desc" }, { isService: "desc" }, { name: "asc" }], select: { id: true, sku: true, name: true, unit: true, priceSatang: true, salePriceSatang: true, saleStartsAt: true, saleEndsAt: true, tierPrices: true, isService: true, isActive: true, images: true, trackStock: true, stock: true, inStock: true, costSatang: true, category: { select: { nameTh: true } } }, take: 5000 }),
  ]);
  return (
    <DocEditor
      init={init}
      title={id === "new" ? `สร้าง${DOC_META[type].th.split(" /")[0]}` : sameNo ? `แก้ไข${DOC_META[type].th.split(" /")[0]} ${sameNo}` : `แก้ไข${DOC_META[type].th.split(" /")[0]} (ฉบับร่าง)`}
      back={id === "new" ? `/admin/docs/${type}` : `/admin/docs/${type}/${id}`}
      customers={customers.map((c) => ({ id: c.id, snap: custSnapshot(c) }))}
      // ราคาตั้งต้น = ราคาขายจริง (ราคาลดตามช่วงเวลา) + ราคาขายส่งตามจำนวน — แก้ได้ในตัวแก้ไข
      products={products.map((p) => {
        const tiers = parseTiers(p.tierPrices);
        return {
          id: p.id, sku: p.sku, name: p.name, unit: p.unit, price: unitPriceSatang(p), service: p.isService, off: !p.isActive, cat: p.category.nameTh,
          // stock: จำนวนคงเหลือเมื่อนับสต็อก · null = ไม่นับ · out = หมด
          stock: p.isService ? null : p.trackStock ? p.stock : null, out: !p.isService && (p.trackStock ? p.stock <= 0 : !p.inStock),
          ...(owner && p.costSatang != null ? { cost: p.costSatang } : {}),
          ...(tiers.length ? { tiers } : {}), ...(p.images.length ? { imgs: p.images.slice(0, 8) } : {}),
        };
      })}
      shop={shopHead(s)}
      vatEnabled={s.vatEnabled}
      vatRateBp={s.vatRateBp}
      refText={ref}
      printedAt={docDateTime(new Date(), s.dateEra)}
      lists={{ methods: PAY_METHODS, carriers: CARRIERS, units: UNITS, reasons: CREDIT_REASONS }}
      showCost={owner}
    />
  );
}
