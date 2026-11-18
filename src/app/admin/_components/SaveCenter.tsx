"use client";
// ศูนย์แจ้งผลการบันทึกของหลังบ้าน (ติดตั้งครั้งเดียวใน layout) — ป๊อปอัป "บันทึกสำเร็จ / ไม่สำเร็จ" แบบเดียวกันทุกเมนู
// แหล่งผล 3 ทาง:
//  1) notifySave() — useFormAction แจ้งให้อัตโนมัติ · ตัวแก้ไขที่เรียก action ตรงแจ้งเอง
//  2) ฟอร์ม server action ในหน้า server (<form action={…}> รวมปุ่มลบ/ยืนยัน): จับตอนส่งฟอร์ม (submit) + ผลตอบกลับของ action
//     (ดูจาก fetch ที่มีหัว Next-Action) → redirect ไปหน้าที่มี ?err= หรือแถบแจ้งข้อผิดพลาดใหม่ = ไม่สำเร็จ · นอกนั้น = สำเร็จ
//     ข้อความใช้แถบแจ้งผลบนหน้า (.ok-box / .login-err) ถ้ามี
//  3) ถ้าฟอร์มแจ้งผลเองแล้ว (ทาง 1) ทาง 2 จะไม่แสดงซ้ำ
// ไม่แสดงสำหรับ: ฟอร์ม GET (ค้นหา/ตัวกรอง) · ฟอร์ม/ส่วนที่มี data-no-popup · action ที่ไม่ได้มาจากการส่งฟอร์ม (โหลดข้อมูล, แจ้งเตือน)
import { useCallback, useEffect, useRef, useState } from "react";
import { SAVE_EVENT, titleFor, type SaveNotice } from "./save-notify";
import { SavePopupCard } from "./SaveResultPopup";

type Shown = SaveNotice & { id: number; title: string; message: string; form: HTMLFormElement | null };
type Pending = { form: HTMLFormElement; label: string; at: number; url: string; errText: string; handled: boolean; settled: boolean };

const ERR_SEL = ".main .login-err[role=alert], .main .l10-err[role=alert], .main [data-save-error]";
const OK_SEL = ".main .ok-box[role=status], .main [data-save-ok]";
const text = (sel: string) => (document.querySelector(sel)?.textContent ?? "").replace(/\s+/g, " ").trim();
const errParam = (href: string) => {
  try {
    const u = new URL(href, location.origin);
    return u.searchParams.get("err") ?? u.searchParams.get("error");
  } catch {
    return null;
  }
};

/** ข้อความบนปุ่มที่กด (หรือ aria-label / title) */
function labelOf(submitter: Element | null, form: HTMLFormElement) {
  const b = (submitter ?? form.querySelector('button[type="submit"], button:not([type]), input[type="submit"]')) as HTMLElement | null;
  if (!b) return "";
  const visible = b instanceof HTMLInputElement ? b.value : b.textContent; // ปุ่ม <button value="…"> ใช้ข้อความบนปุ่ม ไม่ใช่ value
  const t = (b.getAttribute("aria-label") || visible || b.getAttribute("title") || "").replace(/\s+/g, " ").trim();
  return t.length > 40 ? t.slice(0, 40) + "…" : t;
}

/** ฟอร์มที่ควรแจ้งผล: อยู่ในพื้นที่หลักหรือกล่องโต้ตอบ · ไม่ใช่ GET ไปหน้าอื่น (ค้นหา/ตัวกรอง) · ไม่ปิดไว้ด้วย data-no-popup */
function trackable(form: HTMLFormElement, submitter: Element | null) {
  // พื้นที่หลักของหน้า + กล่องโต้ตอบที่วาดนอกพื้นที่หลัก (เช่น ยืนยันยกเลิกเอกสาร)
  if (!form.closest('.main, [role="dialog"], [role="alertdialog"]') || form.closest("[data-no-popup]")) return false;
  const act = (submitter?.getAttribute("formaction") ?? form.getAttribute("action") ?? "").trim();
  if (act.startsWith("javascript:")) return true; // server action (React)
  // มี action เป็น URL = ฟอร์มธรรมดาไปหน้าอื่น (เช่น ค้นหา GET) · ไม่มี action = onSubmit ของ React (useFormAction)
  return !act;
}

const hasActionHeader = (h: HeadersInit | undefined) => {
  if (!h) return false;
  if (h instanceof Headers) return h.has("next-action");
  if (Array.isArray(h)) return h.some(([k]) => k.toLowerCase() === "next-action");
  return Object.keys(h).some((k) => k.toLowerCase() === "next-action");
};

let seq = 0;

