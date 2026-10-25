"use client";
// ปุ่มแชร์ลิงก์ (คัดลอก URL) + ส่งต่อทาง LINE — ใช้ในหน้าเปรียบเทียบและรายการโปรด
// toast() มาจาก public/js/shell.js (ส่วนกลางของหน้าร้าน)

type ShellWin = Window & { toast?: (m: string) => void };

export function shareToast(msg: string) {
  const w = window as ShellWin;
  if (typeof w.toast === "function") w.toast(msg);
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // เบราว์เซอร์ที่ไม่ให้ใช้ clipboard API → เลือกข้อความด้วย textarea ชั่วคราว
    try {
      const t = document.createElement("textarea");
      t.value = text;
      t.setAttribute("readonly", "");
      t.style.position = "fixed";
      t.style.opacity = "0";
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand("copy");
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** url = path ภายใน (/compare?ids=…) · text = ข้อความนำหน้าลิงก์ตอนแชร์ทาง LINE */
export function ShareTools({ path, text }: { path: string; text: string }) {
  const full = () => `${location.origin}${path}`;
  return (
    <>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        data-share-copy
        onClick={async () => shareToast((await copyText(full())) ? "คัดลอกลิงก์แล้ว — ส่งให้คนอื่นเปิดดูได้เลย" : "คัดลอกไม่สำเร็จ — กรุณาคัดลอกจากแถบที่อยู่")}
      >
        คัดลอกลิงก์แชร์
      </button>
      <a
        className="btn btn-line btn-sm"
        href={`https://line.me/R/msg/text/?${encodeURIComponent(`${text}\n${path}`)}`}
        target="_blank"
        rel="noopener"
        onClick={(e) => {
          e.currentTarget.href = `https://line.me/R/msg/text/?${encodeURIComponent(`${text}\n${full()}`)}`;
        }}
      >
        แชร์ทาง LINE
      </a>
    </>
  );
}
