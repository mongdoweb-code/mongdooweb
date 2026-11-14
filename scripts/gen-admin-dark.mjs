// สร้างธีมมืดของหลังบ้านอัตโนมัติจากไฟล์ CSS เดิม → src/app/admin/admin-dark.generated.css
// รัน: npm run gen:admin-dark (ต้องรันใหม่ทุกครั้งที่แก้สีใน CSS หลังบ้าน — tests/unit/admin-dark.test.ts ตรวจว่าไฟล์ล่าสุดแล้ว)
//
// หลักการ: ทุกกฎที่มี "สีตายตัว" (#hex) ในคุณสมบัติสี → สร้างกฎใหม่ที่ขึ้นต้นด้วย html[data-adm-theme="dark"] และแปลงสี
//   พื้นหลังสว่าง → พื้นมืด (ยิ่งสว่างเดิม ยิ่งเป็นชั้นที่ยกขึ้น เช่น การ์ด > พื้นหน้า) · ตัวอักษรเข้ม → สว่าง · ตัวอักษรสี (ส้ม/เขียว/แดง) → สว่างขึ้นให้อ่านบนพื้นมืด
//   เส้นขอบสว่าง → เส้นมืด · ตัวอักษรขาว / พื้นสีเข้มเดิม (ปุ่มส้ม แถบเมนูดำ) คงไว้
//   var(--c-ink) ที่ใช้เป็นพื้น → พื้นเทาเข้มยกขึ้น (ตัวแปรเหล่านี้กลายเป็นสีสว่างในธีมมืดเพื่อใช้เป็นตัวอักษร) · color: var(--c-white) → ขาว
// ยกเว้น: แผ่นเอกสาร A4 / ใบปะหน้า / หน้าพิมพ์ (ต้องเป็นกระดาษขาวเสมอ) และโซนการตลาดหน้าเข้าสู่ระบบ (มืดอยู่แล้ว)
import { readFileSync, writeFileSync } from "node:fs";
import postcss from "postcss";

export const SOURCES = [
  "src/app/admin/admin.css",
  "src/app/admin/lot3.css",
  "src/app/admin/lot12.css",
  "src/app/admin/_components/quickbar.css",
  "src/app/admin/(app)/_lot10/lot10.css",
  "src/app/admin/(app)/coupons/coupons.css",
  "src/app/admin/(app)/settings/login/login-settings.css",
  "src/app/admin/login/login.css",
  "src/components/sort-toolbar/sort-toolbar.css",
];
export const OUT = "src/app/admin/admin-dark.generated.css";
const ROOT = 'html[data-adm-theme="dark"]';

// ส่วนที่ต้องคงสีสว่าง/สีเดิม (กระดาษ เอกสาร ใบปะหน้า หน้าพิมพ์ โซนการตลาดที่มืดอยู่แล้ว ตัวอย่างธีม)
const EXCLUDE = /\.side\b|\.logo-mark|\.sheet\b|\.sh-|\.label\b|\.lb-|\.lsheet|#docMeasure|\.pv-sheet|\.pp-sheets|\.de-pv\b|\.lg-hero|\.lg-fx|\.lg-strip|\.lg-parts|\.lg-gal|\.lg-hl|\.lg-stats|\.lg-head|\.lg-glow|\.lg-sub|\.lg-eyebrow|\.lg-orb|\.lg-beam|\.lg-grid|\.lg-preview|\.lp-t-|\.lp-theme i\b|\.bk-|\.cp-sw|\.cp-grid|\.swatch|\.lp-pv-box/;

const PROPS = /^(background|background-color|background-image|color|border|border-(top|right|bottom|left)|border(-(top|right|bottom|left))?-color|outline|outline-color|fill|stroke|caret-color|text-decoration-color|column-rule|column-rule-color)$/;

