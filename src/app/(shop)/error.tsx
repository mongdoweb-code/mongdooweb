"use client";
// เกิดข้อผิดพลาดในหน้าร้าน (เช่น ฐานข้อมูลขัดข้องชั่วคราว) — ให้ลองใหม่ หรือสั่งซื้อทาง LINE/โทรได้ทันที
import { useEffect } from "react";

export default function ShopError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" tabIndex={-1}>
      <div className="container pg-body">
        <div className="pg-empty" role="alert">
          <b>ขออภัย ระบบขัดข้องชั่วคราว</b>
          <p style={{ marginTop: 8 }}>กรุณาลองใหม่อีกครั้ง หรือสั่งซื้อ/สอบถามทาง LINE @mongdoweb · โทร 080-884-9597</p>
          <p style={{ marginTop: 18 }}>
            <button className="btn btn-primary" type="button" onClick={() => retry()}>ลองใหม่</button>{" "}
            <a className="btn btn-outline" href="https://line.me/ti/p/~@mongdoweb" target="_blank" rel="noopener">ติดต่อทาง LINE</a>
          </p>
        </div>
      </div>
    </main>
  );
}
