"use client";
// ฟอร์มคลิป (เพิ่ม/แก้ไข): วางลิงก์ → รู้แหล่ง/แนวตั้ง-แนวนอนทันที + ดึงชื่อคลิป (YouTube/TikTok) · หรืออัปโหลดคลิปจากมือถือ (≤200 MB ≤3 นาที)
// อัปโหลดทันทีที่เลือกไฟล์ (แถบความคืบหน้า) · รูปปกสร้างจากเฟรมในคลิปให้อัตโนมัติ (เปลี่ยนเองได้) · ผูกสินค้า · หัวข้อ · ตั้งเวลาเผยแพร่ · แนะนำ
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { UPLOAD_MAX_BYTES, UPLOAD_MAX_SECONDS, VIDEO_SOURCES, VIDEO_TITLE_MAX, VIDEO_TOPIC_MAX, durationText, linkError, parseVideoLink, type VideoSourceKey } from "@/lib/video-links";
import { notifySave } from "../../_components/save-notify";
import { fetchVideoMeta, saveVideo, type VideoPayload } from "./actions";

export type VideoFormInit = {
  id?: string;
  source?: VideoSourceKey;
  url: string;
  fileUrl?: string | null;
  fileKey?: string | null;
  seconds?: number | null;
  hevc?: boolean;
  posterKey: string | null;
  posterUrl: string | null;
  title: string;
  topic: string;
  vertical: boolean;
  productId: string;
  publish: "now" | "hidden" | "schedule";
  publishAt: string;
  featured: boolean;
};
type Prod = { id: string; label: string };

const IMG_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** ส่งไฟล์ไป /api/admin/videos/upload (body = ไฟล์ตรง ๆ) พร้อมความคืบหน้า */
function send(kind: "video" | "poster", body: Blob, onProgress?: (pct: number) => void) {
  return new Promise<{ key: string; url: string; seconds?: number; hevc?: boolean }>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", `/api/admin/videos/upload?kind=${kind}`);
    x.setRequestHeader("Content-Type", body.type || "application/octet-stream");
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    x.onload = () => {
      let j: { key?: string; url?: string; error?: string; seconds?: number; hevc?: boolean } = {};
      try { j = JSON.parse(x.responseText); } catch {}
      if (x.status >= 200 && x.status < 300 && j.key) resolve(j as { key: string; url: string });
      else reject(new Error(j.error || (x.status === 413 ? "ไฟล์ใหญ่เกินกำหนด" : "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง")));
    };
    x.onerror = () => reject(new Error("อินเทอร์เน็ตหลุดระหว่างอัปโหลด — ลองใหม่อีกครั้ง"));
    x.send(body);
  });
}

/** อ่านความยาว/ขนาดภาพ + จับภาพเฟรมเป็นรูปปก (เบราว์เซอร์เล่นไฟล์นั้นไม่ได้ = null) */
function probe(file: File): Promise<{ seconds: number; vertical: boolean; poster: Blob | null } | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (r: { seconds: number; vertical: boolean; poster: Blob | null } | null) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(r);
    };
    v.preload = "auto";
    v.muted = true;
    v.playsInline = true;
    v.src = url;
    v.onerror = () => finish(null);
    setTimeout(() => finish(null), 15000);
    v.onloadedmetadata = () => {
      const seconds = v.duration, vertical = v.videoHeight > v.videoWidth;
      if (!isFinite(seconds) || !v.videoWidth) return finish(null);
      v.currentTime = Math.min(1, seconds / 3);
      v.onseeked = () => {
        try {
          const w = Math.min(1280, v.videoWidth), h = Math.round((v.videoHeight / v.videoWidth) * w);
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          c.getContext("2d")!.drawImage(v, 0, 0, w, h);
          c.toBlob((b) => finish({ seconds, vertical, poster: b }), "image/webp", 0.86);
        } catch {
          finish({ seconds, vertical, poster: null });
        }
      };
    };
  });
}

