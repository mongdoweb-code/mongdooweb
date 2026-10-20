"use client";
// ข้อผิดพลาดร้ายแรง (แม้แต่โครงหน้าโหลดไม่ได้) — หน้าเรียบง่ายที่ไม่พึ่ง CSS/ข้อมูลอื่น พร้อมช่องทางติดต่อร้าน
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="th">
      <body style={{ fontFamily: "system-ui, 'Noto Sans Thai', sans-serif", margin: 0, background: "#f7f5f1", color: "#161616" }}>
        <title>ระบบขัดข้องชั่วคราว — มองดูเว็บ</title>
        <main style={{ maxWidth: 520, margin: "12vh auto", padding: 24, background: "#fff", textAlign: "center" }}>
          <h1 style={{ fontSize: 22 }}>ขออภัย ระบบขัดข้องชั่วคราว</h1>
          <p>กรุณาลองใหม่อีกครั้งในอีกสักครู่ หรือติดต่อร้านได้ทันที</p>
          <p>LINE <b>@mongdoweb</b> · โทร <a href="tel:0808849597">080-884-9597</a></p>
          <button type="button" onClick={() => retry()} style={{ marginTop: 12, padding: "12px 24px", background: "#F26B38", color: "#fff", border: 0, fontSize: 16, cursor: "pointer" }}>ลองใหม่</button>
        </main>
      </body>
    </html>
  );
}
