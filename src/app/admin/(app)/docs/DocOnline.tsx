// ส่วน "ลิงก์ลูกค้า" ในหน้าเอกสาร (A20/U25/U26): ลิงก์ลับให้ลูกค้ายืนยันใบเสนอราคา/ชำระใบแจ้งหนี้ + สลิปที่ลูกค้าแนบรอตรวจ
import { docDateTime, money } from "@/lib/doc-calc";
import { DOC_SLIP_REJECT_REASONS, docSlipDuplicates } from "@/lib/doc-online";
import { siteUrl } from "@/lib/line";
import { prisma } from "@/lib/prisma";
import { ensureDocToken, publicDocUrl } from "@/lib/public-docs";
import { ConfirmSubmit, CopyButton } from "../../_components/AdminClient";
import { approveDocSlipAction, rejectDocSlipAction } from "./slip-actions";

const ST: Record<string, string> = { PENDING: "รอตรวจ", ACCEPTED: "อนุมัติแล้ว", REJECTED: "ไม่ผ่าน" };

export async function DocOnline({ doc, era }: {
  doc: { id: string; type: "QUOTATION" | "INVOICE" | "RECEIPT"; status: string; acceptedAt: Date | null; acceptedBy: string | null; grandSatang: number; paidSatang: number };
  era: "AD" | "BE";
}) {
  if (doc.type === "RECEIPT" || doc.status === "DRAFT") return null;
  const live = doc.status !== "VOID";
  const token = live ? await ensureDocToken(doc.id) : null;
  const url = token ? `${siteUrl()}${publicDocUrl(doc, token)}` : null;
  const slips = doc.type === "INVOICE" ? await prisma.docSlip.findMany({ where: { documentId: doc.id }, orderBy: { createdAt: "desc" } }) : [];
  const dups = new Map(await Promise.all(slips.filter((s) => s.status === "PENDING").map(async (s) => [s.id, await docSlipDuplicates(s.id, s.sha256)] as const)));
  const outstanding = doc.grandSatang - doc.paidSatang;
  return (
    <>
      {url && (
        <section className="dv-sec" id="docLink">
          <h3>ลิงก์สำหรับลูกค้า</h3>
          <p className="sub" style={{ marginBottom: 8 }}>
            {doc.type === "QUOTATION" ? "ส่งให้ลูกค้าเปิดดูและกด \"ยืนยันใบเสนอราคา\" ออนไลน์" : "ส่งให้ลูกค้าสแกน QR ยอดคงค้างและแนบสลิปการโอน"}
          </p>
          <input className="dl-url" readOnly value={url} aria-label="ลิงก์สำหรับลูกค้า" style={{ width: "100%", height: 36, border: "1px solid var(--c-line)", padding: "0 8px", fontSize: 12 }} />
          <div className="mini-acts" style={{ marginTop: 8 }}>
            <CopyButton text={url} done="คัดลอกลิงก์แล้ว">คัดลอกลิงก์</CopyButton>
            <a className="btn btn-ghost btn-sm" href={url} target="_blank" rel="noopener">เปิดดู</a>
          </div>
        </section>
      )}
      {doc.type === "QUOTATION" && doc.acceptedAt && (
        <section className="dv-sec" id="qtOnlineAccepted">
          <h3>ลูกค้ายืนยันออนไลน์</h3>
          <p>{doc.acceptedBy ?? "—"} · {docDateTime(doc.acceptedAt, era)}</p>
        </section>
      )}
      {slips.length > 0 && (
        <section className="dv-sec" id="docSlips">
          <h3>สลิปจากลิงก์ ({slips.filter((s) => s.status === "PENDING").length} รอตรวจ)</h3>
          <ul className="dv-pays">
            {slips.map((s) => (
              <li key={s.id} style={{ display: "grid", gap: 6 }}>
                <span>
                  <b className="num">฿{money(s.amountSatang)}</b>{" "}
                  <span className="sub">โอน {docDateTime(s.transferredAt, era)} · {ST[s.status]}{s.rejectReason ? ` · ${s.rejectReason}` : ""}</span>
                </span>
                <a className="link" href={`/admin/doc-slips/${s.id}`} target="_blank" rel="noopener">ดูภาพสลิป</a>
                {s.status === "PENDING" && (
                  <>
                    {(dups.get(s.id)?.length ?? 0) > 0 && <span className="chip bad">สลิปซ้ำกับ {dups.get(s.id)!.join(", ")}</span>}
                    {s.amountSatang > outstanding && <span className="chip bad">ยอดในสลิปเกินยอดค้าง ฿{money(outstanding)}</span>}
                    <div className="act-row">
                      <form action={approveDocSlipAction}>
                        <input type="hidden" name="slipId" value={s.id} />
                        <ConfirmSubmit className="btn btn-ok btn-sm" title="อนุมัติสลิปนี้?" body={`บันทึกรับชำระ ฿${money(s.amountSatang)} และออกใบเสร็จรับเงินอัตโนมัติ — เช็กยอดเข้าบัญชีจริงก่อนอนุมัติ`} confirmLabel="อนุมัติและออกใบเสร็จ">
                          อนุมัติ + ออกใบเสร็จ
                        </ConfirmSubmit>
                      </form>
                    </div>
                    <form action={rejectDocSlipAction} className="act-row" style={{ flexWrap: "wrap" }}>
                      <input type="hidden" name="slipId" value={s.id} />
                      <label className="sr-only" htmlFor={`rj-${s.id}`}>เหตุผลที่ปฏิเสธ</label>
                      <select id={`rj-${s.id}`} name="reason">{DOC_SLIP_REJECT_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
                      <label className="sr-only" htmlFor={`rn-${s.id}`}>รายละเอียด</label>
                      <input id={`rn-${s.id}`} name="note" maxLength={200} placeholder="รายละเอียด (ลูกค้าเห็น)" />
                      <button className="btn btn-danger btn-sm" type="submit">ปฏิเสธ</button>
                    </form>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