export function VideoForm({ init, products, topics }: { init: VideoFormInit; products: Prod[]; topics: string[] }) {
  const router = useRouter();
  const uid = useId();
  const editing = !!init.id;
  const [kind, setKind] = useState<"link" | "upload">(init.source === "UPLOAD" ? "upload" : "link");
  const [url, setUrl] = useState(init.url);
  const [title, setTitle] = useState(init.title);
  const [topic, setTopic] = useState(init.topic);
  const [vertical, setVertical] = useState(init.vertical);
  const [prodText, setProdText] = useState(products.find((p) => p.id === init.productId)?.label ?? "");
  const [publish, setPublish] = useState(init.publish);
  const [publishAt, setPublishAt] = useState(init.publishAt);
  const [featured, setFeatured] = useState(init.featured);
  const [file, setFile] = useState<{ key: string; url: string; seconds: number | null; hevc: boolean } | null>(init.fileKey ? { key: init.fileKey, url: init.fileUrl ?? "", seconds: init.seconds ?? null, hevc: !!init.hevc } : null);
  const [poster, setPoster] = useState<{ key: string | null; url: string | null }>({ key: init.posterKey, url: init.posterUrl });
  const [progress, setProgress] = useState<number | null>(null);
  const [upErr, setUpErr] = useState("");
  const [metaMsg, setMetaMsg] = useState("");
  const [busyPoster, setBusyPoster] = useState(false);
  const [state, setState] = useState<{ error?: string; fields?: string[] }>({});
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const posterRef = useRef<HTMLInputElement>(null);

  const parsed = kind === "link" ? parseVideoLink(url) : null;
  const linkBad = kind === "link" && url.trim() !== "" && !parsed;
  const product = products.find((p) => p.label === prodText.trim()) ?? null;
  const uploading = progress != null;

  // ลิงก์ใหม่ → ดึงชื่อคลิป (ถ้ายังไม่มีชื่อ) ครั้งเดียวต่อลิงก์
  const pUrl = parsed?.url ?? "";
  useEffect(() => {
    const p = pUrl ? parseVideoLink(pUrl) : null;
    if (!p) return;
    if (p.source !== "YOUTUBE" && p.source !== "TIKTOK") return;
    let alive = true;
    fetchVideoMeta(p.url).then((r) => {
      if (!alive) return;
      if (r.title) setTitle((t) => (t.trim() ? t : r.title!));
      if (r.error) setMetaMsg(r.error);
    }).catch(() => {});
    return () => { alive = false; };
  }, [pUrl]);
  /** เปลี่ยนลิงก์: ตั้งแนวตั้ง/แนวนอนตามแบบคลิปใหม่ทันที */
  const changeUrl = (v: string) => {
    setUrl(v);
    setMetaMsg("");
    const p = parseVideoLink(v);
    if (p && p.url !== parseVideoLink(url)?.url) setVertical(p.vertical);
  };

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    setUpErr("");
    if (!/^video\//.test(f.type) && !/\.(mp4|mov|m4v)$/i.test(f.name)) return setUpErr("เลือกไฟล์วิดีโอ (MP4 หรือ MOV จากมือถือ)");
    if (f.size > UPLOAD_MAX_BYTES) return setUpErr(`ไฟล์ใหญ่ ${(f.size / 1048576).toFixed(0)} MB — ได้ไม่เกิน 200 MB (คลิปยาวแนะนำให้ลง YouTube แล้ววางลิงก์)`);
    const info = await probe(f);
    if (info && info.seconds > UPLOAD_MAX_SECONDS + 0.5) return setUpErr(`คลิปยาว ${durationText(info.seconds)} นาที — ได้ไม่เกิน 3 นาที (คลิปยาวแนะนำให้ลง YouTube แล้ววางลิงก์)`);
    if (info) setVertical(info.vertical);
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, VIDEO_TITLE_MAX));
    setProgress(0);
    try {
      const r = await send("video", f, setProgress);
      setFile({ key: r.key, url: r.url, seconds: r.seconds ?? (info ? Math.round(info.seconds) : null), hevc: !!r.hevc });
      // รูปปกจากเฟรมในคลิป (ถ้ายังไม่ได้ตั้งเอง)
      if (info?.poster && !poster.key) {
        const p = await send("poster", info.poster).catch(() => null);
        if (p) setPoster({ key: p.key, url: p.url });
      }
    } catch (e) {
      setUpErr(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setProgress(null);
    }
  };
  const pickPoster = async (f: File | undefined) => {
    if (!f) return;
    if (!IMG_TYPES.includes(f.type)) return setUpErr("รูปปกต้องเป็น JPG, PNG หรือ WEBP");
    if (f.size > 10 * 1048576) return setUpErr("รูปปกใหญ่เกิน 10 MB");
    setBusyPoster(true);
    try {
      const p = await send("poster", f);
      setPoster({ key: p.key, url: p.url });
      setUpErr("");
    } catch (e) {
      setUpErr(e instanceof Error ? e.message : "อัปโหลดรูปปกไม่สำเร็จ");
    } finally {
      setBusyPoster(false);
    }
  };

  const submit = () => {
    const payload: VideoPayload = {
      id: init.id, kind, url, fileKey: file?.key ?? null, seconds: file?.seconds ?? null, hevc: file?.hevc ?? false, posterKey: poster.key,
      title, topic, vertical, productId: product?.id ?? null, publish, publishAt, featured,
    };
    start(async () => {
      const r = await saveVideo(payload);
      setState(r);
      notifySave(r.error ? { ok: false, message: r.error, fields: r.fields?.map((f) => `${uid}${f}`) } : { ok: true, message: r.ok, viewHref: r.id ? `/videos?v=${r.id}` : "/videos", viewLabel: "ดูบนหน้าเว็บ" });
      if (r.ok) {
        if (editing) router.refresh();
        else {
          // เพิ่มคลิปถัดไปได้ทันที: ล้างฟอร์มกลับเป็นค่าเริ่มต้น (หน้าเดิมไม่ถูกสร้างใหม่)
          setUrl(init.url); setTitle(init.title); setTopic(init.topic); setVertical(init.vertical); setProdText("");
          setPublish(init.publish); setPublishAt(init.publishAt); setFeatured(init.featured); setFile(null);
          setPoster({ key: init.posterKey, url: init.posterUrl }); setUpErr(""); setMetaMsg(""); setState({});
          router.push("/admin/videos?saved=1");
        }
      } else if (r.fields?.[0]) document.getElementById(`${uid}${r.fields[0]}`)?.focus();
    });
  };
  const bad = (f: string) => (state.fields?.includes(f) ? { "aria-invalid": true as const } : {});
  const src: VideoSourceKey | null = kind === "upload" ? "UPLOAD" : parsed?.source ?? init.source ?? null;
  const previewImg = poster.url ?? (parsed?.source === "YOUTUBE" && parsed.id ? `https://i.ytimg.com/vi/${parsed.id}/hqdefault.jpg` : null);

  return (
    <div className="vf">
      {!editing && (
        <div className="vf-kinds" role="radiogroup" aria-label="วิธีเพิ่มคลิป">
          <button type="button" role="radio" aria-checked={kind === "link"} className={kind === "link" ? "on" : ""} onClick={() => setKind("link")}>วางลิงก์ (YouTube / Facebook / TikTok / Instagram)</button>
          <button type="button" role="radio" aria-checked={kind === "upload"} className={kind === "upload" ? "on" : ""} onClick={() => setKind("upload")}>อัปโหลดจากมือถือ</button>
        </div>
      )}

      {kind === "link" ? (
        <div className="vf-link">
          <label htmlFor={`${uid}url`} className="sr-only">ลิงก์คลิป</label>
          <input id={`${uid}url`} className={`vf-url${linkBad ? " bad" : ""}`} value={url} onChange={(e) => changeUrl(e.target.value)} placeholder="วางลิงก์คลิป เช่น https://youtube.com/shorts/… หรือ https://www.tiktok.com/@…/video/…" inputMode="url" autoComplete="off" {...bad("url")} />
          <p className={`vf-detect${parsed ? " ok" : linkBad ? " err" : ""}`} role="status">
            {parsed ? <>✓ พบคลิป <b>{parsed.label}</b> · {parsed.vertical ? "แนวตั้ง 9:16" : "แนวนอน 16:9"}{metaMsg && <span className="vf-warn"> · {metaMsg}</span>}</> : linkBad ? linkError(url) : "คลิปต้องเปิดเป็นสาธารณะ จึงเล่นในเว็บได้"}
          </p>
        </div>
      ) : (
        <div className="vf-up">
          {file ? (
            <div className="vf-file">
              <b>✓ อัปโหลดคลิปแล้ว</b>
              <span>{file.seconds ? `ยาว ${durationText(file.seconds)} นาที` : ""}{file.hevc ? " · ไฟล์ HEVC" : ""}</span>
              {file.hevc && <small className="vf-warn">ไฟล์แบบ HEVC (iPhone “ประสิทธิภาพสูง”) — เล่นได้บน iPhone/Mac/มือถือส่วนใหญ่ แต่บางเครื่อง (เช่น Firefox, คอมรุ่นเก่า) อาจเล่นไม่ได้ · ถ่ายใหม่ให้เล่นได้ทุกเครื่อง: ตั้งค่า › กล้อง › รูปแบบ › “เข้ากันได้มากที่สุด”</small>}
              {!editing && <button type="button" className="btn btn-outline btn-sm" onClick={() => { setFile(null); fileRef.current?.click(); }}>เปลี่ยนไฟล์</button>}
            </div>
          ) : (
            <button type="button" className={`vf-drop${uploading ? " busy" : ""}`} disabled={uploading} id={`${uid}file`} {...bad("file")}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); void pickFile(e.dataTransfer.files?.[0]); }}>
              {uploading ? (
                <>
                  <b>กำลังอัปโหลด… {progress}%</b>
                  <span className="vf-bar" aria-hidden="true"><i style={{ width: `${progress}%` }} /></span>
                  <small>อย่าปิดหน้านี้จนกว่าจะเสร็จ</small>
                </>
              ) : (
                <>
                  <b>📱 แตะเพื่อเลือกคลิป หรือลากไฟล์มาวาง</b>
                  <small>MP4 / MOV จากมือถือ · ไม่เกิน 200 MB · ยาวไม่เกิน 3 นาที · รูปปกสร้างจากคลิปให้อัตโนมัติ</small>
                </>
              )}
            </button>
          )}
          <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/*" className="sr-only" tabIndex={-1} aria-label="ไฟล์คลิป" data-video-file
            onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      )}
      {upErr && <p className="vf-err" role="alert">{upErr}</p>}

      <div className="vf-grid">
        <div className="vf-pv-col">
          <div className={`vf-pv${vertical ? " is-v" : ""}`} style={previewImg ? undefined : { background: `linear-gradient(150deg,#1d1d1f,${src ? VIDEO_SOURCES[src].color : "#555"})` }}>
            {previewImg && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewImg} alt="" referrerPolicy="no-referrer" />
            )}
            {src && <span className="vf-pv-src">{VIDEO_SOURCES[src].name}</span>}
          </div>
          <div className="vf-poster-acts">
            <button type="button" className="btn btn-outline btn-sm" disabled={busyPoster} onClick={() => posterRef.current?.click()}>{busyPoster ? "กำลังอัปโหลด…" : poster.key ? "เปลี่ยนรูปปก" : "อัปโหลดรูปปก"}</button>
            {poster.key && <button type="button" className="link" onClick={() => setPoster({ key: null, url: null })}>ใช้รูปปกอัตโนมัติ</button>}
            <input ref={posterRef} type="file" accept={IMG_TYPES.join(",")} className="sr-only" tabIndex={-1} aria-label="รูปปกคลิป" data-poster-file onChange={(e) => { void pickPoster(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
          <small className="sub">{src === "YOUTUBE" ? "รูปปกดึงจาก YouTube ให้เอง" : src === "UPLOAD" ? "รูปปกจับจากเฟรมในคลิป" : "Facebook/TikTok/Instagram ไม่ให้รูปปก — อัปโหลดรูปปกเองจะสวยกว่า (ไม่ใส่ = พื้นสีของแพลตฟอร์ม)"}</small>
        </div>

        <div className="vf-fields">
          <div className="field vf-full">
            <label htmlFor={`${uid}title`}>ชื่อคลิป <small className="sub">{title.length}/{VIDEO_TITLE_MAX}</small></label>
            <input id={`${uid}title`} value={title} maxLength={VIDEO_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น รีวิวไฟใต้น้ำ RGB 12W ทดสอบในสระจริง" {...bad("title")} />
          </div>
          <div className="field">
            <label htmlFor={`${uid}vertical`}>แบบคลิป</label>
            <select id={`${uid}vertical`} value={vertical ? "v" : "h"} onChange={(e) => setVertical(e.target.value === "v")}>
              <option value="h">วิดีโอ (แนวนอน 16:9)</option>
              <option value="v">Shorts / Reels (แนวตั้ง 9:16)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${uid}topic`}>หัวข้อ (ตัวกรองบนหน้าเว็บ)</label>
            <input id={`${uid}topic`} list={`${uid}topics`} value={topic} maxLength={VIDEO_TOPIC_MAX} onChange={(e) => setTopic(e.target.value)} placeholder="เลือกหรือพิมพ์ใหม่" />
            <datalist id={`${uid}topics`}>{topics.map((t) => <option key={t} value={t} />)}</datalist>
          </div>
          <div className="field vf-full">
            <label htmlFor={`${uid}product`}>ผูกกับสินค้า (ไม่บังคับ) — คลิปจะโชว์ในหน้าสินค้านั้น + มีปุ่ม “ดูสินค้า”</label>
            <input id={`${uid}product`} list={`${uid}products`} value={prodText} onChange={(e) => setProdText(e.target.value)} placeholder="พิมพ์ชื่อหรือรหัสสินค้า แล้วเลือกจากรายการ" {...bad("product")} />
            <datalist id={`${uid}products`}>{products.map((p) => <option key={p.id} value={p.label} />)}</datalist>
            {prodText.trim() && !product && <small className="vf-warn">เลือกสินค้าจากรายการที่ขึ้นมา (ยังไม่ตรงกับสินค้าใด)</small>}
          </div>
          <div className="field">
            <label htmlFor={`${uid}publish`}>การแสดง</label>
            <select id={`${uid}publish`} value={publish} onChange={(e) => setPublish(e.target.value as typeof publish)}>
              <option value="now">แสดงทันที</option>
              <option value="hidden">ซ่อนไว้ก่อน</option>
              <option value="schedule">ตั้งเวลาเผยแพร่…</option>
            </select>
          </div>
          {publish === "schedule" ? (
            <div className="field">
              <label htmlFor={`${uid}publishAt`}>เผยแพร่เมื่อ (เวลาไทย)</label>
              <input id={`${uid}publishAt`} type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} {...bad("publishAt")} />
            </div>
          ) : <div />}
          <label className="vf-check vf-full">
            <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
            <span><b>แนะนำ</b> — ขึ้นต้นรายการ และแสดงในส่วน “วิดีโอแนะนำ” หน้าแรก</span>
          </label>
          {state.error && <div className="login-err vf-full" role="alert">{state.error}</div>}
          <div className="vf-acts vf-full">
            <button type="button" className="btn btn-primary" disabled={pending || uploading || busyPoster} onClick={submit}>
              {pending ? "กำลังบันทึก…" : uploading ? "รออัปโหลดคลิป…" : editing ? "บันทึกการแก้ไข" : "บันทึกคลิป"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