// ---------- สี ----------
function hexToRgb(h) {
  let s = h.slice(1);
  if (s.length === 3 || s.length === 4) s = [...s].map((c) => c + c).join("");
  const n = parseInt(s.slice(0, 6), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: s.length === 8 ? s.slice(6) : "" };
}
function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}
function hslToHex({ h, s, l }, a = "") {
  const f = (n) => {
    const k = (n + h / 30) % 12, x = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - x * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}${a}`.toUpperCase();
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** role: bg | text | border */
export function darkColor(hex, role) {
  const c = hexToRgb(hex), { h, s, l } = rgbToHsl(c);
  if (role === "bg") {
    if (l < 0.3) return null; // พื้นเข้มเดิม (ปุ่มดำ แถบเมนู) คงไว้
    if (s > 0.45 && l < 0.72) return null; // พื้นสีสด (ปุ่มส้ม/เขียว) คงไว้
    // ลำดับชั้นคงเดิม: ขาว (การ์ด) 0.135 > ครีม (พื้นหน้า) ~0.09 > ครีมเข้ม/เทา ~0.07 · สีเทากลางใส่โทนเย็นเล็กน้อย
    const nl = l >= 0.9 ? 0.075 + (l - 0.9) * 0.6 : clamp(0.075 - (0.9 - l) * 0.05, 0.06, 0.075);
    // ครีม/เทาอมสีอ่อน (สีพื้นของธีม) = เทาโทนเย็นเดียวกัน · พื้นสีจาง (เช่น ส้มอ่อน เขียวอ่อน) คงโทนสีไว้
    const neutral = s < 0.06 || (s < 0.35 && l > 0.86);
    return hslToHex(neutral ? { h: 222, s: 0.12, l: nl } : { h, s: clamp(s * 0.45, 0, 0.35), l: nl }, c.a);
  }
  if (role === "border") {
    if (l < 0.3) return null;
    if (s > 0.45 && l < 0.65) return null;
    const bl = clamp(0.155 + (l - 0.6) * 0.14, 0.15, 0.22);
    return hslToHex(s < 0.06 || (s < 0.35 && l > 0.8) ? { h: 222, s: 0.12, l: bl } : { h, s: clamp(s * 0.5, 0, 0.4), l: bl + 0.04 }, c.a);
  }
  // text
  if (l > 0.92) return null; // ตัวอักษรขาว (บนปุ่มสี/พื้นเข้ม) คงไว้
  if (s < 0.18) return hslToHex({ h, s, l: clamp(1 - l * 0.85, 0.6, 0.93) }, c.a); // เทา/ดำ → สว่าง
  return hslToHex({ h, s: clamp(s, 0, 0.85), l: clamp(Math.max(l, 0.64), 0.64, 0.8) }, c.a); // ตัวอักษรสี → สว่างขึ้น
}

const roleOf = (prop) => (/^(color|fill|stroke|caret-color|text-decoration-color)$/.test(prop) ? "text" : /^border|^outline|^column-rule/.test(prop) ? "border" : "bg");

/** ตัวแปรสีของคอมโพเนนต์ (เช่น --stb-line) → บทบาทตามชื่อ */
const roleOfVar = (name) => (/line|border/.test(name) ? "border" : /ink|muted|text|fg|acc/.test(name) ? "text" : "bg");

function convertValue(prop, value) {
  const role = prop.startsWith("--") ? roleOfVar(prop) : roleOf(prop);
  let changed = false;
  let out = value.replace(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g, (m) => {
    const d = darkColor(m, role);
    if (!d || d.toUpperCase() === m.toUpperCase()) return m;
    changed = true;
    return d;
  });
  // ตัวแปรสีเข้มที่ใช้เป็น "พื้น" (ในธีมมืดตัวแปรนี้เป็นสีสว่างสำหรับตัวอักษร)
  if (role === "bg" && /var\(--c-ink\)/.test(out)) { out = out.replace(/var\(--c-ink\)/g, "#3A404B"); changed = true; }
  if (role === "text" && /^var\(--c-white\)$/.test(out.trim())) { out = "#FFFFFF"; changed = true; }
  return changed ? out : null;
}

function scopeSelector(sel) {
  return sel
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !EXCLUDE.test(s))
    .map((s) => (/^(html|:root)\b/.test(s) ? null : /^body\b/.test(s) ? `${ROOT} ${s}` : `${ROOT} ${s}`))
    .filter(Boolean)
    .join(",\n");
}

export function generate() {
  const out = postcss.root();
  out.append(postcss.comment({ text: " ไฟล์นี้สร้างอัตโนมัติด้วย scripts/gen-admin-dark.mjs — ห้ามแก้ตรง (แก้ที่ CSS ต้นฉบับแล้วรัน npm run gen:admin-dark) " }));
  for (const file of SOURCES) {
    const root = postcss.parse(readFileSync(file, "utf8"), { from: file });
    const section = [];
    root.walkRules((rule) => {
      // ข้าม keyframes / print
      for (let p = rule.parent; p && p.type !== "root"; p = p.parent) {
        if (p.type === "atrule" && (/keyframes$/.test(p.name) || (p.name === "media" && /print/.test(p.params)))) return;
      }
      // คัดลอกทุกคุณสมบัติสีของกฎ (แปลงได้ = สีใหม่ · แปลงไม่ได้/ตัวแปร = ค่าเดิม) เพื่อให้ลำดับ/น้ำหนักของกฎในธีมมืด
      // เหมือนต้นฉบับ — ไม่งั้นกฎพื้นฐานที่ถูกแปลง (เช่น .switch) จะทับกฎสถานะที่ใช้ตัวแปร (.switch[aria-checked="true"])
      const decls = [];
      rule.each((n) => {
        if (n.type !== "decl") return;
        const isVarColor = n.prop.startsWith("--") && /^#(?:[0-9a-fA-F]{3,8})$/.test(n.value.trim());
        if (!PROPS.test(n.prop) && !isVarColor) return;
        const v = convertValue(n.prop, n.value);
        decls.push(postcss.decl({ prop: n.prop, value: v ?? n.value, important: n.important }));
      });
      if (!decls.length) return;
      const sel = scopeSelector(rule.selector);
      if (!sel) return;
      let node = postcss.rule({ selector: sel });
      decls.forEach((d) => node.append(d));
      // อยู่ใน @media/@supports เดิม → ห่อเหมือนเดิม
      for (let p = rule.parent; p && p.type !== "root"; p = p.parent) {
        if (p.type === "atrule") node = postcss.atRule({ name: p.name, params: p.params }).append(node);
      }
      section.push(node);
    });
    if (section.length) {
      out.append(postcss.comment({ text: ` ${file} ` }));
      section.forEach((n) => out.append(n));
    }
  }
  return out.toString() + "\n";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const css = generate();
  writeFileSync(OUT, css);
  console.log(`เขียน ${OUT} (${(css.length / 1024).toFixed(1)} KB)`);
}
