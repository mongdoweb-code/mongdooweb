// ปุ่มไอคอนในคอลัมน์ "การดำเนินการ": ดู (ฟ้า) · แก้ไข (ส้ม) · ลบ (แดง) + ปุ่มจับลาก/ปักหมุด — มีป้ายชื่อเมื่อชี้ (data-tip)
import Link from "next/link";
import { ConfirmSubmit } from "./AdminClient";

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" } as const;
export const Icons = {
  eye: (
    <svg viewBox="0 0 24 24" {...P} aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
  ),
  edit: (
    <svg viewBox="0 0 24 24" {...P} aria-hidden="true"><path d="M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6" /><path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z" /></svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" {...P} aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></svg>
  ),
  grip: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="5.5" r="1.6" /><circle cx="15" cy="5.5" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18.5" r="1.6" /><circle cx="15" cy="18.5" r="1.6" /></svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" {...P} aria-hidden="true"><path d="m12 2.8 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9Z" /></svg>
  ),
  top: (
    <svg viewBox="0 0 24 24" {...P} aria-hidden="true"><path d="M5 4h14M12 20V9m-5 5 5-5 5 5" /></svg>
  ),
  bottom: (
    <svg viewBox="0 0 24 24" {...P} aria-hidden="true"><path d="M5 20h14M12 4v11m-5-5 5 5 5-5" /></svg>
  ),
};

/** ปุ่มจับสำหรับลาก (ใช้คู่กับ SortableRows) — โฟกัสแล้วกด ↑ ↓ ได้ */
export function DragHandle({ label }: { label: string }) {
  return (
    <button type="button" className="drag-h" data-drag-handle aria-label={`ลากเพื่อจัดลำดับ ${label} (หรือกดลูกศรขึ้น/ลง)`} data-tip="ลากเพื่อจัดลำดับ">
      {Icons.grip}
    </button>
  );
}

/** ดู / แก้ไข / ลบ — ไม่ส่ง prop ไหน = ไม่แสดงปุ่มนั้น · disabled* = แสดงจางพร้อมเหตุผล */
export function RowActions({
  name,
  viewHref,
  viewDisabled,
  editHref,
  del,
}: {
  name: string;
  viewHref?: string;
  viewDisabled?: string;
  editHref?: string;
  del?: { action: (f: FormData) => Promise<void>; id: string; title: string; body: string; label?: string; disabled?: string };
}) {
  return (
    <div className="row-acts">
      {viewHref !== undefined &&
        (viewDisabled ? (
          <span className="ra ra-view" aria-disabled="true" data-tip={viewDisabled}>{Icons.eye}<span className="sr-only">ดู {name} ({viewDisabled})</span></span>
        ) : (
          <a className="ra ra-view" href={viewHref} target="_blank" rel="noopener" data-tip="ดู" aria-label={`ดู ${name} (แท็บใหม่)`}>{Icons.eye}</a>
        ))}
      {editHref && (
        <Link className="ra ra-edit" href={editHref} data-tip="แก้ไข" aria-label={`แก้ไข ${name}`}>{Icons.edit}</Link>
      )}
      {del &&
        (del.disabled ? (
          <span className="ra ra-del" aria-disabled="true" data-tip={del.disabled}>{Icons.trash}<span className="sr-only">ลบ {name} ({del.disabled})</span></span>
        ) : (
          <form action={del.action}>
            <input type="hidden" name="id" value={del.id} />
            <ConfirmSubmit className="ra ra-del" title={del.title} body={del.body} confirmLabel={del.label ?? "ลบ"} tip="ลบ" ariaLabel={`ลบ ${name}`}>
              {Icons.trash}
            </ConfirmSubmit>
          </form>
        ))}
    </div>
  );
}
