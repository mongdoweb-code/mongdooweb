// ลิงก์ใบเสร็จไม่ถูกต้อง (ไม่มีโทเคน/โทเคนผิด) — ไม่บอกว่าเอกสารมีอยู่จริงหรือไม่
export default function ReceiptNotFound() {
  return (
    <main className="pp" style={{ display: "grid", placeItems: "center", padding: "48px 16px" }}>
      <div style={{ background: "#fff", padding: "36px 28px", maxWidth: 520, textAlign: "center" }} data-testid="receipt-404">
        <p style={{ fontSize: 13, color: "var(--c-muted)", letterSpacing: 1 }}>404</p>
        <h1 style={{ fontSize: 22, margin: "6px 0 10px" }}>ไม่พบเอกสาร หรือลิงก์ไม่ถูกต้อง</h1>
        <p style={{ color: "var(--c-muted)", marginBottom: 20 }}>
          เปิดใบเสร็จได้จากหน้าติดตามคำสั่งซื้อ โดยกรอกเลขที่คำสั่งซื้อและเบอร์โทรที่ใช้สั่งซื้อ
        </p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="btn btn-primary" href="/track">
          ไปหน้าติดตามคำสั่งซื้อ
        </a>
      </div>
    </main>
  );
}
