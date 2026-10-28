"use client";
// ตัวแก้ไขข้อความแบบเอกสาร (คล้าย Google Docs): ย้อนกลับ/ทำซ้ำ · รูปแบบย่อหน้า · ขนาดตัวอักษร − n + · ตัวหนา/เอียง/ขีดเส้นใต้/ขีดฆ่า
// · สีตัวอักษร/ไฮไลต์ · ลิงก์ · แนบรูป (อัปโหลด) · ตาราง · เส้นคั่น · จัดชิดซ้าย/กลาง/ขวา/เต็มแนว · รายการ · ย่อหน้าเข้า/ออก · ล้างรูปแบบ · โหมด HTML · เต็มจอ
// ค่าเก็บใน <input type="hidden" name={name}> — เซิร์ฟเวอร์ล้าง HTML อีกชั้นตอนบันทึก (src/lib/html.ts)
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { autoParagraph } from "@/lib/autop";
import { uploadEditorImage } from "./editor-actions";

const SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 48];
const BLOCKS = [
  ["p", "ข้อความปกติ"],
  ["h2", "หัวข้อใหญ่"],
  ["h3", "หัวข้อกลาง"],
  ["h4", "หัวข้อย่อย"],
  ["blockquote", "ข้อความเน้น"],
] as const;
const SAFE_URL = /^(https?:\/\/|\/(?!\/)|#|tel:|mailto:)/i;

/** ล้าง HTML ฝั่งเบราว์เซอร์ (ตอนวาง/สลับจากโหมด HTML) — ตัดสคริปต์ อีเวนต์ คลาส ฟอนต์ ที่ติดมาจาก Word/เว็บอื่น */
function cleanHtml(html: string) {
  const doc = new DOMParser().parseFromString(
    `<body>${html}</body>`,
    "text/html",
  );
  doc
    .querySelectorAll(
      "script,style,meta,link,iframe,object,embed,form,input,button,title,xml,o\\:p",
    )
    .forEach((n) => n.remove());
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => c.parentNode?.removeChild(c));
  doc.body.querySelectorAll("*").forEach((el) => {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      if (
        n.startsWith("on") ||
        n === "class" ||
        n === "id" ||
        n.startsWith("data-") ||
        n === "contenteditable"
      )
        el.removeAttribute(a.name);
      else if ((n === "href" || n === "src") && !SAFE_URL.test(a.value.trim()))
        el.removeAttribute(a.name);
    }
    const st = (el as HTMLElement).style;
    if (st) {
      const keep = [
        "text-align",
        "font-size",
        "color",
        "background-color",
        "margin-left",
        "font-weight",
        "font-style",
        "text-decoration",
      ];
      const kept = keep
        .map((k) => [k, st.getPropertyValue(k)] as const)
        .filter(([, v]) => v);
      el.removeAttribute("style");
      kept.forEach(([k, v]) => (el as HTMLElement).style.setProperty(k, v));
    }
  });
  return doc.body.innerHTML;
}

