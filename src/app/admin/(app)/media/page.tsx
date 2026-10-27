// /admin/media — ตรวจรูปภาพ (A15): หารูปหาย/เสีย/ลิงก์ภายนอกเปิดไม่ได้/ยังไม่มีรูปย่อ + รายการที่ต้องแก้ + สร้างรูปย่อใหม่ (U14)
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { AVIF_SUPPORTED } from "@/lib/media";
import { PROBLEM_TH, localKeys, scanImages } from "@/lib/media-scan";
import { IMG_WIDTHS } from "@/lib/img-srcset";
import { ConfirmSubmit } from "../../_components/AdminClient";
import { dropMissingAction } from "./actions";
import { RegenButton } from "./RegenButton";
import "../../lot12.css";

export default async function MediaPage({ searchParams }: PageProps<"/admin/media">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const doScan = sp.scan === "1";
  const only = typeof sp.only === "string" ? sp.only.slice(0, 80) : "";
  const [scan, keys] = await Promise.all([doScan ? scanImages() : null, localKeys()]);
  const order = ["missing", "broken", "external", "no-variants"] as const;
  const issues = scan ? scan.issues.filter((i) => !only || i.key.includes(only) || i.label.includes(only)).sort((a, b) => order.indexOf(a.problem) - order.indexOf(b.problem)) : [];
  const missingProducts = issues.filter((i) => i.problem === "missing" && i.where === "สินค้า").length;
  return (
    <main className="main" id="page-media">
      <div className="page-head">
        <div>
          <h1>ตรวจรูปภาพ</h1>
          <p>รูปที่อัปโหลด {keys.length} รูป · รูปย่อ {IMG_WIDTHS.join("/")} px แบบ WebP{AVIF_SUPPORTED ? " + AVIF" : ""} สำหรับหน้าร้าน (โหลดเร็วบนมือถือ)</p>
        </div>
        <div className="head-actions">
          <Link className="btn btn-outline" href={`/admin/media?scan=1${only ? `&only=${encodeURIComponent(only)}` : ""}`} id="scanBtn" prefetch={false}>ตรวจรูป{only ? "ที่เลือก" : "ทั้งหมด"}</Link>
        </div>
      </div>
      {typeof sp.dropped === "string" && <div className="ok-box" role="status" style={{ marginBottom: 12 }}>เอารูปที่หายออกจากสินค้าแล้ว {sp.dropped} รูป</div>}
      {typeof sp.dropRefused === "string" && (
        <div className="login-err" role="alert" style={{ marginBottom: 12 }}>
          ยังไม่ได้เอารูปออก: พบรูปที่หาย {sp.dropRefused} รูป ซึ่งมากผิดปกติ — มักเกิดจากการตั้งค่าที่เก็บไฟล์ผิด (เช่น S3 / UPLOAD_DIR) กรุณาตรวจที่หน้า &quot;ระบบ&quot; ก่อน
        </div>
      )}
      <section className="box" style={{ marginBottom: 16 }}>
        <h3>สร้างรูปย่อใหม่</h3>
        <p className="l3-note">ใช้กับรูปที่อัปโหลดก่อนมีรูปหลายขนาด หรือหลังย้ายที่เก็บไฟล์ — รูปที่อัปโหลดใหม่สร้างรูปย่อให้อัตโนมัติ (ถ้ายังไม่สร้าง หน้าร้านจะสร้างให้ตอนเปิดครั้งแรก แต่ช้ากว่า)</p>
        <form className="regen-only" action="/admin/media">
          <label htmlFor="mOnly">เฉพาะรูปที่ชื่อไฟล์มีคำว่า (ไม่บังคับ)</label>
          {doScan && <input type="hidden" name="scan" value="1" />}
          <input id="mOnly" name="only" defaultValue={only} placeholder="เช่น products/2026/10" maxLength={80} />
          <button className="btn btn-outline btn-sm" type="submit">เลือก</button>
        </form>
        <RegenButton key={only} total={only ? keys.filter((k) => k.includes(only)).length : keys.length} only={only} />
      </section>
      {scan ? (
        <section className="panel">
          <div className="l3-kpis four" style={{ padding: 16 }}>
            <div className="l3-kpi"><span>รูปทั้งหมด</span><b className="num" id="mTotal">{scan.total}</b><small>อัปโหลด {scan.local} · ลิงก์ภายนอก {scan.external}</small></div>
            <div className="l3-kpi"><span>ปกติ</span><b className="num">{scan.ok}</b><small>&nbsp;</small></div>
            <div className="l3-kpi"><span>มีรูปย่อแล้ว</span><b className="num">{scan.withVariants}</b><small>จาก {scan.local} รูปที่อัปโหลด</small></div>
            <div className="l3-kpi"><span>ต้องแก้</span><b className="num" id="mIssues">{issues.filter((i) => i.problem !== "no-variants").length}</b><small>หาย/เสีย/ลิงก์เสีย</small></div>
          </div>
          {missingProducts > 0 && admin.role === "OWNER" && (
            <form action={dropMissingAction} style={{ padding: "0 16px 12px" }}>
              <ConfirmSubmit className="btn btn-outline btn-sm" title="เอารูปที่หายออกจากสินค้า?" body={`รูปสินค้าที่ไม่มีไฟล์แล้ว ${missingProducts} รูปจะถูกเอาออกจากรายการรูปของสินค้า (หน้าร้านจะไม่แสดงรูปเสีย)`} confirmLabel="เอาออก">เอารูปสินค้าที่หายออก ({missingProducts})</ConfirmSubmit>
            </form>
          )}
          {issues.length ? (
            <table className="tbl" id="mediaIssues">
              <thead><tr><th>ปัญหา</th><th>ที่ใช้</th><th>รายการ</th><th>ไฟล์/ลิงก์</th></tr></thead>
              <tbody>
                {issues.slice(0, 500).map((i, n) => (
                  <tr key={`${i.key}-${n}`} data-problem={i.problem}>
                    <td><span className={`dst dst-${i.problem === "no-variants" ? "gray" : "bad"}`}>{PROBLEM_TH[i.problem]}</span>{i.detail && <span className="sub">{i.detail}</span>}</td>
                    <td>{i.where}</td>
                    <td><Link className="link" href={i.href}>{i.label}</Link></td>
                    <td className="sub" style={{ overflowWrap: "anywhere", fontSize: 12 }}>{i.key}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty"><b>รูปทั้งหมดปกติ และมีรูปย่อครบ</b></div>
          )}
          <p className="l3-note" style={{ padding: 16 }}>วิธีแก้: รูปหาย/เสีย → เปิดรายการแล้วอัปโหลดรูปใหม่ (หรือกด “เอารูปสินค้าที่หายออก”) · ลิงก์ภายนอกเปิดไม่ได้ → เปลี่ยนเป็นรูปที่อัปโหลดเอง · ยังไม่มีรูปย่อ → กด “สร้างรูปย่อใหม่”</p>
        </section>
      ) : (
        <div className="login-info">กด “ตรวจรูปทั้งหมด” เพื่ออ่านไฟล์ทุกรูปจากที่เก็บไฟล์ (อาจใช้เวลาสักครู่ถ้ามีรูปมาก)</div>
      )}
    </main>
  );
}
