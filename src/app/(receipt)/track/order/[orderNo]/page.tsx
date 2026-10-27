// /track/order/:orderNo?t=<token> — ใบสั่งซื้อสำหรับลูกค้า (A4) พิมพ์/บันทึก PDF ได้ (ชื่อไฟล์ = เลขที่คำสั่งซื้อ)
// ลิงก์ลับสร้างตอนสั่งซื้อ: หน้าสั่งซื้อสำเร็จ, หน้าติดตามคำสั่งซื้อ และอีเมลแจ้งลูกค้า
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { addrText, bahtText, money } from "@/lib/doc-calc";
import { formatPhone } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { getPublicOrder } from "@/lib/public-orders";
import { bankLabel, getSettings, parseBankAccounts } from "@/lib/settings";
import { PrintBar } from "./PrintBar";
import "./order-sheet.css";

export const instant = false;

const tokenOf = (sp: Record<string, string | string[] | undefined>) => (typeof sp.t === "string" ? sp.t : undefined);

export async function generateMetadata({ params, searchParams }: PageProps<"/track/order/[orderNo]">): Promise<Metadata> {
  const [{ orderNo }, sp] = await Promise.all([params, searchParams]);
  const o = await getPublicOrder(decodeURIComponent(orderNo), tokenOf(sp));
  return { title: { absolute: o?.orderNo ?? "ไม่พบเอกสาร" }, robots: { index: false, follow: false } };
}

const STATUS: Record<string, string> = {
  AWAITING_SLIP: "รอชำระเงิน",
  PENDING_VERIFICATION: "รอตรวจสอบการชำระเงิน",
  PAID: "ชำระเงินแล้ว · รอจัดส่ง",
  SHIPPED: "จัดส่งแล้ว",
  REJECTED: "สลิปไม่ผ่าน · รอแนบสลิปใหม่",
  CANCELLED: "ยกเลิกแล้ว",
};
const fmtDate = (d: Date) => d.toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Bangkok" });