const I = ({ d, fill }: { d: string; fill?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill={fill ? "currentColor" : "none"}
    stroke={fill ? "none" : "currentColor"}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={d} />
  </svg>
);
const ICON = {
  undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  bold: "M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z",
  italic: "M19 4h-9M14 20H5M15 4 9 20",
  underline: "M6 4v6a6 6 0 0 0 12 0V4M4 21h16",
  strike:
    "M16 6a4 4 0 0 0-4-2c-2.5 0-4 1.3-4 3.2 0 1.4.8 2.3 2.4 2.8M4 12h16M8.5 17.5A4.6 4.6 0 0 0 12 19c2.5 0 4.2-1.3 4.2-3.3 0-.7-.2-1.3-.6-1.7",
  link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  unlink:
    "m18.8 13.4 1.3-1.3a5 5 0 0 0-7-7l-1.4 1.3M5.2 10.6l-1.3 1.3a5 5 0 0 0 7 7l1.4-1.3M8 2v3M2 8h3M16 22v-3M22 16h-3",
  image: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01",
  table: "M3 4h18v16H3zM3 10h18M3 15h18M9 4v16M15 4v16",
  hr: "M3 12h18",
  left: "M3 5h18M3 10h12M3 15h18M3 20h12",
  center: "M3 5h18M6 10h12M3 15h18M6 20h12",
  right: "M3 5h18M9 10h12M3 15h18M9 20h12",
  justify: "M3 5h18M3 10h18M3 15h18M3 20h18",
  ul: "M9 6h12M9 12h12M9 18h12M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  ol: "M10 6h11M10 12h11M10 18h11M4 4.5h1.5v4M4 8.5h3M4 14.2c.4-.6 1-.9 1.6-.9.9 0 1.4.5 1.4 1.2 0 1.1-3 2.1-3 3.5h3",
  outdent: "M21 5H3M21 19H3M21 10h-9M21 14h-9M7 9l-3 3 3 3",
  indent: "M21 5H3M21 19H3M21 10h-9M21 14h-9M4 9l3 3-3 3",
  clear: "M4 7V4h16v3M9 20h6M12 4 8.5 14M15 15l6 6M21 15l-6 6",
  code: "m16 18 6-6-6-6M8 6l-6 6 6 6",
  full: "M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5",
  exitFull: "M3 8h5V3M21 8h-5V3M16 21v-5h5M8 21v-5H3",
};

type BtnProps = {
  cmd?: string;
  icon: keyof typeof ICON;
  title: string;
  on?: boolean;
  onClick?: () => void;
  fill?: boolean;
};
const Ctx = createContext<{ source: boolean; exec: (cmd: string) => void }>({
  source: false,
  exec: () => {},
});
function Btn({ cmd, icon, title, on, onClick, fill }: BtnProps) {
  const { source, exec } = useContext(Ctx);
  return (
    <button
      type="button"
      className={`rte-b${on ? " on" : ""}`}
      aria-label={title}
      aria-pressed={on === undefined ? undefined : on}
      data-tip={title}
      disabled={
        source && icon !== "code" && icon !== "full" && icon !== "exitFull"
      }
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick ?? (() => cmd && exec(cmd))}
    >
      <I d={ICON[icon]} fill={fill} />
    </button>
  );
}

