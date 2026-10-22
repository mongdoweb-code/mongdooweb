// /admin/notifications — ศูนย์แจ้งเตือน (A28): ทุกเหตุการณ์ล่าสุด แยกที่ยังไม่อ่าน + "อ่านแล้วทั้งหมด"
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { NOTIF_LABEL, notificationFeed, type NotifKind } from "@/lib/notifications";
import { markAllReadAction } from "./actions";
import "../../lot12.css";

const when = (iso: string) => new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

export default async function NotificationsPage() {
  const admin = await requireAdmin();
  const { items, since } = await notificationFeed(admin, 100);
  const unread = items.filter((i) => i.unread).length;
  return (
    <main className="main" id="page-notifications">
      <div className="page-head">
        <div>
          <h1>การแจ้งเตือน</h1>
          <p>ยังไม่อ่าน <b id="notifUnread">{unread}</b> รายการ · อ่านล่าสุดเมื่อ {since.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" })}</p>
        </div>
        <form className="head-actions" action={markAllReadAction}>
          <button className="btn btn-outline" type="submit" disabled={!unread}>ทำเครื่องหมายว่าอ่านแล้วทั้งหมด</button>
        </form>
      </div>
      <section className="panel">
        {items.length ? (
          <ul className="notif-list" id="notifList">
            {items.map((n) => (
              <li key={n.id} className={n.unread ? "unread" : ""} data-kind={n.kind}>
                <span className={`notif-kind k-${n.kind}`}>{NOTIF_LABEL[n.kind as NotifKind]}</span>
                <Link className="row-link" href={n.href}><b>{n.title}</b><span className="sub">{n.detail}</span></Link>
                <time dateTime={n.at} className="sub">{when(n.at)}</time>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty"><b>ยังไม่มีการแจ้งเตือนใน 14 วันที่ผ่านมา</b></div>
        )}
      </section>
    </main>
  );
}
