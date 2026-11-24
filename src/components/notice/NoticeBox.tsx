// กล่องข้อความแจ้งเตือนหน้าสินค้า — ใช้ทั้งหน้าร้านและตัวอย่างในหลังบ้าน (ไม่มี state, ไม่มี HTML จากผู้ใช้)
import { noticeIconPath, noticeParts, type NoticeView } from "@/lib/notices";
import "./notice.css";

export function NoticeBox({ n }: { n: Pick<NoticeView, "text" | "tone" | "icon"> }) {
  const parts = noticeParts(n.text);
  return (
    <div className={`ntc ntc-${n.tone.toLowerCase()}${n.icon === "none" ? " no-ic" : ""}`} data-notice={n.tone}>
      {n.icon !== "none" && (
        <span className="ntc-ic" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: noticeIconPath(n.icon) }} />
        </span>
      )}
      <p className="ntc-tx">{parts.map((p, i) => (p.b ? <b key={i}>{p.t}</b> : <span key={i}>{p.t}</span>))}</p>
    </div>
  );
}

export function NoticeList({ items, className = "" }: { items: NoticeView[]; className?: string }) {
  if (!items.length) return null;
  return (
    <div className={`ntc-list ${className}`.trim()} role="note" aria-label="ข้อควรทราบก่อนสั่งซื้อ">
      {items.map((n) => <NoticeBox key={n.id} n={n} />)}
    </div>
  );
}
