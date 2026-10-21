// /admin/users — ผู้ใช้หลังบ้าน (เจ้าของร้านเท่านั้น): เพิ่ม/ปิดบัญชี/รีเซ็ตรหัส/ล้าง 2FA + อุปกรณ์ที่เข้าสู่ระบบของทุกคน
import { listSessions, requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SessionList } from "../account/SessionList";
import { revokeUserSession } from "./actions";
import { NewUserForm, UserCard, type UserView } from "./UserForms";

const fmt = (d: Date) => d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const me = await requireOwner();
  const sp = await searchParams;
  const [users, sessions] = await Promise.all([prisma.admin.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "asc" }] }), listSessions(me)]);
  const count = (id: string) => sessions.filter((s) => s.adminId === id).length;
  const view: UserView[] = users.map((u) => ({
    id: u.id, username: u.username, displayName: u.displayName, role: u.role, isActive: u.isActive, totpEnabled: u.totpEnabled,
    mustChangePassword: u.mustChangePassword, lastLogin: u.lastLoginAt ? fmt(u.lastLoginAt) : null, sessions: count(u.id), created: fmt(u.createdAt),
  }));
  const revoked = one(sp.revoked);
  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>ผู้ใช้หลังบ้าน</h1>
          <p>เจ้าของร้านแก้ได้ทุกอย่าง · พนักงานตรวจสลิป จัดส่ง ออกเอกสาร ดูแลลูกค้าและคำขอได้ แต่แก้ตั้งค่าร้าน ผู้ใช้ LINE และลบข้อมูลไม่ได้</p>
        </div>
      </div>
      <div className="notice-stack">
        {/^\d+$/.test(revoked) && <div className="ok-box" role="status">ออกจากระบบแล้ว {revoked} เครื่อง</div>}
        {one(sp.err) === "notfound" && <div className="err-box" role="alert">ไม่พบอุปกรณ์นี้ (อาจออกจากระบบไปแล้ว)</div>}
      </div>
      <div className="users-wrap">
        <ul className="u-list">
          {view.map((u) => <UserCard key={u.id} u={u} me={me.id} />)}
        </ul>
        <NewUserForm />
      </div>
      <section className="panel" id="sessions" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <div>
            <h2>อุปกรณ์ที่เข้าสู่ระบบอยู่ (ทุกผู้ใช้)</h2>
            <p>ไม่ใช้งานเกิน 30 นาทีจะหลุดอัตโนมัติ · อายุสูงสุด 12 ชั่วโมง</p>
          </div>
        </div>
        <SessionList rows={sessions} showUser action={revokeUserSession} />
      </section>
    </main>
  );
}
