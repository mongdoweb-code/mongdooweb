"use client";
// รูปและวิดีโอสินค้า (หน้าเพิ่ม/แก้ไขสินค้า)
// - เลือก/ลากไฟล์มาวาง → อัปโหลดทันที (มีแถบความคืบหน้า) → ได้ key จริง จึงตั้งเป็นปก/เรียงลำดับ/ลบได้ทุกรูป ทั้งรูปเดิมและรูปใหม่
// - รูปแรก = ภาพปก (รูปหลักบนการ์ดสินค้า หน้าสินค้า และรูปแชร์) · กด "ตั้งเป็นปก" หรือลากรูปไปช่องแรก
// - วิดีโอ 1 คลิป: MP4 ≤30 MB ความยาว 10–60 วินาที · ภาพปกวิดีโอสร้างจากเฟรมในเบราว์เซอร์ · server ตรวจไฟล์ซ้ำอีกชั้น
// ค่าที่ส่งไปกับฟอร์ม: images (JSON key ตามลำดับ) · videoKey · videoPosterKey · videoSeconds · mediaBusy (กำลังอัปโหลด)
import { useEffect, useRef, useState } from "react";

const MAX_IMAGES = 30;
const IMG_MAX = 10 * 1024 * 1024;
const VIDEO_MAX = 30 * 1024 * 1024;
const VIDEO_MIN_S = 10;
const VIDEO_MAX_S = 60;
const IMG_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

type Img = { id: string; key: string | null; url: string; name: string; progress: number; error: string | null };
export type VideoValue = { key: string; url: string; posterKey: string | null; posterUrl: string | null; seconds: number | null };
type Vid = VideoValue & { progress: number | null; error: string | null; local: string | null };

let seq = 0;
const uid = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const clock = (s: number | null) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);

/** อัปโหลดผ่าน XHR (fetch ยังรายงานความคืบหน้าการส่งไม่ได้) */
function upload(kind: "image" | "video" | "poster", file: Blob, name: string, onProgress?: (p: number) => void) {
  return new Promise<{ key: string; url: string; seconds?: number }>((resolve, reject) => {
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("file", file, name);
    const x = new XMLHttpRequest();
    x.open("POST", "/admin/products/upload");
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    x.onload = () => {
      let body: { key?: string; url?: string; seconds?: number; error?: string } = {};
      try {
        body = JSON.parse(x.responseText);
      } catch {}
      if (x.status === 401) return reject(new Error("หมดเวลาเข้าสู่ระบบ — เปิดแท็บใหม่เพื่อเข้าสู่ระบบ แล้วลองอีกครั้ง"));
      if (x.status >= 200 && x.status < 300 && body.key && body.url) resolve({ key: body.key, url: body.url, seconds: body.seconds });
      else reject(new Error(body.error || `อัปโหลดไม่สำเร็จ (${x.status})`));
    };
    x.onerror = () => reject(new Error("เชื่อมต่อไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองใหม่"));
    x.send(fd);
  });
}

/** ความยาว + ภาพปกจากเฟรมของวิดีโอ (เบราว์เซอร์ที่เล่นไฟล์นี้ไม่ได้ = null ทั้งคู่ ให้ server ตรวจแทน) */
function probeVideo(file: File): Promise<{ seconds: number | null; poster: Blob | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "auto";
    v.playsInline = true;
    let seconds: number | null = null;
    const done = (poster: Blob | null) => {
      URL.revokeObjectURL(url);
      v.removeAttribute("src");
      resolve({ seconds, poster });
    };
    const timer = setTimeout(() => done(null), 8000);
    v.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    v.onloadedmetadata = () => {
      seconds = Number.isFinite(v.duration) ? v.duration : null;
      v.currentTime = Math.min(1, (seconds ?? 2) / 2);
    };
    v.onseeked = () => {
      clearTimeout(timer);
      try {
        const w = v.videoWidth, h = v.videoHeight;
        if (!w || !h) return done(null);
        const scale = Math.min(1, 1280 / Math.max(w, h));
        const c = document.createElement("canvas");
        c.width = Math.round(w * scale);
        c.height = Math.round(h * scale);
        c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
        c.toBlob((b) => done(b), "image/jpeg", 0.85);
      } catch {
        done(null);
      }
    };
    v.src = url;
  });
}