export function RichEditor({
  name,
  defaultValue,
  label,
  minHeight = 320,
  maxLength = 200000,
}: {
  name: string;
  defaultValue: string;
  label: string;
  minHeight?: number;
  maxLength?: number;
}) {
  const ed = useRef<HTMLDivElement>(null);
  const range = useRef<Range | null>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const [html, setHtml] = useState(() => autoParagraph(defaultValue));
  const [source, setSource] = useState(false);
  const [full, setFull] = useState(false);
  const [state, setState] = useState<{
    block: string;
    size: number;
    on: Record<string, boolean>;
  }>({ block: "p", size: 15, on: {} });
  const [linkBox, setLinkBox] = useState<{
    url: string;
    text: string;
    hasSel: boolean;
  } | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [color, setColor] = useState("#C0392B");
  const [mark, setMark] = useState("#FFF176");

  // ใส่เนื้อหาเริ่มต้นครั้งเดียว (ไม่ควบคุมด้วย React — ไม่งั้นเคอร์เซอร์กระโดด)
  useEffect(() => {
    if (ed.current) ed.current.innerHTML = html;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sync = useCallback(() => {
    if (ed.current) setHtml(ed.current.innerHTML);
  }, []);

  const inEditor = (n: Node | null) =>
    !!n && !!ed.current && ed.current.contains(n);

  // จำตำแหน่งเคอร์เซอร์ + อัปเดตสถานะปุ่ม (ตัวหนาอยู่ไหม ขนาดตัวอักษรเท่าไร ฯลฯ)
  useEffect(() => {
    const onSel = () => {
      const sel = document.getSelection();
      if (!sel || !sel.rangeCount || !inEditor(sel.anchorNode)) return;
      range.current = sel.getRangeAt(0).cloneRange();
      const node =
        sel.anchorNode!.nodeType === 1
          ? (sel.anchorNode as Element)
          : sel.anchorNode!.parentElement;
      const size = node
        ? Math.round(parseFloat(getComputedStyle(node).fontSize))
        : 15;
      const q = (c: string) => {
        try {
          return document.queryCommandState(c);
        } catch {
          return false;
        }
      };
      let block = "p";
      try {
        block = (document.queryCommandValue("formatBlock") || "p")
          .toLowerCase()
          .replace(/[<>]/g, "");
      } catch {}
      setState({
        block: BLOCKS.some(([b]) => b === block) ? block : "p",
        size,
        on: {
          bold: q("bold"),
          italic: q("italic"),
          underline: q("underline"),
          strikeThrough: q("strikeThrough"),
          insertUnorderedList: q("insertUnorderedList"),
          insertOrderedList: q("insertOrderedList"),
          justifyLeft: q("justifyLeft"),
          justifyCenter: q("justifyCenter"),
          justifyRight: q("justifyRight"),
          justifyFull: q("justifyFull"),
          link: !!node?.closest("a"),
        },
      });
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  const restore = () => {
    const el = ed.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const sel = document.getSelection();
    if (range.current && sel) {
      sel.removeAllRanges();
      sel.addRange(range.current);
    }
  };

  const exec = (cmd: string, value?: string) => {
    restore();
    document.execCommand(
      "styleWithCSS",
      false,
      cmd === "hiliteColor" || cmd === "foreColor" || cmd.startsWith("justify")
        ? "true"
        : "false",
    );
    document.execCommand(cmd, false, value);
    sync();
  };

  // ขนาดตัวอักษรเป็น px (execCommand รองรับแค่ 1–7 จึงใช้ 7 เป็นตัวชี้แล้วแทนด้วย px)
  const setSize = (px: number) => {
    restore();
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed) {
      setErr("เลือกข้อความที่ต้องการเปลี่ยนขนาดก่อน");
      return;
    }
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand("fontSize", false, "7");
    ed.current?.querySelectorAll('font[size="7"]').forEach((f) => {
      const span = document.createElement("span");
      span.style.fontSize = `${px}px`;
      span.append(...f.childNodes);
      f.replaceWith(span);
      span
        .querySelectorAll<HTMLElement>("[style*='font-size']")
        .forEach((s) => s.style.removeProperty("font-size"));
    });
    setErr("");
    sync();
    setState((s) => ({ ...s, size: px }));
  };
  const stepSize = (dir: 1 | -1) => {
    const cur = state.size;
    const next =
      dir > 0
        ? (SIZES.find((s) => s > cur) ?? SIZES.at(-1)!)
        : ([...SIZES].reverse().find((s) => s < cur) ?? SIZES[0]);
    setSize(next);
  };

  const openLink = () => {
    restore();
    const sel = document.getSelection();
    const a = sel?.anchorNode
      ? (sel.anchorNode.nodeType === 1
          ? (sel.anchorNode as Element)
          : sel.anchorNode.parentElement
        )?.closest("a")
      : null;
    if (a && inEditor(a)) {
      const r = document.createRange();
      r.selectNodeContents(a);
      range.current = r;
    }
    setLinkBox({
      url: a?.getAttribute("href") ?? "",
      text: sel?.toString() ?? "",
      hasSel: !!sel && !sel.isCollapsed,
    });
  };
  const applyLink = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!linkBox) return;
    let url = linkBox.url.trim();
    if (/^www\./i.test(url)) url = `https://${url}`;
    if (!SAFE_URL.test(url)) {
      setErr("ลิงก์ต้องขึ้นต้นด้วย https://, http://, / , tel: หรือ mailto:");
      return;
    }
    restore();
    if (linkBox.hasSel || document.getSelection()?.toString())
      document.execCommand("createLink", false, url);
    else {
      const a = document.createElement("a");
      a.href = url;
      a.textContent = linkBox.text.trim() || url;
      document.execCommand("insertHTML", false, a.outerHTML);
    }
    setLinkBox(null);
    setErr("");
    sync();
  };

  const onImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    for (const file of files) {
      setBusy(`กำลังอัปโหลด ${file.name}…`);
      const fd = new FormData();
      fd.set("file", file);
      const r = await uploadEditorImage(fd);
      if (r.error || !r.url) {
        setErr(`${file.name}: ${r.error ?? "อัปโหลดไม่สำเร็จ"}`);
        continue;
      }
      restore();
      const alt = file.name
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[<>"&]/g, "")
        .slice(0, 80);
      document.execCommand(
        "insertHTML",
        false,
        `<img src="${r.url}" alt="${alt}"><p><br></p>`,
      );
      setErr("");
    }
    setBusy("");
    sync();
  };

  const insertTable = () => {
    const cell = "<td>&nbsp;</td>";
    const row = `<tr>${cell.repeat(3)}</tr>`;
    exec(
      "insertHTML",
      `<table><tbody><tr><th>หัวข้อ</th><th>รายละเอียด</th><th>หมายเหตุ</th></tr>${row.repeat(2)}</tbody></table><p><br></p>`,
    );
  };

  // วางจาก Word/เว็บอื่น: เก็บโครงสร้าง (หัวข้อ รายการ ตัวหนา ลิงก์ ตาราง) ตัดฟอนต์/คลาส/สคริปต์ทิ้ง
  const onPaste = (e: React.ClipboardEvent) => {
    const h = e.clipboardData.getData("text/html");
    const t = e.clipboardData.getData("text/plain");
    e.preventDefault();
    if (h) document.execCommand("insertHTML", false, cleanHtml(h));
    else
      document.execCommand(
        "insertHTML",
        false,
        autoParagraph(
          t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
        ).replace(/\n/g, ""),
      );
    sync();
  };

  const toggleSource = () => {
    if (source) {
      const clean = cleanHtml(html);
      if (ed.current) ed.current.innerHTML = clean;
      setHtml(clean);
      setSource(false);
    } else {
      sync();
      setSource(true);
    }
  };

  useEffect(() => {
    document.body.classList.toggle("modal-open", full);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    if (full) window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.classList.remove("modal-open");
    };
  }, [full]);

  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (
    <Ctx.Provider value={{ source, exec }}>
      <div
        className={`rte${full ? " rte-full" : ""}${source ? " rte-src" : ""}`}
      >
        <div
          className="rte-bar"
          role="toolbar"
          aria-label={`เครื่องมือจัดรูปแบบ ${label}`}
        >
          <div className="rte-g">
            <Btn cmd="undo" icon="undo" title="ย้อนกลับ (Ctrl+Z)" />
            <Btn cmd="redo" icon="redo" title="ทำซ้ำ (Ctrl+Y)" />
          </div>
          <div className="rte-g">
            <select
              className="rte-sel"
              aria-label="รูปแบบย่อหน้า"
              value={state.block}
              disabled={source}
              onChange={(e) => exec("formatBlock", `<${e.target.value}>`)}
            >
              {BLOCKS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="rte-g rte-size">
            <button
              type="button"
              className="rte-b"
              aria-label="ลดขนาดตัวอักษร"
              data-tip="ลดขนาดตัวอักษร"
              disabled={source}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => stepSize(-1)}
            >
              <I d="M5 12h14" />
            </button>
            <select
              className="rte-num"
              aria-label="ขนาดตัวอักษร (px)"
              value={SIZES.includes(state.size) ? state.size : ""}
              disabled={source}
              onChange={(e) => setSize(Number(e.target.value))}
            >
              {!SIZES.includes(state.size) && (
                <option value="">{state.size}</option>
              )}
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rte-b"
              aria-label="เพิ่มขนาดตัวอักษร"
              data-tip="เพิ่มขนาดตัวอักษร"
              disabled={source}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => stepSize(1)}
            >
              <I d="M12 5v14M5 12h14" />
            </button>
          </div>
          <div className="rte-g">
            <Btn
              cmd="bold"
              icon="bold"
              title="ตัวหนา (Ctrl+B)"
              on={!!state.on.bold}
            />
            <Btn
              cmd="italic"
              icon="italic"
              title="ตัวเอียง (Ctrl+I)"
              on={!!state.on.italic}
            />
            <Btn
              cmd="underline"
              icon="underline"
              title="ขีดเส้นใต้ (Ctrl+U)"
              on={!!state.on.underline}
            />
            <Btn
              cmd="strikeThrough"
              icon="strike"
              title="ขีดฆ่า"
              on={!!state.on.strikeThrough}
            />
            <span className="rte-color" data-tip="สีตัวอักษร">
              <button
                type="button"
                className="rte-b"
                aria-label="ใส่สีตัวอักษร"
                disabled={source}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec("foreColor", color)}
              >
                <span className="rte-a" style={{ borderBottomColor: color }}>
                  A
                </span>
              </button>
              <input
                type="color"
                value={color}
                aria-label="เลือกสีตัวอักษร"
                disabled={source}
                onChange={(e) => {
                  setColor(e.target.value);
                  exec("foreColor", e.target.value);
                }}
              />
            </span>
            <span className="rte-color" data-tip="ไฮไลต์">
              <button
                type="button"
                className="rte-b"
                aria-label="ไฮไลต์ข้อความ"
                disabled={source}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec("hiliteColor", mark)}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m9 11-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
                  <path d="M3 22h18" stroke={mark} strokeWidth="3" />
                </svg>
              </button>
              <input
                type="color"
                value={mark}
                aria-label="เลือกสีไฮไลต์"
                disabled={source}
                onChange={(e) => {
                  setMark(e.target.value);
                  exec("hiliteColor", e.target.value);
                }}
              />
            </span>
          </div>
          <div className="rte-g">
            <Btn
              icon="link"
              title="ใส่ลิงก์ (Ctrl+K)"
              on={!!state.on.link}
              onClick={openLink}
            />
            <Btn cmd="unlink" icon="unlink" title="เอาลิงก์ออก" />
            <Btn
              icon="image"
              title="แนบรูป"
              onClick={() => {
                restore();
                fileIn.current?.click();
              }}
            />
            <Btn icon="table" title="แทรกตาราง 3×3" onClick={insertTable} />
            <Btn cmd="insertHorizontalRule" icon="hr" title="เส้นคั่น" />
          </div>
          <div className="rte-g">
            <Btn
              cmd="justifyLeft"
              icon="left"
              title="ชิดซ้าย"
              on={!!state.on.justifyLeft}
            />
            <Btn
              cmd="justifyCenter"
              icon="center"
              title="กึ่งกลาง"
              on={!!state.on.justifyCenter}
            />
            <Btn
              cmd="justifyRight"
              icon="right"
              title="ชิดขวา"
              on={!!state.on.justifyRight}
            />
            <Btn
              cmd="justifyFull"
              icon="justify"
              title="เต็มแนว"
              on={!!state.on.justifyFull}
            />
          </div>
          <div className="rte-g">
            <Btn
              cmd="insertUnorderedList"
              icon="ul"
              title="รายการจุด"
              on={!!state.on.insertUnorderedList}
            />
            <Btn
              cmd="insertOrderedList"
              icon="ol"
              title="รายการตัวเลข"
              on={!!state.on.insertOrderedList}
            />
            <Btn cmd="outdent" icon="outdent" title="ลดการเยื้อง" />
            <Btn cmd="indent" icon="indent" title="เพิ่มการเยื้อง" />
            <Btn
              icon="clear"
              title="ล้างรูปแบบ"
              onClick={() => {
                exec("removeFormat");
                exec("formatBlock", "<p>");
              }}
            />
          </div>
          <div className="rte-g rte-end">
            <Btn
              icon="code"
              title={source ? "กลับไปโหมดแก้ไขปกติ" : "แก้เป็นโค้ด HTML"}
              on={source}
              onClick={toggleSource}
            />
            <Btn
              icon={full ? "exitFull" : "full"}
              title={full ? "ออกจากเต็มจอ (Esc)" : "เต็มจอ"}
              onClick={() => setFull(!full)}
            />
          </div>
        </div>

        {linkBox && (
          // ไม่ใช้ <form> เพราะอยู่ในฟอร์มสินค้า (ฟอร์มซ้อนจะส่งฟอร์มนอกไปด้วย) — Enter = ใส่ลิงก์, Esc = ยกเลิก
          <div
            className="rte-pop"
            role="dialog"
            aria-label="ใส่ลิงก์"
            onKeyDown={(e) => {
              if (e.key === "Escape") setLinkBox(null);
              if (e.key === "Enter") applyLink(e);
            }}
          >
            {!linkBox.hasSel && (
              <label>
                ข้อความที่แสดง
                <input
                  value={linkBox.text}
                  onChange={(e) =>
                    setLinkBox({ ...linkBox, text: e.target.value })
                  }
                  placeholder="เช่น ดูสเปกเพิ่มเติม"
                />
              </label>
            )}
            <label>
              ลิงก์ (URL)
              <input
                autoFocus
                value={linkBox.url}
                onChange={(e) =>
                  setLinkBox({ ...linkBox, url: e.target.value })
                }
                placeholder="https://… หรือ /product/…"
              />
            </label>
            <div className="rte-pop-acts">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setLinkBox(null)}
              >
                ยกเลิก
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={applyLink}>
                ใส่ลิงก์
              </button>
            </div>
          </div>
        )}

        <div
          ref={ed}
          className="rte-body prose-desc"
          contentEditable={!source}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={label}
          hidden={source}
          style={{ minHeight }}
          onInput={sync}
          onBlur={sync}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
              e.preventDefault();
              openLink();
            }
          }}
        />
        {source && (
          <textarea
            className="rte-code"
            aria-label={`${label} (HTML)`}
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            style={{ minHeight }}
            spellCheck={false}
          />
        )}
        <input type="hidden" name={name} value={html} />
        <input
          ref={fileIn}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          hidden
          onChange={onImage}
        />
        <div className="rte-foot">
          <span>
            {text
              ? `${text.split(" ").length.toLocaleString("th-TH")} คำ · ${text.length.toLocaleString("th-TH")} ตัวอักษร`
              : "ยังไม่มีเนื้อหา"}
          </span>
          {busy && <span role="status">{busy}</span>}
          {err && (
            <span className="rte-err" role="alert">
              {err}
            </span>
          )}
          {html.length > maxLength && (
            <span className="rte-err" role="alert">
              ยาวเกินกำหนด ({html.length.toLocaleString("th-TH")}/
              {maxLength.toLocaleString("th-TH")})
            </span>
          )}
        </div>
      </div>
    </Ctx.Provider>
  );
}
