// หน้าชำระเงิน — HTML/CSS/JS ย้ายมาจาก prototype/mongdoweb-checkout.html
// ค่าร้านและราคาสินค้ามาจากฐานข้อมูล; คำสั่งซื้อ/สลิปส่งไปที่ /api/orders
import type { Metadata } from "next";
import Script from "next/script";
import { connection } from "next/server";
import { Suspense } from "react";
import { getCheckoutConfig } from "@/lib/orders";
import { getStorefrontExtras } from "@/lib/shop-public";
import { getShopData, jsonForScript } from "@/lib/storefront";
import { CHECKOUT_BODY } from "./markup";

export const metadata: Metadata = { title: "ชำระเงิน — มองดูเว็บ", robots: { index: false } };

async function CheckoutData() {
  await connection(); // ค่าส่ง/บัญชีธนาคารต้องเป็นค่าล่าสุดเสมอ (ไม่แคช)
  const [cfg, { catalog }, extras] = await Promise.all([getCheckoutConfig(), getShopData(), getStorefrontExtras()]);
  const boot = {
    shop: {
      banks: cfg.banks,
      promptpay: cfg.promptpay,
      promptpayName: cfg.promptpayName,
      shipping: cfg.shipping,
      tiers: cfg.tiers.map((t) => ({ min: t.minSatang / 100, fee: t.feeSatang / 100 })),
      expressExtra: cfg.expressExtraSatang / 100,
      checkWithin: cfg.checkWithin,
      cod: cfg.cod ? { fee: cfg.cod.feeSatang / 100, max: cfg.cod.maxSatang / 100 } : null,
      pickupNote: cfg.pickupNote,
      line: cfg.line,
      provinces: cfg.provinces,
    },
    // ตะกร้าแสดงเฉพาะสินค้าที่สั่งได้ (มีราคา + มีของ)
    catalog: catalog
      .filter((p) => p.price > 0 && p.inStock)
      .map((p) => ({ id: p.id, name: p.name, price: p.price, color: p.color, img: p.img, ...(p.maxQty != null ? { maxQty: p.maxQty } : {}), ...(p.acc ? { acc: true } : {}) })),
  };
  return (
    <>
      <script id="mdw-checkout" type="application/json" dangerouslySetInnerHTML={{ __html: jsonForScript(boot) }} />
      <script id="mdw-analytics" type="application/json" dangerouslySetInnerHTML={{ __html: jsonForScript({ ga4: extras.ga4Id, pixel: extras.metaPixelId }) }} />
      <Script src="/js/analytics.js" strategy="afterInteractive" />
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