export function ProductMedia({ images: initial, video: initialVideo, onBusy, invalid }: {
  images: { key: string; url: string }[];
  video: VideoValue | null;
  onBusy?: (busy: boolean) => void;
  invalid?: { images?: boolean; video?: boolean };
}) {
  const [items, setItems] = useState<Img[]>(() => initial.map((i) => ({ id: uid(), key: i.key, url: i.url, name: "", progress: 100, error: null })));
  const [vNotice, setVNotice] = useState<string | null>(null);
  const [vid, setVid] = useState<Vid | null>(() => (initialVideo ? { ...initialVideo, progress: null, error: null, local: null } : null));
  const [notice, setNotice] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const imgInput = useRef<HTMLInputElement>(null);
  const vidInput = useRef<HTMLInputElement>(null);
  const files = useRef(new Map<string, File>());

  const busy = items.some((i) => !i.key && !i.error) || (vid?.progress != null && !vid.error);
  useEffect(() => onBusy?.(busy), [busy, onBusy]);
  // กันปิดหน้า/ย้อนกลับระหว่างอัปโหลด
  useEffect(() => {
    if (!busy) return;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", guard);
    return () => removeEventListener("beforeunload", guard);
  }, [busy]);

  const patch = (id: string, p: Partial<Img>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const startUpload = (id: string, file: File) => {
    patch(id, { progress: 0, error: null });
    upload("image", file, file.name, (p) => patch(id, { progress: Math.min(p, 99) }))
      .then((r) => {
        setItems((xs) => xs.map((x) => (x.id === id ? (URL.revokeObjectURL(x.url), { ...x, key: r.key, url: r.url, progress: 100 }) : x)));
        files.current.delete(id);
      })
      .catch((e: Error) => patch(id, { error: e.message }));
  };

  const addImages = (list: File[]) => {
    const msgs: string[] = [];
    const room = MAX_IMAGES - items.length;
    const ok: File[] = [];
    for (const f of list) {
      if (!IMG_TYPES.includes(f.type)) msgs.push(`${f.name}: รองรับเฉพาะ JPG, PNG, WEBP, GIF`);
      else if (f.size > IMG_MAX) msgs.push(`${f.name}: ใหญ่เกิน 10 MB (${mb(f.size)})`);
      else ok.push(f);
    }
    if (ok.length > room) msgs.push(`ใส่รูปได้สูงสุด ${MAX_IMAGES} รูป — เพิ่มได้อีก ${Math.max(0, room)} รูป`);
    const take = ok.slice(0, Math.max(0, room));
    const added = take.map((f) => {
      const id = uid();
      files.current.set(id, f);
      return { id, key: null, url: URL.createObjectURL(f), name: f.name, progress: 0, error: null } as Img;
    });
    setItems((xs) => [...xs, ...added]);
    added.forEach((a) => startUpload(a.id, files.current.get(a.id)!));
    setNotice(msgs.length ? msgs.join(" · ") : null);
  };

  const remove = (id: string) =>
    setItems((xs) => {
      const x = xs.find((i) => i.id === id);
      if (x?.url.startsWith("blob:")) URL.revokeObjectURL(x.url);
      files.current.delete(id);
      return xs.filter((i) => i.id !== id);
    });
  const moveTo = (id: string, to: number) =>
    setItems((xs) => {
      const from = xs.findIndex((i) => i.id === id);
      if (from < 0 || from === to) return xs;
      const next = [...xs];
      const [x] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(next.length, to)), 0, x);
      return next;
    });

  const addVideo = async (f: File) => {
    setVNotice(null);
    if (!/\.mp4$/i.test(f.name) && f.type !== "video/mp4") return setVNotice("วิดีโอต้องเป็นไฟล์ MP4");
    if (f.size > VIDEO_MAX) return setVNotice(`วิดีโอใหญ่เกิน 30 MB (${mb(f.size)}) — ตัดให้สั้นลงหรือลดความละเอียดก่อน`);
    // วิดีโอเดิม (ถ้ามี) — ไฟล์ใหม่ใช้ไม่ได้/อัปโหลดล้มเหลว → คืนค่าเดิม ไม่ให้กดบันทึกแล้ววิดีโอเดิมหายไปด้วย
    const prev = vid && vid.key && vid.progress == null && !vid.error ? vid : null;
    const local = URL.createObjectURL(f);
    setVid({ key: "", url: local, posterKey: null, posterUrl: null, seconds: null, progress: 0, error: null, local });
    const probe = await probeVideo(f);
    if (probe.seconds != null && (probe.seconds < VIDEO_MIN_S - 0.5 || probe.seconds > VIDEO_MAX_S + 0.5)) {
      URL.revokeObjectURL(local);
      setVid(prev);
      return setVNotice(`วิดีโอยาว ${Math.round(probe.seconds)} วินาที — ต้องยาว ${VIDEO_MIN_S}–${VIDEO_MAX_S} วินาที`);
    }
    try {
      const [v, poster] = await Promise.all([
        upload("video", f, f.name, (p) => setVid((x) => (x ? { ...x, progress: Math.min(p, 99) } : x))),
        probe.poster ? upload("poster", probe.poster, "poster.jpg").catch(() => null) : Promise.resolve(null),
      ]);
      setVid({ key: v.key, url: v.url, posterKey: poster?.key ?? null, posterUrl: poster?.url ?? null, seconds: v.seconds ?? (probe.seconds ? Math.round(probe.seconds) : null), progress: null, error: null, local });
    } catch (e) {
      URL.revokeObjectURL(local);
      setVid(prev);
      setVNotice(`อัปโหลดวิดีโอไม่สำเร็จ: ${(e as Error).message}${prev ? " — ยังใช้วิดีโอเดิมอยู่" : ""}`);
    }
  };

  const ready = items.filter((i) => i.key);
  const failed = items.filter((i) => i.error);
  const videoReady = vid && vid.key && vid.progress == null && !vid.error ? vid : null;

  return (
    <>
      <input type="hidden" name="images" value={JSON.stringify(ready.map((i) => i.key))} />
      <input type="hidden" name="videoKey" value={videoReady?.key ?? ""} />
      <input type="hidden" name="videoPosterKey" value={videoReady?.posterKey ?? ""} />
      <input type="hidden" name="videoSeconds" value={videoReady?.seconds ?? ""} />
      {busy && <input type="hidden" name="mediaBusy" value="1" />}

      <div className="box pm-box" id="productMedia">
        <h3>รูปสินค้า <span className="sub">รูปแรก = ภาพปก · กด “ตั้งเป็นปก” หรือลากรูปไปช่องแรก · ลากเพื่อจัดลำดับ</span></h3>
        {notice && <div className="login-err" role="alert">{notice}</div>}
        {failed.length > 0 && <div className="login-err" role="alert">อัปโหลดไม่สำเร็จ {failed.length} รูป — กด “ลองใหม่” หรือลบรูปนั้นก่อนบันทึก</div>}
        <ul
          className={`pm-grid${dropping ? " dropping" : ""}${invalid?.images ? " bad" : ""}`}
          aria-label="รูปสินค้า"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
              setDropping(true);
            }
          }}
          onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropping(false)}
          onDrop={(e) => {
            if (!e.dataTransfer.files.length) return;
            e.preventDefault();
            setDropping(false);
            addImages([...e.dataTransfer.files]);
          }}
        >
          {items.map((im, i) => (
            <li
              key={im.id}
              className={`pm-tile${i === 0 ? " cover" : ""}${dragId === im.id ? " dragging" : ""}${overId === im.id && dragId !== im.id ? " over" : ""}${im.error ? " failed" : ""}`}
              draggable
              data-key={im.key ?? ""}
              onDragStart={(e) => {
                setDragId(im.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/x-pm", im.id);
              }}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                if (overId !== im.id) setOverId(im.id);
              }}
              onDrop={(e) => {
                if (!dragId) return;
                e.preventDefault();
                e.stopPropagation();
                moveTo(dragId, i);
                setDragId(null);
                setOverId(null);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
            >
              <div className="pm-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.url} alt={`รูปที่ ${i + 1}${i === 0 ? " (ภาพปก)" : ""}`} draggable={false} />
                {i === 0 && <span className="pm-cover-tag">ปก</span>}
                {!im.key && !im.error && (
                  <span className="pm-progress" role="progressbar" aria-label={`กำลังอัปโหลด ${im.name}`} aria-valuenow={im.progress} aria-valuemin={0} aria-valuemax={100}>
                    <i style={{ width: `${im.progress}%` }} />
                    <b>{im.progress}%</b>
                  </span>
                )}
                {im.error && (
                  <span className="pm-err" title={im.error}>
                    {im.error}
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => { const f = files.current.get(im.id); if (f) startUpload(im.id, f); }}>ลองใหม่</button>
                  </span>
                )}
                {i > 0 && (
                  <button type="button" className="pm-set-cover" onClick={() => moveTo(im.id, 0)} aria-label={`ตั้งรูปที่ ${i + 1} เป็นภาพปก`}>
                    ตั้งเป็นปก
                  </button>
                )}
              </div>
              <div className="pm-acts">
                <button type="button" className="icon-btn sm" onClick={() => moveTo(im.id, i - 1)} disabled={i === 0} aria-label={`เลื่อนรูปที่ ${i + 1} ไปก่อน`}>←</button>
                <button type="button" className="icon-btn sm" onClick={() => moveTo(im.id, i + 1)} disabled={i === items.length - 1} aria-label={`เลื่อนรูปที่ ${i + 1} ไปหลัง`}>→</button>
                <button type="button" className="icon-btn sm del" onClick={() => remove(im.id)} aria-label={`ลบรูปที่ ${i + 1}`}>✕</button>
              </div>
            </li>
          ))}
          {items.length < MAX_IMAGES && (
            <li className="pm-add">
              <button type="button" onClick={() => imgInput.current?.click()}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="15" height="13" rx="1.5" /><circle cx="8" cy="10" r="1.6" /><path d="m3 16 4-4 4 4 3-3 4 4M19 3v6M16 6h6" /></svg>
                <span>เพิ่มรูปภาพ</span>
                <small>({items.length}/{MAX_IMAGES})</small>
              </button>
            </li>
          )}
        </ul>
        <input ref={imgInput} id="newImages" type="file" multiple accept={IMG_TYPES.join(",")} className="sr-only" aria-label="เลือกรูปสินค้า (ได้หลายรูป)"
          onChange={(e) => {
            addImages([...(e.target.files ?? [])]);
            e.target.value = "";
          }} />
        <small className="sub">JPG, PNG, WEBP, GIF ไม่เกิน 10 MB ต่อรูป · ลากไฟล์จากเครื่องมาวางในกรอบได้ · ระบบย่อเป็น WebP ให้อัตโนมัติ · แนะนำรูปสี่เหลี่ยมจัตุรัส (1:1) อย่างน้อย 800×800 px</small>

        <h3 className="pm-vh">วิดีโอสินค้า</h3>
        {vNotice && <div className="login-err" role="alert">{vNotice}</div>}
        <div className={`pm-video${invalid?.video ? " bad" : ""}`}>
          {vid ? (
            <div className="pm-vcard">
              <div className="pm-vplayer">
                <video src={vid.local ?? vid.url} poster={vid.posterUrl ?? undefined} controls preload="metadata" playsInline aria-label="วิดีโอสินค้า" />
                {vid.progress != null && (
                  <span className="pm-progress" role="progressbar" aria-label="กำลังอัปโหลดวิดีโอ" aria-valuenow={vid.progress} aria-valuemin={0} aria-valuemax={100}>
                    <i style={{ width: `${vid.progress}%` }} />
                    <b>กำลังอัปโหลด {vid.progress}%</b>
                  </span>
                )}
              </div>
              <div className="pm-vinfo">
                {vid.error ? <span className="pm-verr" role="alert">{vid.error}</span> : vid.progress != null ? <span className="sub">กำลังอัปโหลด — อย่าเพิ่งปิดหน้านี้</span> : <span className="sub">พร้อมใช้ {vid.seconds ? `· ยาว ${clock(vid.seconds)}` : ""}{vid.posterUrl ? " · มีภาพปกวิดีโอ" : ""}</span>}
                <div className="pm-vbtns">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => vidInput.current?.click()} disabled={vid.progress != null && !vid.error}>เปลี่ยนวิดีโอ</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (vid.local) URL.revokeObjectURL(vid.local); setVid(null); }} disabled={vid.progress != null && !vid.error}>ลบวิดีโอ</button>
                </div>
              </div>
            </div>
          ) : (
            <button type="button" className="pm-vadd" onClick={() => vidInput.current?.click()}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="13" height="14" rx="1.5" /><path d="m8 9.5 4 2.5-4 2.5zM19 3v6M16 6h6" /></svg>
              <span>เพิ่มวิดีโอ</span>
            </button>
          )}
          <ul className="pm-vrules">
            <li>ไฟล์ MP4 ขนาดไม่เกิน 30 MB</li>
            <li>ความยาว {VIDEO_MIN_S}–{VIDEO_MAX_S} วินาที</li>
            <li>แนะนำวิดีโอที่แสดงสี/ตัวเลือกทั้งหมดของสินค้า สาธิตวิธีใช้งาน หรือการติดตั้งจริง</li>
            <li>แสดงในแกลเลอรีหน้าสินค้าถัดจากภาพปก — บันทึกสินค้าระหว่างวิดีโอกำลังอัปโหลดไม่ได้</li>
          </ul>
        </div>
        <input ref={vidInput} id="productVideo" type="file" accept="video/mp4,.mp4" className="sr-only" aria-label="เลือกวิดีโอสินค้า (MP4)"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void addVideo(f);
          }} />
      </div>
    </>
  );
}