export default async function PublicOrderPage({ params, searchParams }: PageProps<"/track/order/[orderNo]">) {
  const [{ orderNo }, sp] = await Promise.all([params, searchParams]);
  const o = await getPublicOrder(decodeURIComponent(orderNo), tokenOf(sp));
  if (!o) notFound();
  const s = await getSettings();
  const pickup = o.shippingMethod === "pickup";
  const cod = o.paymentMethod === "COD";
  const status = cod && o.status === "PENDING_VERIFICATION" ? "รอร้านยืนยัน (เก็บเงินปลายทาง)" : cod && o.status === "PAID" ? "ร้านยืนยันแล้ว · รอจัดส่ง" : STATUS[o.status];
  const banks = parseBankAccounts(s.bankAccounts);
  const unpaid = !cod && ["AWAITING_SLIP", "REJECTED"].includes(o.status);
  const logo = (s.logoKey && mediaUrl(s.logoKey)) || "/img/doc-logo.png";

  return (
    <div className="pp">
      <style>{"@page{size:A4;margin:0}"}</style>
      <PrintBar title={o.orderNo} />
      <div className="pp-body">
        <div className="pp-sheets">
          <article className="osheet" aria-label={`ใบสั่งซื้อ ${o.orderNo}`}>
            <header className="os-head">
              <div className="os-shop">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} alt="" width={64} height={64} />
                <div>
                  <b>{s.legalName}</b>
                  <span>{s.addressText}</span>
                  <span>โทร {s.phone}{s.lineId ? ` · LINE ${s.lineId}` : ""}{s.taxId ? ` · เลขผู้เสียภาษี ${s.taxId}` : ""}</span>
                </div>
              </div>
              <div className="os-title">
                <h1>ใบสั่งซื้อ</h1>
                <span>ORDER</span>
                <b className="num">{o.orderNo}</b>
              </div>
            </header>

            <section className="os-meta">
              <div>
                <h2>{pickup ? "ผู้รับสินค้า (รับที่ร้าน)" : "จัดส่งถึง"}</h2>
                <p>
                  <b>{o.customerName}</b> · {formatPhone(o.phone)}
                  {o.email ? <><br />{o.email}</> : null}
                  <br />
                  {pickup ? s.pickupNote || "รับสินค้าที่ร้าน" : addrText({ line: o.addressLine, sub: o.subdistrict, dist: o.district, prov: o.province, zip: o.postalCode })}
                </p>
              </div>
              <dl>
                <dt>วันที่สั่งซื้อ</dt><dd>{fmtDate(o.createdAt)}</dd>
                <dt>สถานะ</dt><dd id="osStatus">{status}</dd>
                <dt>การจัดส่ง</dt><dd>{o.shippingName}</dd>
                <dt>การชำระเงิน</dt><dd>{cod ? "เก็บเงินปลายทาง (COD)" : "โอนเงิน / พร้อมเพย์"}</dd>
                {o.trackingNo && <><dt>เลขพัสดุ</dt><dd>{o.carrier} {o.trackingNo}</dd></>}
              </dl>
            </section>

            <table className="os-items">
              <thead>
                <tr><th>#</th><th>รายการ</th><th className="r">จำนวน</th><th className="r">ราคา/หน่วย</th><th className="r">จำนวนเงิน</th></tr>
              </thead>
              <tbody>
                {o.items.map((i, k) => (
                  <tr key={i.id}>
                    <td>{k + 1}</td>
                    <td>{i.nameSnapshot}{i.product?.sku ? <small> ({i.product.sku})</small> : null}</td>
                    <td className="r">{i.qty} {i.product?.unit ?? "ชิ้น"}</td>
                    <td className="r">{money(i.priceSatang)}</td>
                    <td className="r">{money(i.priceSatang * i.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <section className="os-sum">
              <p className="os-words">({bahtText(o.totalSatang)})</p>
              <dl>
                <dt>รวมค่าสินค้า</dt><dd>{money(o.subtotalSatang)}</dd>
                {o.discountSatang > 0 && <><dt>ส่วนลด{o.couponCode ? ` (คูปอง ${o.couponCode})` : ""}</dt><dd id="osDiscount">−{money(o.discountSatang)}</dd></>}
                <dt>{pickup ? "รับสินค้าที่ร้าน" : `ค่าจัดส่ง${o.remoteFeeSatang > 0 ? ` (รวมพื้นที่ห่างไกล ${money(o.remoteFeeSatang)})` : ""}`}</dt>
                <dd>{o.shippingSatang ? money(o.shippingSatang) : pickup ? "ไม่มีค่าส่ง" : "ส่งฟรี"}</dd>
                {o.codFeeSatang > 0 && <><dt>ค่าธรรมเนียมเก็บเงินปลายทาง</dt><dd>{money(o.codFeeSatang)}</dd></>}
                <dt className="g">{cod ? "ยอดเก็บเงินปลายทาง" : "ยอดชำระทั้งหมด"}</dt><dd className="g" id="osTotal">{money(o.totalSatang)} บาท</dd>
              </dl>
            </section>

            {unpaid && banks.length > 0 && (
              <section className="os-pay">
                <h2>ช่องทางชำระเงิน</h2>
                <ul>
                  {banks.map((b) => <li key={b.account}>{bankLabel(b.bank)} · {b.account}{b.holder ? ` · ${b.holder}` : ""}</li>)}
                  {s.promptpayId && <li>พร้อมเพย์ {s.promptpayId} · {s.promptpayName}</li>}
                </ul>
                <p>โอนแล้วแนบสลิปที่หน้าติดตามคำสั่งซื้อ ด้วยเลขที่คำสั่งซื้อและเบอร์โทร</p>
              </section>
            )}
            {o.note && <p className="os-note">หมายเหตุจากลูกค้า: {o.note}</p>}
            <footer className="os-foot">เอกสารนี้ออกจากระบบอัตโนมัติ ใช้อ้างอิงการสั่งซื้อ — ไม่ใช่ใบเสร็จรับเงิน/ใบกำกับภาษี</footer>
          </article>
        </div>
      </div>
    </div>
  );
}
