// เมนูด้านซ้ายของหลังบ้าน — แหล่งเดียว (ไม่มี import ใช้ได้ทั้ง server/client)
// ใช้สร้าง: เมนูด้านซ้าย ((app)/layout.tsx) และรายการให้เลือกใน "ตั้งค่าเมนูด่วน" (src/lib/quick-menu.ts)
// → เพิ่มเมนูใหม่ที่นี่ที่เดียว เมนูด่วนมีให้เลือกอัตโนมัติ
// key: คีย์ถาวรที่บันทึกในเมนูด่วนของแต่ละคน (Admin.quickMenu) — ห้ามเปลี่ยนคีย์เดิม (การตั้งค่าของผู้ใช้จะหาย)
// ทุกรายการในกลุ่มเดียวกันต้องอยู่ติดกัน (เมนูซ้ายแสดงหัวข้อกลุ่มเมื่อกลุ่มเปลี่ยน)

/** ตัวเลขป้ายแจ้งเตือนข้างเมนู (layout นับให้) */
export type MenuBadge = "pending" | "unpaid" | "inquiries" | "claims" | "docSlips" | "reviews" | "waiting" | "myOverdue" | "pdpaNew" | "countsOpen";

export type AdminMenuItem = {
  key: string;
  href: string;
  label: string;
  /** คีย์ไอคอนใน src/app/admin/_components/admin-icons.tsx */
  icon: string;
  group: string;
  ownerOnly?: boolean;
  badge?: MenuBadge;
  /** เปิดแท็บใหม่ (หน้าร้าน) */
  external?: boolean;
};

const G1 = "งานประจำวัน", G2 = "สินค้าและหน้าร้าน", G3 = "เอกสารขาย", G4 = "เนื้อหาและ SEO", G5 = "รายงาน", G6 = "ระบบ";

