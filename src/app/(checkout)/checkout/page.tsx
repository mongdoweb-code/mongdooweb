// หน้าชำระเงิน — HTML/CSS/JS ย้ายมาจาก prototype/mongdoweb-checkout.html
// ค่าร้านและราคาสินค้ามาจากฐานข้อมูล; คำสั่งซื้อ/สลิปส่งไปที่ /api/orders
import type { Metadata } from "next";
import Script from "next/script";
import { connection } from "next/server";
import { Suspense } from "react";
import { getCheckoutConfig } from "@/lib/orders";
import { getShopData, jsonForScript } from "@/lib/storefront";
import { CHECKOUT_BODY } from "./markup";

export const metadata: Metadata = { title: "ชำระเงิน — มองดูเว็บ", robots: { index: false } };

async function CheckoutData() {
  await connection(); // ค่าส่ง/บัญชีธนาคารต้องเป็นค่าล่าสุดเสมอ (ไม่แคช)
  const [cfg, { catalog }] = await Promise.all([getCheckoutConfig(), getShopData()]);
  const boot = {
    shop: {
      bank: cfg.bank,
      promptpay: cfg.promptpay,
      promptpayName: cfg.promptpayName,
      shipping: cfg.shipping.map((s) => ({ id: s.id, name: s.name, desc: s.desc, price: s.satang / 100 })),
      freeShipMin: cfg.freeShipMinSatang ? cfg.freeShipMinSatang / 100 : null,
      checkWithin: cfg.checkWithin,
      line: cfg.line,
    },
    catalog: catalog.map((p) => ({ id: p.id, name: p.name, price: p.price, color: p.color, ...(p.acc ? { acc: true } : {}) })),
  };
  return (
    <>
      <script id="mdw-checkout" type="application/json" dangerouslySetInnerHTML={{ __html: jsonForScript(boot) }} />
      <Script src="/js/checkout.js" strategy="afterInteractive" />
    </>
  );
}

export default function CheckoutPage() {
  return (
    <>
      <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: CHECKOUT_BODY }} />
      <Suspense>
        <CheckoutData />
      </Suspense>
    </>
  );
}
