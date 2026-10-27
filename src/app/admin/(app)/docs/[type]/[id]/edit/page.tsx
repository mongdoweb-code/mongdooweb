// /admin/docs/:type/new/edit (สร้างใหม่, ?customer=id) และ /admin/docs/:type/:id/edit (แก้ฉบับร่าง)
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { docDateTime, fromYmd, ymdBkk } from "@/lib/doc-calc";
import { DOC_META } from "@/lib/doc-render";
import { DOC_INCLUDE, PAY_METHODS, UNITS, asSnap, custSnapshot, defaultTerms, docPath, isDocType, refLine, shopHead, todayYmd, ymdOf } from "@/lib/docs";
import { CARRIERS } from "@/lib/admin-orders";
import { parseTiers, unitPriceSatang } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { DocEditor, type EditorInit } from "../../../DocEditor";

export const instant = false;

export default async function DocEditPage({ params, searchParams }: PageProps<"/admin/docs/[type]/[id]/edit">) {
  await requireAdmin();
  const [{ type, id }, sp] = await Promise.all([params, searchParams]);
  if (!isDocType(type)) notFound();
  const s = await getSettings();
  const today = todayYmd();
  const plus = (n: number) => ymdBkk(new Date(fromYmd(today).getTime() + n * 864e5));

  let init: EditorInit;
  let ref = "";
  if (id === "new") {
    const cid = typeof sp.customer === "string" ? sp.customer : "";
    const c = cid ? await prisma.customer.findUnique({ where: { id: cid } }) : null;
    init = {
      type, customerId: c?.id ?? "", customer: c ? custSnapshot(c) : null, issueDate: today,
      validUntil: type === "QUOTATION" ? plus(s.quoteValidDays) : "", dueDate: type === "INVOICE" ? plus(s.invoiceDueDays) : "",
      items: [], discount: "", vatMode: s.vatEnabled ? s.vatMode : "NONE",
      paymentMethod: type === "QUOTATION" ? "โอนเงินผ่านธนาคาร" : PAY_METHODS[0], paymentTerms: defaultTerms(s, type), carrier: "", note: "", internalNote: "",
    };
  } else {
    const d = await prisma.salesDocument.findUnique({ where: { id }, include: DOC_INCLUDE });
    if (!d || d.type !== type) notFound();
    if (d.status !== "DRAFT") redirect(`${docPath(d)}?err=${encodeURIComponent("เอกสารที่ออกแล้วแก้ไขไม่ได้ — ใช้สร้างฉบับแก้ไข หรือยกเลิกแล้วออกใหม่")}`);
    ref = refLine(d);
    const c = d.customerId ? await prisma.customer.findUnique({ where: { id: d.customerId } }) : null;
    init = {
      id: d.id, type, customerId: c?.id ?? "", customer: c ? custSnapshot(c) : asSnap(d.customerSnapshot).name ? asSnap(d.customerSnapshot) : null,
      issueDate: ymdOf(d.issueDate) || today, validUntil: ymdOf(d.validUntil), dueDate: ymdOf(d.dueDate),
      items: d.items.map((i) => ({ productId: i.productId ?? "", sku: i.sku ?? "", name: i.name, detail: i.detail ?? "", unit: i.unit, qty: String(i.qtyMilli / 1000), price: (i.priceSatang / 100).toFixed(2), discount: i.discountSatang ? (i.discountSatang / 100).toFixed(2) : "" })),
      discount: d.discountSatang ? (d.discountSatang / 100).toFixed(2) : "", vatMode: s.vatEnabled ? d.vatMode : "NONE",
      paymentMethod: d.paymentMethod ?? "", paymentTerms: d.paymentTerms ?? "", carrier: d.carrier ?? "", note: d.note ?? "", internalNote: d.internalNote ?? "",
    };
  }
  const [customers, products] = await Promise.all([
    prisma.customer.findMany({ orderBy: { code: "desc" }, take: 3000 }),
    prisma.product.findMany({ orderBy: [{ isActive: "desc" }, { isService: "desc" }, { name: "asc" }], select: { id: true, sku: true, name: true, unit: true, priceSatang: true, salePriceSatang: true, saleStartsAt: true, saleEndsAt: true, tierPrices: true, isService: true, isActive: true }, take: 5000 }),
  ]);
  return (
    <DocEditor
      init={init}
      title={id === "new" ? `สร้าง${DOC_META[type].th.split(" /")[0]}` : `แก้ไข${DOC_META[type].th.split(" /")[0]} (ฉบับร่าง)`}
      back={id === "new" ? `/admin/docs/${type}` : `/admin/docs/${type}/${id}`}
      customers={customers.map((c) => ({ id: c.id, snap: custSnapshot(c) }))}
      // ราคาตั้งต้น = ราคาขายจริง (ราคาลดตามช่วงเวลา) + ราคาขายส่งตามจำนวน — แก้ได้ในตัวแก้ไข
      products={products.map((p) => {
        const tiers = parseTiers(p.tierPrices);
        return { id: p.id, sku: p.sku, name: p.name, unit: p.unit, price: unitPriceSatang(p), service: p.isService, off: !p.isActive, ...(tiers.length ? { tiers } : {}) };
      })}
      shop={shopHead(s)}
      vatEnabled={s.vatEnabled}
      vatRateBp={s.vatRateBp}
      refText={ref}
      printedAt={docDateTime(new Date(), s.dateEra)}
      lists={{ methods: PAY_METHODS, carriers: CARRIERS, units: UNITS }}
    />
  );
}
