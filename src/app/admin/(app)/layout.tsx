// โครงหลังบ้าน (เมนูด้านข้างตามต้นแบบ) — ทุกหน้าในนี้ต้องล็อกอิน
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAction } from "../actions";
import { SideToggle } from "../_components/AdminClient";
import { AdminNav } from "../_components/AdminNav";
import { TopTools } from "../_components/TopTools";
import { SaveCenter } from "../_components/SaveCenter";
import { Ico, type IconKey } from "../_components/admin-icons";
import { menuFor, type MenuBadge } from "@/lib/admin-menu";
import { QuickBar } from "../_components/QuickBar";
import { availableQuickItems, parseQuickMenu } from "@/lib/quick-menu";
import "../lot12.css";
import { TypographyStyle } from "@/components/TypographyStyle";
import { googleFontsUrl, parseTypography, typographyCss } from "@/lib/typography";

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
  // ตัวอักษรที่ตั้งจากหลังร้าน (ตั้งค่า → ตัวอักษร)
  const typo = parseTypography((await prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { typography: true } }))?.typography).admin;
  // ตัวเลขป้ายข้างเมนู (คีย์ตาม src/lib/admin-menu.ts)
  const badges: Record<MenuBadge, number> = { pending, unpaid, inquiries, claims, docSlips, reviews, waiting, myOverdue, pdpaNew, countsOpen };
  return (
    <div className="shell">
      <TypographyStyle css={typographyCss(typo, "admin")} url={googleFontsUrl([typo])} />
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
          items={menuFor(owner).map((m) => ({
            href: m.href,
            label: m.label,
            icon: <Ico k={m.icon as IconKey} />,
            group: m.group,
            ...(m.badge ? { badge: badges[m.badge] } : {}),
            ...(m.external ? { external: true } : {}),
          }))}
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
        {/* ป๊อปอัปแจ้งผลการบันทึกทุกเมนู */}
        <SaveCenter />
      </div>
    </div>
  );
}