export const ADMIN_MENU: AdminMenuItem[] = [
  { key: "dashboard", href: "/admin/dashboard", label: "ภาพรวม", icon: "dash", group: G1 },
  { key: "orders", href: "/admin", label: "คำสั่งซื้อ", icon: "orders", group: G1, badge: "pending" },
  { key: "inquiries", href: "/admin/inquiries", label: "คำขอจากลูกค้า", icon: "inbox", group: G1, badge: "inquiries" },
  { key: "claims", href: "/admin/claims", label: "เคลม / คืนสินค้า", icon: "claim", group: G1, badge: "claims" },
  { key: "tasks", href: "/admin/tasks", label: "งานที่ต้องทำ", icon: "task", group: G1, badge: "myOverdue" },

  { key: "categories", href: "/admin/categories", label: "หมวดหมู่สินค้า", icon: "cats", group: G2 },
  { key: "products", href: "/admin/products", label: "สินค้า", icon: "products", group: G2 },
  { key: "product-order", href: "/admin/products/order", label: "จัดเรียงสินค้าหน้าร้าน", icon: "sort", group: G2 },
  { key: "stock", href: "/admin/stock", label: "สต็อก", icon: "stock", group: G2 },
  { key: "stock-count", href: "/admin/stock/count", label: "นับสต็อกทั้งร้าน", icon: "count", group: G2, badge: "countsOpen" },
  { key: "po", href: "/admin/purchase-orders", label: "ใบสั่งซื้อ (PO)", icon: "po", group: G2 },
  { key: "suppliers", href: "/admin/suppliers", label: "ผู้ขาย", icon: "truck", group: G2, ownerOnly: true },
  { key: "coupons", href: "/admin/coupons", label: "คูปองส่วนลด", icon: "coupon", group: G2 },
  { key: "specs", href: "/admin/specs", label: "สเปกสินค้าต่อหมวด", icon: "specs", group: G2 },
  { key: "notices", href: "/admin/notices", label: "ข้อความแจ้งเตือนสินค้า", icon: "bell", group: G2 },
  { key: "slides", href: "/admin/slides", label: "สไลด์หน้าแรก", icon: "slides", group: G2 },
  { key: "media", href: "/admin/media", label: "ตรวจรูปภาพ", icon: "image", group: G2 },
  { key: "pages", href: "/admin/pages", label: "หน้าเนื้อหา / FAQ", icon: "pages", group: G2 },
  { key: "reviews", href: "/admin/reviews", label: "รีวิวสินค้า", icon: "star", group: G2, badge: "reviews" },
  { key: "stock-alerts", href: "/admin/stock-alerts", label: "รอสินค้าเข้า", icon: "bell", group: G2, badge: "waiting" },
  { key: "home", href: "/admin/home", label: "หน้าแรก / ความน่าเชื่อถือ", icon: "home", group: G2 },
  { key: "home-popular", href: "/admin/home/popular", label: "หมวดยอดนิยม (หน้าแรก)", icon: "cats", group: G2 },
  { key: "home-why", href: "/admin/home/why", label: "ทำไมต้องมองดูเว็บ (หน้าแรก)", icon: "home", group: G2 },
  { key: "home-nav", href: "/admin/home/nav", label: "เมนูหน้าร้าน (Navbar)", icon: "home", group: G2 },

  { key: "quotes", href: "/admin/docs/QUOTATION", label: "ใบเสนอราคา", icon: "qt", group: G3 },
  { key: "invoices", href: "/admin/docs/INVOICE", label: "ใบแจ้งหนี้", icon: "iv", group: G3, badge: "unpaid" },
  { key: "receipts", href: "/admin/docs/RECEIPT", label: "ใบเสร็จรับเงิน", icon: "rc", group: G3 },
  { key: "credit-notes", href: "/admin/docs/CREDIT_NOTE", label: "ใบลดหนี้ / คืนเงิน", icon: "cn", group: G3 },
  { key: "deliveries", href: "/admin/docs/DELIVERY", label: "ใบส่งของ", icon: "truck", group: G3 },
  { key: "doc-slips", href: "/admin/docs/slips", label: "สลิปจากลิงก์ใบแจ้งหนี้", icon: "iv", group: G3, badge: "docSlips" },
  { key: "customers", href: "/admin/customers", label: "ลูกค้า", icon: "cust", group: G3 },

  { key: "projects", href: "/admin/projects", label: "ผลงานติดตั้ง", icon: "photo", group: G4 },
  { key: "videos", href: "/admin/videos", label: "วิดีโอ", icon: "video", group: G4 },
  { key: "posts", href: "/admin/posts", label: "บทความ", icon: "post", group: G4 },
  { key: "search", href: "/admin/search", label: "ค้นหา / คำพ้อง", icon: "search", group: G4 },
  { key: "redirects", href: "/admin/redirects", label: "Redirect / หน้า 404", icon: "redirect", group: G4 },

  { key: "reports", href: "/admin/reports", label: "รายงานยอดขาย", icon: "report", group: G5 },
  { key: "daily", href: "/admin/reports/daily", label: "ปิดยอดประจำวัน", icon: "cash", group: G5 },
  { key: "receivables", href: "/admin/reports/receivables", label: "ลูกหนี้ค้างชำระ", icon: "debt", group: G5 },
  { key: "expenses", href: "/admin/expenses", label: "ค่าใช้จ่ายร้าน", icon: "cash", group: G5 },
  { key: "wht", href: "/admin/reports/wht", label: "ภาษีถูกหัก ณ ที่จ่าย", icon: "report", group: G5 },
  { key: "log", href: "/admin/log", label: "บันทึกการใช้งาน", icon: "log", group: G5 },

  { key: "settings", href: "/admin/settings", label: "ตั้งค่าร้าน", icon: "settings", group: G6, ownerOnly: true },
  { key: "login-page", href: "/admin/settings/login", label: "หน้าเข้าสู่ระบบ", icon: "login", group: G6, ownerOnly: true },
  { key: "users", href: "/admin/users", label: "ผู้ใช้หลังบ้าน", icon: "users", group: G6, ownerOnly: true },
  { key: "line", href: "/admin/line", label: "แจ้งเตือน LINE", icon: "line", group: G6, ownerOnly: true },
  { key: "system", href: "/admin/system", label: "สถานะระบบ", icon: "system", group: G6, ownerOnly: true },
  { key: "backups", href: "/admin/backups", label: "สำรองข้อมูล", icon: "backup", group: G6, ownerOnly: true },
  { key: "data-requests", href: "/admin/data-requests", label: "คำขอข้อมูลส่วนบุคคล", icon: "shield", group: G6, ownerOnly: true, badge: "pdpaNew" },
  { key: "help", href: "/admin/help", label: "คู่มือการใช้งาน", icon: "help", group: G6 },
  { key: "account", href: "/admin/account", label: "บัญชีของฉัน", icon: "users", group: G6 },
  { key: "shop", href: "/", label: "ดูหน้าร้าน", icon: "shop", group: G6, external: true },
];

/** เมนูซ้ายที่ผู้ใช้คนนี้เห็น */
export const menuFor = (owner: boolean) => ADMIN_MENU.filter((m) => owner || !m.ownerOnly);
