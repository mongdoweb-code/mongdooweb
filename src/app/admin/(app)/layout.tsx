// โครงหลังบ้าน (เมนูด้านข้างตามต้นแบบ) — ทุกหน้าในนี้ต้องล็อกอิน
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAction } from "../actions";
import { IdleGuard, SideToggle } from "../_components/AdminClient";
import { AdminNav } from "../_components/AdminNav";
import { TopTools } from "../_components/TopTools";
import { Ico } from "../_components/admin-icons";
import { QuickBar } from "../_components/QuickBar";
import { availableQuickItems, parseQuickMenu } from "@/lib/quick-menu";
import "../lot12.css";

export default async function AdminAppLayout({ children }: LayoutProps<"/admin">) {
  // หน้า "บัญชีของฉัน" ต้องเปิดได้แม้ยังต้องเปลี่ยนรหัสผ่าน — หน้าอื่นตรวจซ้ำด้วย requireAdmin() ของตัวเองและพามาที่นี่
  const admin = await requireAdmin({ allowPasswordChange: true });
  const owner = admin.role === "OWNER";
  const [pending, unpaid, inquiries, claims, docSlips, reviews, waiting, myOverdue, pdpaNew, countsOpen, me] = await Promise.all([
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
    prisma.stockCount.count({ where: { status: "OPEN" } }),
    prisma.admin.findUnique({ where: { id: admin.id }, select: { quickMenu: true } }),
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
            { href: "/admin/stock/count", label: "นับสต็อกทั้งร้าน", icon: <Ico k="count" />, badge: countsOpen, group: "สินค้าและหน้าร้าน" },
            { href: "/admin/purchase-orders", label: "ใบสั่งซื้อ (PO)", icon: <Ico k="po" />, group: "สินค้าและหน้าร้าน" },
            ...(owner ? [{ href: "/admin/suppliers", label: "ผู้ขาย", icon: <Ico k="truck" />, group: "สินค้าและหน้าร้าน" }] : []),
            { href: "/admin/coupons", label: "คูปองส่วนลด", icon: <Ico k="coupon" />, group: "สินค้าและหน้าร้าน" },
            { href: "/admin/specs", label: "สเปกสินค้าต่อหมวด", icon: <Ico k="specs" />, group: "สินค้าและหน้าร้าน" },
            { href: "/admin/slides", label: "สไลด์หน้าแรก", icon: <Ico k="slides" />, group: "สินค้าและหน้าร้าน" },
            { href: "/admin/media", label: "ตรวจรูปภาพ", icon: <Ico k="image" />, group: "สินค้าและหน้าร้าน" },
            { href: "/admin/pages", label: "หน้าเนื้อหา / FAQ", icon: <Ico k="pages" />, group: "สินค้าและหน้าร้าน" },
            { href: "/admin/reviews", label: "รีวิวสินค้า", icon: <Ico k="star" />, badge: reviews, group: "สินค้าและหน้าร้าน" },
            { href: "/admin/stock-alerts", label: "รอสินค้าเข้า", icon: <Ico k="bell" />, badge: waiting, group: "สินค้าและหน้าร้าน" },
            { href: "/admin/home", label: "หน้าแรก / ความน่าเชื่อถือ", icon: <Ico k="home" />, group: "สินค้าและหน้าร้าน" },
            { href: "/admin/home/popular", label: "หมวดยอดนิยม (หน้าแรก)", icon: <Ico k="cats" />, group: "สินค้าและหน้าร้าน" },
            { href: "/admin/docs/QUOTATION", label: "ใบเสนอราคา", icon: <Ico k="qt" />, group: "เอกสารขาย" },
            { href: "/admin/docs/INVOICE", label: "ใบแจ้งหนี้", icon: <Ico k="iv" />, badge: unpaid, group: "เอกสารขาย" },
            { href: "/admin/docs/RECEIPT", label: "ใบเสร็จรับเงิน", icon: <Ico k="rc" />, group: "เอกสารขาย" },
            { href: "/admin/docs/CREDIT_NOTE", label: "ใบลดหนี้ / คืนเงิน", icon: <Ico k="cn" />, group: "เอกสารขาย" },
            { href: "/admin/docs/slips", label: "สลิปจากลิงก์ใบแจ้งหนี้", icon: <Ico k="iv" />, badge: docSlips, group: "เอกสารขาย" },
            { href: "/admin/customers", label: "ลูกค้า", icon: <Ico k="cust" />, group: "เอกสารขาย" },
            { href: "/admin/projects", label: "ผลงานติดตั้ง", icon: <Ico k="photo" />, group: "เนื้อหาและ SEO" },
            { href: "/admin/posts", label: "บทความ", icon: <Ico k="post" />, group: "เนื้อหาและ SEO" },
            { href: "/admin/search", label: "ค้นหา / คำพ้อง", icon: <Ico k="search" />, group: "เนื้อหาและ SEO" },
            { href: "/admin/redirects", label: "Redirect / หน้า 404", icon: <Ico k="redirect" />, group: "เนื้อหาและ SEO" },
            { href: "/admin/reports", label: "รายงานยอดขาย", icon: <Ico k="report" />, group: "รายงาน" },
            { href: "/admin/reports/daily", label: "ปิดยอดประจำวัน", icon: <Ico k="cash" />, group: "รายงาน" },
            { href: "/admin/reports/receivables", label: "ลูกหนี้ค้างชำระ", icon: <Ico k="debt" />, group: "รายงาน" },
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
            { href: "/admin/help", label: "คู่มือการใช้งาน", icon: <Ico k="help" />, group: "ระบบ" },
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
        {!admin.mustChangePassword && <TopTools quick={<QuickBar selected={parseQuickMenu(me?.quickMenu, owner)} available={availableQuickItems(owner)} />} />}
        {children}
      </div>
      <IdleGuard />
    </div>
  );
}
