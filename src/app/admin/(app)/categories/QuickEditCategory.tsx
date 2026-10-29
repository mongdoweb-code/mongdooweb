"use client";
// แผงแก้ไขด่วนของหมวด (เปิดจาก "แก้ไขด่วน" ใต้ชื่อหมวด): ชื่อ กลุ่ม คำยอดนิยม การแสดงผล — ไม่ต้องเปิดฟอร์มเต็ม
import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QuickDrawer, useQuickOpen } from "../../_components/QuickDrawer";
import type { CatState } from "./actions";

export type QuickCategory = { kind: "category"; id: string; nameTh: string; nameEn: string; slug: string; group: string; popular: string; showOnHome: boolean; isActive: boolean; count: number };
const GROUPS = [["WATER", "งานน้ำ"], ["OUTDOOR", "สวนและภายนอก"], ["BUILDING", "อาคารและภายใน"], ["DECO", "อุปกรณ์และตกแต่ง"]] as const;

export function QuickEditCategory({ action }: { action: (f: FormData) => Promise<CatState> }) {
  const router = useRouter();
  const [c, setC] = useState<QuickCategory | null>(null);
  const [res, setRes] = useState<CatState>({});
  const [toast, setToast] = useState("");
  const [pending, start] = useTransition();
  useQuickOpen<QuickCategory>("category", (d) => {
    setC(d);
    setRes({});
  });
  const close = useCallback(() => setC(null), []);
  const bad = (k: string) => (res.fields?.includes(k) ? "bad" : undefined);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await action(fd);
      setRes(r);
      if (r.ok) {
        setToast(`✓ บันทึกหมวด ${fd.get("nameTh")} แล้ว`);
        setTimeout(() => setToast(""), 2500);
        setC(null);
        router.refresh();
      }
    });
  };

  return (
    <>
      {toast && <div className="sort-toast" role="status"><span className="sort-msg ok">{toast}</span></div>}
      <QuickDrawer
        open={!!c}
        title={c?.nameTh ?? ""}
        sub={c && <>/category/{c.slug} · สินค้า {c.count} รายการ · <a className="link" href={`/admin/categories?edit=${c.id}`}>เปิดฟอร์มเต็ม</a></>}
        onClose={close}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={close}>ยกเลิก</button>
            <button type="submit" form="qeCategory" className="btn btn-primary" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึก"}</button>
          </>
        }
      >
        {c && (
          <form id="qeCategory" className="qd-form" onSubmit={submit} key={c.id}>
            <input type="hidden" name="id" value={c.id} />
            {res.error && <div className="login-err" role="alert">{res.error}</div>}
            <div className="qd-two">
              <div className="field"><label htmlFor="qcTh">ชื่อหมวด (ไทย)</label><input id="qcTh" name="nameTh" defaultValue={c.nameTh} maxLength={80} className={bad("nameTh")} /></div>
              <div className="field"><label htmlFor="qcEn">ชื่อหมวด (อังกฤษ)</label><input id="qcEn" name="nameEn" defaultValue={c.nameEn} maxLength={80} className={bad("nameEn")} /></div>
            </div>
            <div className="field">
              <label htmlFor="qcGroup">กลุ่มในเมนู</label>
              <select id="qcGroup" name="group" defaultValue={c.group}>
                {GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor="qcPop">คำยอดนิยมบนการ์ดหมวด (สูงสุด 4, คั่นด้วย ,)</label><input id="qcPop" name="popular" defaultValue={c.popular} placeholder="เช่น แสงขาว, RGB เปลี่ยนสี" /></div>
            <fieldset className="qd-sec">
              <legend>👁️ การแสดงผล</legend>
              <label className="chk-row"><input type="checkbox" name="isActive" defaultChecked={c.isActive} /> เปิดหมวด (แสดงบนหน้าร้าน)</label>
              <label className="chk-row"><input type="checkbox" name="showOnHome" defaultChecked={c.showOnHome} /> แสดงในเมนูและการ์ดหมวดหน้าแรก</label>
            </fieldset>
          </form>
        )}
      </QuickDrawer>
    </>
  );
}
