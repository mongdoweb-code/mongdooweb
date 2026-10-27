// รุ่นของสคริปต์หน้าร้าน (hash ของ public/js + sw.js คำนวณตอน build ใน next.config.ts) — ต่อท้าย URL สคริปต์ให้เบราว์เซอร์/service worker โหลดไฟล์ใหม่หลัง deploy
export const ASSET_V = process.env.MDW_ASSET_V || "dev";
/** "/js/shell.js" → "/js/shell.js?v=<รุ่น>" */
export const assetUrl = (path: string) => `${path}?v=${ASSET_V}`;
