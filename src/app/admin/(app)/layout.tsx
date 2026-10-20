// โครงหลังบ้าน (เมนูด้านข้างตามต้นแบบ) — ทุกหน้าในนี้ต้องล็อกอิน
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAction } from "../actions";
import { IdleGuard, SideToggle } from "../_components/AdminClient";
import { AdminNav } from "../_components/AdminNav";

const ICON = {
  orders: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />,
  slides: <><rect x="3" y="5" width="18" height="14" /><path d="m3 16 5-5 4 4 3-3 6 6" /><circle cx="16" cy="9" r="1.6" /></>,
  products: <path d="M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10" />,
  cats: <><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" /></>,
  qt: <path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7" />,
  iv: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3" />,
  rc: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 11l2 2 4-4" />,
  cust: <path d="M9 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM2 21c0-4 3-6 7-6s7 2 7 6M16 4a4 4 0 0 1 0 8M22 21c0-3-1.5-5-4-5.7" />,
  line: <><path d="M4 11c0-4 3.6-7 8-7s8 3 8 7-3.6 7-8 7c-.9 0-1.8-.1-2.6-.4L5 19l.8-3.3C4.7 14.4 4 12.8 4 11z" /></>,
  log: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
  shop: <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />,
};
const Ico = ({ k }: { k: keyof typeof ICON }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    {ICON[k]}
  </svg>
);
export default async function AdminAppLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  const [pending, unpaid] = await Promise.all([
    prisma.order.count({ where: { status: "PENDING_VERIFICATION" } }),
    prisma.salesDocument.count({ where: { type: "INVOICE", status: { in: ["ISSUED", "PARTIAL"] } } }),
  ]);
  return (
    <div className="shell">
      <aside className="side" id="side" aria-label="เมนูหลังร้าน">
        <div className="logo">
          <div className="logo-mark">
            <span />
          </div>
          <div>
            มองดูเว็บ<small>ระบบหลังร้าน</small>
          </div>
        </div>
        <AdminNav
          items={[
            { href: "/admin", label: "คำสั่งซื้อ", icon: <Ico k="orders" />, badge: pending },
            { href: "/admin/products", label: "สินค้า", icon: <Ico k="products" /> },
            { href: "/admin/categories", label: "หมวดหมู่สินค้า", icon: <Ico k="cats" /> },
            { href: "/admin/slides", label: "สไลด์หน้าแรก", icon: <Ico k="slides" /> },
            { href: "/admin/docs/QUOTATION", label: "ใบเสนอราคา", icon: <Ico k="qt" />, group: "เอกสารขาย" },
            { href: "/admin/docs/INVOICE", label: "ใบแจ้งหนี้", icon: <Ico k="iv" />, badge: unpaid, group: "เอกสารขาย" },
            { href: "/admin/docs/RECEIPT", label: "ใบเสร็จรับเงิน", icon: <Ico k="rc" />, group: "เอกสารขาย" },
            { href: "/admin/customers", label: "ลูกค้า", icon: <Ico k="cust" />, group: "เอกสารขาย" },
            { href: "/admin/line", label: "แจ้งเตือน LINE", icon: <Ico k="line" />, group: "—" },
            { href: "/admin/log", label: "บันทึกการใช้งาน", icon: <Ico k="log" />, group: "—" },
            { href: "/admin/settings", label: "ตั้งค่าร้าน", icon: <Ico k="settings" />, group: "—" },
            { href: "/", label: "ดูหน้าร้าน", icon: <Ico k="shop" />, group: "—", external: true },
          ]}
        />
        <div className="side-foot">
          <b>{admin.displayName}</b>
          <form action={logoutAction}>
            <button className="link" type="submit">
              ออกจากระบบ
            </button>
          </form>
        </div>
      </aside>
      <div>
        <div className="topbar">
          <SideToggle />
          <div className="logo">
            <div className="logo-mark">
              <span />
            </div>
            หลังร้าน
          </div>
          <span className="tb-page">{admin.displayName}</span>
        </div>
        {children}
      </div>
      <IdleGuard />
    </div>
  );
}
