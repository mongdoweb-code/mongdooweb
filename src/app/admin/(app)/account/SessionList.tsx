// ตารางอุปกรณ์ที่เข้าสู่ระบบอยู่ (ใช้ทั้งหน้า "บัญชีของฉัน" และ "ผู้ใช้หลังบ้าน")
import type { SessionRow } from "@/lib/auth";

const fmt = (d: Date) => d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

export function SessionList({ rows, showUser = false, action }: { rows: SessionRow[]; showUser?: boolean; action: (f: FormData) => Promise<void> }) {
  if (!rows.length) return <div className="empty"><b>ไม่มีอุปกรณ์ที่เข้าสู่ระบบอยู่</b></div>;
  return (
    <table className="tbl ses-tbl">
      <thead>
        <tr>
          {showUser && <th>ผู้ใช้</th>}
          <th>อุปกรณ์</th>
          <th>IP</th>
          <th>เข้าสู่ระบบเมื่อ</th>
          <th>ใช้งานล่าสุด</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.key} className={s.current ? "ses-cur" : ""}>
            {showUser && <td className="ses-user"><b>{s.displayName}</b><span className="sub">{s.username}</span></td>}
            <td className="ses-dev"><b>{s.device}</b>{s.current && <span className="chip new">เครื่องนี้</span>}</td>
            <td className="ses-ip num">{s.ip}</td>
            <td className="ses-in sub"><span className="m-lbl">เข้าเมื่อ </span>{fmt(s.createdAt)}</td>
            <td className="ses-seen sub"><span className="m-lbl">ล่าสุด </span>{fmt(s.lastSeenAt)}</td>
            <td className="r ses-act">
              {!s.current && (
                <form action={action}>
                  <input type="hidden" name="key" value={s.key} />
                  <input type="hidden" name="adminId" value={s.adminId} />
                  <button className="btn btn-outline btn-sm" type="submit">ออกจากระบบเครื่องนี้</button>
                </form>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
