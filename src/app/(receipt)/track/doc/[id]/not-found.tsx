// ลิงก์เอกสารไม่ถูกต้อง (ไม่มีโทเคน/โทเคนผิด/ฉบับร่าง) — ไม่บอกว่าเอกสารมีอยู่จริงหรือไม่
export default function DocNotFound() {
  return (
    <main className="pp" style={{ display: "grid", placeItems: "center", padding: "48px 16px" }}>
      <div style={{ background: "#fff", padding: "36px 28px", maxWidth: 520, textAlign: "center" }} data-testid="doc-404">
        <p style={{ fontSize: 13, color: "var(--c-muted)", letterSpacing: 1 }}>404</p>
        <h1 style={{ fontSize: 22, margin: "6px 0 10px" }}>ไม่พบเอกสาร หรือลิงก์ไม่ถูกต้อง</h1>
        <p style={{ color: "var(--c-muted)", marginBottom: 20 }}>กรุณาเปิดจากลิงก์ที่ร้านส่งให้ หรือติดต่อร้านเพื่อขอลิงก์ใหม่</p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="btn btn-primary" href="/contact">ติดต่อร้าน</a>
      </div>
    </main>
  );
}
