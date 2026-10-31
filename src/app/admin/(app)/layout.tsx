// โครงหลังบ้าน (เมนูด้านข้างตามต้นแบบ) — ทุกหน้าในนี้ต้องล็อกอิน
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAction } from "../actions";
import { IdleGuard, SideToggle } from "../_components/AdminClient";
import { AdminNav } from "../_components/AdminNav";
import { TopTools } from "../_components/TopTools";
import "../lot12.css";

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
  dash: <><rect x="3" y="3" width="8" height="10" /><rect x="13" y="3" width="8" height="6" /><rect x="13" y="11" width="8" height="10" /><rect x="3" y="15" width="8" height="6" /></>,
  inbox: <path d="M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z" />,
  report: <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />,
  stock: <path d="M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10M7 5l9 4" />,
  pages: <path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h4" />,
  users: <><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3-6 7-6s7 2 7 6M17 11l2 2 4-4" /></>,
  system: <><rect x="3" y="4" width="18" height="12" /><path d="M8 20h8M12 16v4" /></>,
  specs: <path d="M4 6h16M4 12h16M4 18h16M9 4v4M15 10v4M7 16v4" />,
  coupon: <path d="M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V4H3zM9 4v16" />,
  claim: <><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  // ล็อต 10: รีวิว · รอสินค้าเข้า · หน้าแรก · ผลงาน · บทความ · ค้นหา · redirect
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  bell: <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" />,
  home: <path d="M3 11 12 4l9 7M5 10v10h14V10M10 20v-5h4v5" />,
  photo: <><rect x="3" y="5" width="18" height="14" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-8 8" /></>,
  post: <path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />,
  search: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></>,
  redirect: <path d="M4 7h11a4 4 0 0 1 0 8H8M8 11l-4 4 4 4" />,
  task: <><rect x="4" y="4" width="16" height="16" /><path d="m8 12 3 3 5-6" /></>,
  po: <path d="M3 4h2l2 11h11l2-8H7M9 20h.01M17 20h.01M12 9v4M10 11h4" />,
  backup: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>,
  shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6zM9 12l2 2 4-4" />,
  image: <><rect x="3" y="5" width="18" height="14" /><circle cx="9" cy="10" r="1.6" /><path d="m3 17 6-5 4 4 3-2 5 4" /></>,
};
const Ico = ({ k }: { k: keyof typeof ICON }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    {ICON[k]}
  </svg>
);
export default async function AdminAppLayout({ children }: LayoutProps<"/admin">) {
  // หน้า "บัญชีของฉัน" ต้องเปิดได้แม้ยังต้องเปลี่ยนรหัสผ่าน — หน้าอื่นตรวจซ้ำด้วย requireAdmin() ของตัวเองและพามาที่นี่
  const admin = await requireAdmin({ allowPasswordChange: true });
  const owner = admin.role === "OWNER";
  const [pending, unpaid, inquiries, claims, docSlips, reviews, waiting, myOverdue, pdpaNew] = await Promise.all([
    prisma.order.count({ where: { status: "PENDING_VERIFICATION" } }), // รวม COD ที่รอยืนยัน
    prisma.salesDocument.count({ where: { type: "INVOICE", status: { in: ["ISSUED", "PARTIAL"] } } }),
    prisma.inquiry.count({ where: { status: "NEW" } }),
    prisma.claim.count({ where: { status: "NEW" } }),
    prisma.docSlip.count({ where: { status: "PENDING" } }),
    prisma.review.count({ where: { status: "PENDING" } }),
    prisma.stockAlert.count({ where: { notifiedAt: null } }),
    // A25: งานของฉันที่เกินกำหนด (ป้ายแดงที่เมนู "งานที่ต้องทำ")
    prisma.adminTask.count({ where: { done: false, assigneeId: admin.id, dueAt: { lt: new Date() } } }),
    owner ? prisma.dataRequest.count({ where: { status: "NEW" } }) : 0,
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
          locked={admin.mustChangePassword}
          items={[
            { href: "/admin/dashboard", label: "ภาพรวม", icon: <Ico k="dash" />, group: "งานประจำวัน" },
            { href: "/admin", label: "คำสั่งซื้อ", icon: <Ico k="orders" />, badge: pending, group: "งานประจำวัน" },
            { href: "/admin/inquiries", label: "คำขอจากลูกค้า", icon: <Ico k="inbox" />, badge: inquiries, group: "งานประจำวัน" },
            { href: "/admin/claims", label: "เคลม / คืนสินค้า", icon: <Ico k="claim" />, badge: claims, group: "งานประจำวัน" },
            { href: "/admin/tasks", label: "งานที่ต้องทำ", icon: <Ico k="task" />, badge: myOverdue, group: "งานประจำวัน" },
            // ทุกรายการที่มี group ต้องอยู่ต่อกันใต้หัวข้อนั้น (รายการที่ไม่มี group จะแสดงใต้หัวข้อก่อนหน้า)
            { href: "/admin/categories", label: "หมวดหมู่สินค้า", icon: <Ico k="cats" />, group: "สินค้าและหน้าร้าน" },
            { href: "/admin/products", label: "สินค้า", icon: <Ico k="products" />, group: "สินค้าและหน้าร้าน" },
            { href: "/admin/stock", label: "สต็อก", icon: <Ico k="stock" />, group: "สินค้าและหน้าร้าน" },
            { href: "/admin/purchase-orders", label: "ใบสั่งซื้อ (PO)", icon: <Ico k="po" />, group: "สินค้าและหน้าร้าน" },
            { href: "/admin/coupons", label: "คูปองส่วนลด", icon: <Ico k="coupon" />, group: "สินค้าและหน้าร้าน" },
            { href: "/admin/specs", label: "สเปกสินค้าต่อหมวด", icon: <Ico k="specs" />, group: "สินค้าและหน้าร้าน" },
            { href: "/admin/slides", label: "สไลด์หน้าแรก", icon: <Ico k="slides" />, group: "สินค้าและหน้าร้าน" },
            { href: "/admin/media", label: "ตรวจรูปภาพ", icon: <Ico k="image" />, group: "สินค้าและหน้าร้าน" },
            { href: "/admin/pages", label: "หน้าเนื้อหา / FAQ", icon: <Ico k="pages" />, group: "สินค้าและหน้าร้าน" },
            { href: "/admin/reviews", label: "รีวิวสินค้า", icon: <Ico k="star" />, badge: reviews, group: "สินค้าและหน้าร้าน" },
            { href: "/admin/stock-alerts", label: "รอสินค้าเข้า", icon: <Ico k="bell" />, badge: waiting, group: "สินค้าและหน้าร้าน" },
            { href: "/admin/home", label: "หน้าแรก / ความน่าเชื่อถือ", icon: <Ico k="home" />, group: "สินค้าและหน้าร้าน" },
            { href: "/admin/docs/QUOTATION", label: "ใบเสนอราคา", icon: <Ico k="qt" />, group: "เอกสารขาย" },
            { href: "/admin/docs/INVOICE", label: "ใบแจ้งหนี้", icon: <Ico k="iv" />, badge: unpaid, group: "เอกสารขาย" },
            { href: "/admin/docs/RECEIPT", label: "ใบเสร็จรับเงิน", icon: <Ico k="rc" />, group: "เอกสารขาย" },
            { href: "/admin/docs/slips", label: "สลิปจากลิงก์ใบแจ้งหนี้", icon: <Ico k="iv" />, badge: docSlips, group: "เอกสารขาย" },
            { href: "/admin/customers", label: "ลูกค้า", icon: <Ico k="cust" />, group: "เอกสารขาย" },
            { href: "/admin/projects", label: "ผลงานติดตั้ง", icon: <Ico k="photo" />, group: "เนื้อหาและ SEO" },
            { href: "/admin/posts", label: "บทความ", icon: <Ico k="post" />, group: "เนื้อหาและ SEO" },
            { href: "/admin/search", label: "ค้นหา / คำพ้อง", icon: <Ico k="search" />, group: "เนื้อหาและ SEO" },
            { href: "/admin/redirects", label: "Redirect / หน้า 404", icon: <Ico k="redirect" />, group: "เนื้อหาและ SEO" },
            { href: "/admin/reports", label: "รายงานยอดขาย", icon: <Ico k="report" />, group: "รายงาน" },
            { href: "/admin/log", label: "บันทึกการใช้งาน", icon: <Ico k="log" />, group: "รายงาน" },
            ...(owner
              ? [
                  { href: "/admin/settings", label: "ตั้งค่าร้าน", icon: <Ico k="settings" />, group: "ระบบ" },
                  { href: "/admin/users", label: "ผู้ใช้หลังบ้าน", icon: <Ico k="users" />, group: "ระบบ" },
                  { href: "/admin/line", label: "แจ้งเตือน LINE", icon: <Ico k="line" />, group: "ระบบ" },
                  { href: "/admin/system", label: "สถานะระบบ", icon: <Ico k="system" />, group: "ระบบ" },
                  { href: "/admin/backups", label: "สำรองข้อมูล", icon: <Ico k="backup" />, group: "ระบบ" },
                  { href: "/admin/data-requests", label: "คำขอข้อมูลส่วนบุคคล", icon: <Ico k="shield" />, group: "ระบบ", badge: pdpaNew },
                ]
              : []),
            { href: "/admin/account", label: "บัญชีของฉัน", icon: <Ico k="users" />, group: "ระบบ" },
            { href: "/", label: "ดูหน้าร้าน", icon: <Ico k="shop" />, group: "ระบบ", external: true },
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
        {!admin.mustChangePassword && <TopTools />}
        {children}
      </div>
      <IdleGuard />
    </div>
  );
}
