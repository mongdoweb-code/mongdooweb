// ย่อรูปในเบราว์เซอร์ก่อนอัปโหลด (รูปจากมือถือ 8–12 MB → JPEG ด้านยาวไม่เกิน 2000px และไม่เกิน 1.5 MB)
// ใช้กับแนบสลิป (หน้าติดตาม) และรูปพื้นที่ (ขอใบเสนอราคา) — หน้าชำระเงินใช้ฟังก์ชันเดียวกันใน public/js/checkout.js

export const COMPRESS_TARGET = 1.5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const fmtSize = (b: number) => (b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");

async function decode(file: File): Promise<{ src: CanvasImageSource; w: number; h: number }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { src: bmp, w: bmp.width, h: bmp.height };
  } catch {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = URL.createObjectURL(file);
    });
    return { src: img, w: img.naturalWidth, h: img.naturalHeight };
  }
}

export async function compressImage(file: File, target = COMPRESS_TARGET, maxDim = 2000): Promise<File> {
  if (file.size <= target) return file;
  const { src, w, h } = await decode(file);
  let scale = Math.min(1, maxDim / Math.max(w, h));
  let best: Blob | null = null;
  const name = file.name.replace(/\.\w+$/, "") + ".jpg";
  for (let round = 0; round < 6; round++) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * scale));
    c.height = Math.max(1, Math.round(h * scale));
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0, c.width, c.height);
    for (const q of [0.85, 0.75, 0.65, 0.55]) {
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", q));
      if (!blob) continue;
      best = blob;
      if (blob.size <= target) return new File([blob], name, { type: "image/jpeg" });
    }
    scale *= 0.75;
  }
  return best ? new File([best], name, { type: "image/jpeg" }) : file;
}

/** ส่ง FormData พร้อมแถบความคืบหน้า */
export function uploadWithProgress(url: string, fd: FormData, onProgress: (p: number) => void) {
  return new Promise<{ ok: boolean; status: number; data: Record<string, unknown> }>((resolve) => {
    const x = new XMLHttpRequest();
    x.open("POST", url);
    x.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    x.onload = () => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(x.responseText);
      } catch {}
      resolve({ ok: x.status >= 200 && x.status < 300, status: x.status, data });
    };
    x.onerror = x.onabort = () => resolve({ ok: false, status: 0, data: {} });
    x.send(fd);
  });
}
