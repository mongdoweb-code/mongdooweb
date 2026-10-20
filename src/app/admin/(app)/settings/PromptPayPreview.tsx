"use client";
// ตัวอย่าง QR พร้อมเพย์จากเลขที่กรอก + ยอดทดสอบ — สร้างด้วยสูตรเดียวกับหน้าชำระเงินและใบแจ้งหนี้ (promptPayPayload)
// ให้เจ้าของร้านลองสแกนด้วยแอปธนาคารก่อนบันทึกใช้จริง (แอปจะแสดงชื่อบัญชีปลายทาง — ไม่ต้องโอนจริง)
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { promptPayPayload } from "@/lib/doc-calc";

export function PromptPayPreview({ id }: { id: string }) {
  const [amount, setAmount] = useState("1.00");
  const [qr, setQr] = useState<{ src: string; payload: string } | null>(null);
  const digits = id.replace(/\D/g, "");
  const valid = [10, 13, 15].includes(digits.length);
  const n = Number(amount.replace(/[,\s]/g, ""));
  const satang = Number.isFinite(n) && n > 0 && n <= 1_000_000 ? Math.round(n * 100) : 0;

  useEffect(() => {
    let live = true;
    if (!valid) return;
    const payload = promptPayPayload(digits, satang || undefined);
    QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 2, width: 240 }).then((src) => live && setQr({ src, payload }));
    return () => {
      live = false;
    };
  }, [digits, satang, valid]);

  return (
    <div className="pp-preview">
      <div className="field">
        <label htmlFor="ppAmount">ยอดทดสอบ (บาท)</label>
        <input id="ppAmount" value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} placeholder="เว้นว่าง = ไม่ระบุยอด" />
      </div>
      {valid && qr ? (
        <div className="pp-qr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr.src} alt={`ตัวอย่าง QR พร้อมเพย์ ${digits}`} width={180} height={180} id="ppQr" data-payload={qr.payload} />
          <div>
            <b>ลองสแกนด้วยแอปธนาคาร</b>
            <span className="sub">ตรวจว่าชื่อบัญชีปลายทางถูกต้อง และยอด {satang ? `฿${(satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })}` : "ให้ลูกค้ากรอกเอง"} — ไม่ต้องกดโอนจริง</span>
            <span className="sub">เลขพร้อมเพย์: {digits}</span>
          </div>
        </div>
      ) : (
        <p className="sub">{digits ? "เลขพร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลข 13/15 หลัก" : "กรอกเลขพร้อมเพย์ด้านบนเพื่อดูตัวอย่าง QR"}</p>
      )}
    </div>
  );
}
