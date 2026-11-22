// /admin/videos — วิดีโอของหน้า /videos: เพิ่ม (วางลิงก์/อัปโหลด) · ตารางคลิป (ลากเรียง · แสดง/ซ่อน · แนะนำ · ยอดดู · แก้ไข/ลบ)
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { docDateTime } from "@/lib/doc-calc";
import { mediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { VIDEO_SOURCES, durationText } from "@/lib/video-links";
import { DragHandle, RowActions } from "../../_components/RowActions";
import { SortableRows } from "../../_components/SortableRows";
import { deleteVideo, saveVideoOrder, toggleVideo } from "./actions";
import { videoFormLists } from "./form-data";
import { VideoForm } from "./VideoForm";
import "./videos.css";

export const instant = false;
/** เวลาปัจจุบัน (หน้าแอดมินเป็น dynamic อยู่แล้ว) */
const nowMs = () => Date.now();

export default async function VideosAdminPage({ searchParams }: PageProps<"/admin/videos">) {
  const admin = await requireAdmin();
  const owner = admin.role === "OWNER";
  const [sp, rows, lists, s] = await Promise.all([
    searchParams,
    prisma.video.findMany({ orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }], include: { product: { select: { name: true, sku: true } } } }),
    videoFormLists(),
    getSettings(),
  ]);
  const now = nowMs();
  const flash = sp.saved === "1" ? "เพิ่มคลิปแล้ว — แสดงที่หน้าวิดีโอ" : sp.deleted === "1" ? "ลบคลิปแล้ว" : "";
  const status = (v: (typeof rows)[number]) =>
    !v.isActive ? <span className="chip gray">ซ่อน</span> : v.publishAt && v.publishAt.getTime() > now ? <span className="chip warn" title="ตั้งเวลาเผยแพร่">เผยแพร่ {docDateTime(v.publishAt, s.dateEra)}</span> : <span className="chip ok">แสดง</span>;
  const thumb = (v: (typeof rows)[number]) => (v.posterKey ? mediaUrl(v.posterKey, "sm") : v.thumbUrl);
  return (
    <main className="main vd-page">
      <div className="page-head">
        <div>
          <h1>วิดีโอ</h1>
          <p>คลิปที่แสดงในหน้า <a className="link" href="/videos" target="_blank" rel="noopener">/videos</a> · ผูกกับสินค้าแล้วคลิปไปโชว์ในหน้าสินค้านั้นด้วย · ติ๊ก “แนะนำ” เพื่อขึ้นหน้าแรก</p>
        </div>
        <div className="head-actions">
          <a className="btn btn-outline" href="/videos" target="_blank" rel="noopener">ดูหน้าวิดีโอ ↗</a>
        </div>
      </div>
      {flash && <div className="ok-box" role="status" style={{ marginBottom: 12 }}>{flash}</div>}

      <section className="panel vd-add" aria-labelledby="vd-add-h">
        <h2 id="vd-add-h">เพิ่มคลิป</h2>
        <VideoForm
          init={{ url: "", posterKey: null, posterUrl: null, title: "", topic: "", vertical: false, productId: "", publish: "now", publishAt: "", featured: false }}
          products={lists.products}
          topics={lists.topics}
        />
      </section>

      <section className="panel" aria-labelledby="vd-list-h">
        <div className="vd-list-head">
          <h2 id="vd-list-h">คลิปทั้งหมด <span className="vd-n">{rows.length}</span></h2>
          <span className="sub">ลาก ⠿ เพื่อเรียงลำดับ · คลิป “แนะนำ” อยู่บนสุดเสมอ</span>
        </div>
        {rows.length ? (
          <table className="tbl vd-tbl">
            <thead>
              <tr>
                <th><span className="sr-only">ลาก</span></th>
                <th>คลิป</th>
                <th>แหล่ง / แบบ</th>
                <th>หัวข้อ</th>
                <th>สินค้า</th>
                <th className="r">ยอดดู</th>
                <th>สถานะ</th>
                <th className="r col-acts">การดำเนินการ</th>
              </tr>
            </thead>
            <SortableRows ids={rows.map((v) => v.id)} groups={rows.map((v) => (v.featured ? "f" : "n"))} action={saveVideoOrder}>
              {rows.map((v) => {
                const img = thumb(v);
                return (
                  <tr key={v.id} data-id={v.id} className={v.isActive ? "" : "row-off"}>
                    <td className="vd-drag"><DragHandle label={v.title} /></td>
                    <td>
                      <div className="vd-clip">
                        <span className={`vd-thumb${v.vertical ? " is-v" : ""}`} style={img ? undefined : { background: VIDEO_SOURCES[v.source].color }}>
                          {img && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" />
                          )}
                          {v.seconds ? <em>{durationText(v.seconds)}</em> : null}
                        </span>
                        <span>
                          <Link className="link vd-title" href={`/admin/videos/${v.id}`}>{v.title}</Link>
                          {v.hevc && <span className="sub vd-hevc" title="ไฟล์ HEVC: บางเบราว์เซอร์ (Firefox/คอมเก่า) อาจเล่นไม่ได้">HEVC</span>}
                        </span>
                      </div>
                    </td>
                    <td><span className={`vd-src vd-${v.source.toLowerCase()}`}>{VIDEO_SOURCES[v.source].name}</span><span className="sub">{v.vertical ? "แนวตั้ง" : "แนวนอน"}</span></td>
                    <td>{v.topic ?? "—"}</td>
                    <td className="vd-prod">{v.product ? <span title={v.product.sku}>{v.product.name}</span> : "—"}</td>
                    <td className="r num">{v.views.toLocaleString("th-TH")}</td>
                    <td>
                      <div className="vd-st">
                        {status(v)}
                        <form action={toggleVideo}>
                          <input type="hidden" name="id" value={v.id} />
                          <input type="hidden" name="what" value="featured" />
                          <button type="submit" className={`vd-star${v.featured ? " on" : ""}`} aria-pressed={v.featured} data-tip={v.featured ? "เลิกแนะนำ" : "แนะนำ (ขึ้นหน้าแรก)"} aria-label={`${v.featured ? "เลิกแนะนำ" : "แนะนำ"} ${v.title}`}>★</button>
                        </form>
                        <form action={toggleVideo}>
                          <input type="hidden" name="id" value={v.id} />
                          <input type="hidden" name="what" value="active" />
                          <button type="submit" className="vd-tg" role="switch" aria-checked={v.isActive} aria-label={`แสดงคลิป ${v.title}`} data-tip={v.isActive ? "ซ่อน" : "แสดง"}><i /></button>
                        </form>
                      </div>
                    </td>
                    <td className="r">
                      <RowActions
                        name={v.title}
                        viewHref={`/videos?v=${v.id}`}
                        viewTip="ดูบนเว็บ"
                        viewDisabled={v.isActive ? undefined : "ซ่อนอยู่ — ดูไม่ได้"}
                        editHref={`/admin/videos/${v.id}`}
                        del={{ action: deleteVideo, id: v.id, title: "ลบคลิปนี้?", body: `${v.title}${v.source === "UPLOAD" ? " — ลบไฟล์วิดีโอที่อัปโหลดด้วย" : ""} กู้คืนไม่ได้`, label: "ลบคลิป", disabled: owner ? undefined : "ลบได้เฉพาะเจ้าของร้าน (ใช้ “ซ่อน” แทนได้)" }}
                      />
                    </td>
                  </tr>
                );
              })}
            </SortableRows>
          </table>
        ) : (
          <div className="empty">
            <b>ยังไม่มีคลิป</b>วางลิงก์คลิปจาก YouTube, Facebook, TikTok หรือ Instagram ด้านบน หรืออัปโหลดคลิปที่ถ่ายจากมือถือ
          </div>
        )}
      </section>
    </main>
  );
}
