/* service worker ของหน้าร้าน (U29 — ใช้งานได้แม้เน็ตไม่ดี)
   - เก็บเฉพาะ "โครงหน้า" ที่ไม่มีข้อมูลส่วนตัว: หน้าออฟไลน์ (offline.html) + ไฟล์ static (/_next/static, /js, /img, /icons)
   - หน้า HTML ทุกหน้าโหลดจากเน็ตเสมอ ไม่เก็บลงเครื่อง — เน็ตหลุดตอนเปิดหน้า = แสดงหน้าออฟไลน์
   - ไม่ยุ่งกับหลังบ้าน (/admin), API (/api), รูปที่อัปโหลด/สลิป และคำขอที่ไม่ใช่ GET เลย
   ตะกร้าเก็บใน localStorage ของเครื่องลูกค้าอยู่แล้ว (ไม่หายเมื่อเน็ตหลุด/ปิดหน้า) */
const VERSION = 'mdw-shell-v1';
const OFFLINE = '/offline.html';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll([OFFLINE])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('mdw-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const PRIVATE = /^\/(admin|api|media|track\/receipt|_mdw)(\/|$)/;
const STATIC = /^\/(_next\/static|js|img|icons)\//;

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || PRIVATE.test(url.pathname)) return;

  // หน้าเว็บ: เน็ตก่อนเสมอ (ไม่เก็บ HTML) — ล้มเหลว = หน้าออฟไลน์
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }

  // ไฟล์ static: ใช้ของในเครื่องทันที แล้วอัปเดตเบื้องหลัง (stale-while-revalidate)
  if (STATIC.test(url.pathname)) {
    e.respondWith(
      caches.open(VERSION).then(async c => {
        const hit = await c.match(req);
        const net = fetch(req)
          .then(res => {
            if (res.ok && res.type === 'basic') c.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || net;
      })
    );
  }
});