export function SaveCenter() {
  const [shown, setShown] = useState<Shown | null>(null);
  const pending = useRef<Pending | null>(null);

  const show = useCallback((n: SaveNotice, label: string, form: HTMLFormElement | null) => {
    const title = n.title ?? titleFor(label, n.ok);
    const message = n.message ?? (n.ok ? (label ? `“${label}” เรียบร้อยแล้ว` : "บันทึกข้อมูลเรียบร้อยแล้ว") : "ลองใหม่อีกครั้ง หรือดูรายละเอียดบนหน้า");
    setShown({ ...n, title, message, form, id: ++seq });
  }, []);

  useEffect(() => {
    // 1) แจ้งผลตรง
    const onNotice = (e: Event) => {
      const n = (e as CustomEvent<SaveNotice>).detail;
      const p = pending.current;
      const recent = p && Date.now() - p.at < 30_000;
      if (recent) p.handled = true;
      if (!n || n.silent) return;
      show(n, recent ? p.label : "", recent ? p.form : null);
    };
    window.addEventListener(SAVE_EVENT, onNotice);

    // 2) จับการส่งฟอร์ม
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || !trackable(form, e.submitter)) return;
      pending.current = { form, label: labelOf(e.submitter, form), at: Date.now(), url: location.href, errText: text(ERR_SEL), handled: false, settled: false };
    };
    document.addEventListener("submit", onSubmit, true);

    // ผลตอบกลับของ server action
    const finish = (p: Pending, res: Response | null) => {
      if (p.settled) return;
      p.settled = true;
      const redirect = res?.headers.get("x-action-redirect") ?? "";
      const start = Date.now();
      const settle = () => {
        if (p.handled || pending.current !== p) return; // ฟอร์มแจ้งผลเองแล้ว / มีการส่งใหม่
        const err = !res || res.status >= 400 || !!errParam(redirect || location.href) && errParam(location.href) !== errParam(p.url) || (text(ERR_SEL) !== "" && text(ERR_SEL) !== p.errText);
        const moved = location.href !== p.url;
        const okMsg = moved ? text(OK_SEL) : "";
        const errMsg = text(ERR_SEL);
        if (err) show({ ok: false, message: errMsg || (!res ? "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองใหม่" : undefined) }, p.label, p.form);
        else show({ ok: true, message: okMsg || undefined }, p.label, p.form);
        pending.current = null;
      };
      // redirect: รอหน้าใหม่โหลด (URL เปลี่ยน) แล้วอ่านแถบแจ้งผล · ไม่ redirect: รอหน้ารีเฟรชข้อมูลสักครู่
      const wait = () => {
        if (p.handled) return;
        if (redirect && location.href === p.url && Date.now() - start < 5000) return void setTimeout(wait, 100);
        setTimeout(settle, redirect ? 300 : 700);
      };
      wait();
    };
    const orig = window.fetch;
    const patched: typeof fetch = async (input, init) => {
      const isAction = hasActionHeader(init?.headers);
      const p = isAction ? pending.current : null;
      // action ต้องเริ่มภายใน 3 วินาทีหลังส่งฟอร์ม (กันนับ action อื่นที่ตามมาทีหลัง เช่น กระดิ่งแจ้งเตือน)
      const track = p && !p.settled && Date.now() - p.at < 3_000 ? p : null;
      try {
        const res = await orig(input, init);
        if (track) finish(track, res);
        return res;
      } catch (e) {
        if (track) finish(track, null);
        throw e;
      }
    };
    window.fetch = patched;
    return () => {
      window.removeEventListener(SAVE_EVENT, onNotice);
      document.removeEventListener("submit", onSubmit, true);
      if (window.fetch === patched) window.fetch = orig;
    };
  }, [show]);

  if (!shown) return null;
  const form = shown.form;
  const fix = () => {
    // พาไปช่องแรกที่ผิด: ชื่อช่องจากผล → aria-invalid → :invalid
    const root: ParentNode = form?.isConnected ? form : document.querySelector(".main") ?? document;
    const byName = (shown.fields ?? []).map((f) => root.querySelector<HTMLElement>(`[name="${CSS.escape(f)}"], #${CSS.escape(f)}`)).find(Boolean);
    const el = byName ?? root.querySelector<HTMLElement>('[aria-invalid="true"], .bad, :invalid');
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
  };
  return (
    <SavePopupCard key={shown.id} ok={shown.ok} title={shown.title} message={shown.message} viewHref={shown.viewHref} viewLabel={shown.viewLabel}
      onFix={!shown.ok && (shown.fields?.length || form) ? fix : undefined} onClose={() => setShown(null)} />
  );
}
