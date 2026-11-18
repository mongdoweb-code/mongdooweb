// ปรับ HTML ส่วนเดิมของหน้าแรก (_markup/home.ts) ตามข้อมูลจริงฝั่ง server (pure — ทดสอบใน tests/unit/privacy.test.ts)
// ("ทำไมต้องมองดูเว็บ" ย้ายไป src/lib/why-us.ts — แก้ได้ที่ /admin/home/why)
// - "ช่องทางชำระเงิน": เพิ่มชิปเก็บเงินปลายทาง / รับที่ร้าน เฉพาะเมื่อเปิดใช้ในตั้งค่า (ล้างแคชด้วย tag storefront ตอนบันทึกตั้งค่า)

const ICON_COD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="1"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/></svg>`;
const ICON_PICKUP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 9 5 4h14l2 5M3 9h18v11H3zM9 20v-6h6v6"/></svg>`;

/** ชิปช่องทางชำระเงิน/รับสินค้าเพิ่มเติม ต่อท้ายแถว "ช่องทางชำระเงิน" */
export function withPayOptions(html: string, opt: { codEnabled: boolean; pickupEnabled: boolean }) {
  const chips = [
    opt.codEnabled ? `<span class="pay-chip" data-pay="cod">${ICON_COD}เก็บเงินปลายทาง</span>` : "",
    opt.pickupEnabled ? `<span class="pay-chip" data-pay="pickup">${ICON_PICKUP}รับที่ร้าน</span>` : "",
  ].join("");
  if (!chips) return html;
  return html.replace(/(<div class="pay-row reveal">[\s\S]*?)(\n?\s*<\/div>)/, (_m, a: string, b: string) => `${a}${chips}${b}`);
}
