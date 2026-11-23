// /datasheet/:slug — Data Sheet สินค้าแบบ A4 สำหรับพิมพ์ / บันทึก PDF (โลโก้ร้าน · รูปสินค้า · สเปกเด่น · ตารางจัดกลุ่ม ไทย/EN · QR ไปหน้าสินค้า)
// ไม่มีหัว/ท้ายเว็บ (route group (receipt)) · ไม่ให้ค้นหาเจอ (layout ตั้ง noindex) · ชื่อไฟล์ PDF = ชื่อหน้า "DataSheet-<รหัสสินค้า>"
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { dsChips, dsHighlights, dsIcon, dsLabel } from "@/lib/datasheet";
import { DEFAULT_LOGO } from "@/lib/docs";
import { mediaUrl } from "@/lib/media";
import { getPublicShopInfo } from "@/lib/settings";
import { getProductDetail, siteBase } from "@/lib/storefront";
import { PrintBar } from "./PrintBar";
import "./print.css";

const decode = (s: string) => {
  try {
    return decodeURIComponent(s).normalize("NFC");
  } catch {
    return s;
  }
};

export async function generateMetadata({ params }: PageProps<"/datasheet/[slug]">): Promise<Metadata> {
  const p = await getProductDetail(decode((await params).slug));
  return { title: p ? `DataSheet-${p.sku}` : "Data Sheet" };
}

function Value({ v }: { v: string }) {
  const chips = dsChips(v);
  return chips ? <>{chips.join(" · ")}</> : <>{v}</>;
}

export default async function DatasheetPrint({ params, searchParams }: PageProps<"/datasheet/[slug]">) {
  await connection();
  const [{ slug: raw }, sp] = await Promise.all([params, searchParams]);
  const slug = decode(raw);
  const [p, shop] = await Promise.all([getProductDetail(slug), getPublicShopInfo()]);
  if (!p || !p.datasheet) notFound();
  const ds = p.datasheet;
  const url = `${siteBase()}/product/${encodeURIComponent(p.slug)}`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: "M" });
  const logo = mediaUrl(shop.logoKey) || DEFAULT_LOGO;
  const hls = dsHighlights(ds);
  const printed = new Date().toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" });
  return (
    <main className="dsp">
      <PrintBar back={`/product/${encodeURIComponent(p.slug)}`} auto={sp.auto === "1"} />
      <article className="dsp-sheet">
        <header className="dsp-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="dsp-logo" src={logo} alt="" />
          <div className="dsp-shop">
            <b>{shop.name}</b>
            <span>{[shop.phone && `โทร ${shop.phone}`, shop.lineId && `LINE ${shop.lineId}`].filter(Boolean).join(" · ")}</span>
            <span>{siteBase().replace(/^https?:\/\//, "")}</span>
          </div>
          <div className="dsp-title"><b>DATA SHEET</b><span>ข้อมูลทางเทคนิค</span></div>
        </header>

        <section className="dsp-prod">
          <div className="dsp-img">
            {p.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.images[0].full} alt="" />
            ) : null}
          </div>
          <div className="dsp-info">
            <h1>{p.name}</h1>
            <p>รหัสสินค้า <b>{p.sku}</b> · หมวด {p.category.th}</p>
            {hls.length > 0 && (
              <ul className="dsp-hl">
                {hls.map((r, i) => <li key={i}><i>{dsIcon(r)}</i><b>{r.value}</b><small>{dsLabel(r)}</small></li>)}
              </ul>
            )}
          </div>
          <figure className="dsp-qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR หน้าสินค้า" />
            <figcaption>สแกนดูสินค้า / สั่งซื้อ</figcaption>
          </figure>
        </section>

        <table className="dsp-table">
          <thead><tr><th scope="col">รายการ <small>Item</small></th><th scope="col">ข้อมูลจำเพาะ <small>Specification</small></th></tr></thead>
          {ds.groups.map((g, gi) => (
            <tbody key={gi}>
              {(g.title || g.en) && (
                <tr className="dsp-g"><th colSpan={2}>{g.title || g.en}{g.title && g.en && <small> · {g.en}</small>}</th></tr>
              )}
              {g.rows.map((r, i) => (
                <tr key={i}>
                  <th scope="row">{dsLabel(r)}{r.en && r.label && <small>{r.en}</small>}</th>
                  <td><Value v={r.value} /></td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
        {ds.note && <p className="dsp-note">{ds.note}</p>}
        <footer className="dsp-foot">
          <span>{shop.address}</span>
          <span>พิมพ์เมื่อ {printed} · ข้อมูลอาจเปลี่ยนแปลงโดยไม่ต้องแจ้งล่วงหน้า</span>
        </footer>
      </article>
    </main>
  );
}
