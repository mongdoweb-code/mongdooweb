// รีวิวจากผู้ซื้อจริงในหน้าสินค้า (U4): คะแนนเฉลี่ย + การกระจายดาว + รายการรีวิว (เฉพาะที่ร้านอนุมัติแล้ว)
// + ฟอร์มเขียนรีวิว (ยืนยันด้วยเลขที่คำสั่งซื้อ + เบอร์) + AggregateRating/Review JSON-LD (เฉพาะรีวิวที่อนุมัติแล้ว)
import { getProductReviews } from "@/lib/reviews";
import { absUrl, jsonForScript } from "@/lib/storefront";
import { ReviewForm } from "./ReviewForm";

const day = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Bangkok" });

export function Stars({ value, size }: { value: number; size?: "lg" }) {
  const full = Math.round(value * 2) / 2;
  return (
    <span className={`l10-stars${size ? " lg" : ""}`} role="img" aria-label={`${value.toLocaleString("th-TH", { maximumFractionDigits: 1 })} จาก 5 ดาว`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={full >= n ? "on" : full >= n - 0.5 ? "half" : ""} aria-hidden="true">
          ★
        </i>
      ))}
    </span>
  );
}

export async function ProductReviews({ slug, name }: { slug: string; name: string }) {
  const r = await getProductReviews(slug);
  if (!r) return null;
  const url = absUrl(`/product/${encodeURIComponent(slug)}`);
  // node เดียวกับ Product JSON-LD ของหน้าสินค้า (@id ตรงกัน) — เพิ่มคะแนนเฉพาะเมื่อมีรีวิวที่อนุมัติแล้ว
  const ld = r.count
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        "@id": `${url}#product`,
        name,
        url,
        aggregateRating: { "@type": "AggregateRating", ratingValue: r.avg.toFixed(1), reviewCount: r.count, bestRating: 5, worstRating: 1 },
        review: r.list.slice(0, 10).map((x) => ({
          "@type": "Review",
          author: { "@type": "Person", name: x.name },
          datePublished: x.date.slice(0, 10),
          reviewBody: x.body.slice(0, 1000),
          reviewRating: { "@type": "Rating", ratingValue: x.rating, bestRating: 5, worstRating: 1 },
        })),
      }
    : null;
  return (
    <section className="l10-reviews" id="reviews" aria-labelledby="reviews-h">
      <div className="sec-head">
        <h2 className="sec-title" id="reviews-h">
          รีวิวจากผู้ซื้อจริง
        </h2>
      </div>
      <div className="l10-rv-grid">
        <div className="l10-rv-sum">
          {r.count ? (
            <>
              <div className="l10-rv-avg">
                <b>{r.avg.toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</b>
                <span>/ 5</span>
              </div>
              <Stars value={r.avg} size="lg" />
              <p className="l10-rv-count">จาก {r.count.toLocaleString("th-TH")} รีวิว</p>
              <ul className="l10-rv-dist" aria-label="จำนวนรีวิวแต่ละระดับดาว">
                {[5, 4, 3, 2, 1].map((n) => (
                  <li key={n}>
                    <span>{n} ดาว</span>
                    <i aria-hidden="true">
                      <em style={{ width: `${r.count ? Math.round((r.dist[n - 1] / r.count) * 100) : 0}%` }} />
                    </i>
                    <span>{r.dist[n - 1]}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="l10-rv-none">ยังไม่มีรีวิวสำหรับสินค้านี้ — ซื้อแล้วมาเล่าประสบการณ์ให้ลูกค้าคนอื่นได้เลย</p>
          )}
          <ReviewForm slug={slug} />
        </div>
        <div>
          {r.list.length > 0 && (
            <ol className="l10-rv-list">
              {r.list.map((x) => (
                <li key={x.id} className="l10-rv">
                  <div className="l10-rv-head">
                    <Stars value={x.rating} />
                    <b>{x.name}</b>
                    <span className="l10-rv-badge">ผู้ซื้อจริง</span>
                    <time dateTime={x.date}>{day(x.date)}</time>
                  </div>
                  <p className="l10-rv-body">{x.body}</p>
                  {x.images.length > 0 && (
                    <div className="l10-rv-imgs">
                      {x.images.map((im, i) => (
                        <a key={i} href={im.full} target="_blank" rel="noopener">
                          {/* eslint-disable-next-line @next/next/no-img-element -- รูปรีวิวย่อแล้วจาก /media */}
                          <img src={im.sm} alt={`รูปจากรีวิวของ ${x.name} รูปที่ ${i + 1}`} width={96} height={96} loading="lazy" decoding="async" />
                        </a>
                      ))}
                    </div>
                  )}
                  {x.reply && (
                    <div className="l10-rv-reply">
                      <b>ร้านตอบกลับ</b>
                      <p>{x.reply}</p>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(ld) }} />}
    </section>
  );
}
