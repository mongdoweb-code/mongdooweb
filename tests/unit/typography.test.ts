// ตัวอักษร (ฟอนต์) จากหลังร้าน (src/lib/typography.ts)
import assert from "node:assert/strict";
import { AREAS, BASE_DEFAULT, contrast, familiesUrl, googleFontsUrl, parseTypography, typographyCss, areaSize, emptyScope } from "../../src/lib/typography";

let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };
const eq = (a: unknown, b: unknown, m: string) => { assert.deepEqual(a, b, m); n++; };

eq(parseTypography({}), { admin: null, shop: null }, "ว่าง = หน้าตาเดิม");
eq(parseTypography("{bad"), { admin: null, shop: null }, "JSON เสีย");
const t = parseTypography({
  admin: { base: { thai: "IBM Plex Sans Thai", latin: "Geist", size: 99, weight: 333, lh: 9, ls: 0.3, color: "red" }, areas: { sidebar: { size: 14, weight: 500, italic: true, color: "#ffffff", font: "Comic Sans" }, nope: { size: 20 } } },
  shop: { base: { thai: "</style><script>", size: 16 } },
});
eq(t.admin!.base, { thai: "IBM Plex Sans Thai", latin: "Geist", size: 20, weight: 400, lh: 1.55, ls: 0.3, color: "" }, "จำกัดช่วง/ค่าที่ไม่รู้จัก = ค่าเริ่มต้น");
eq(t.admin!.areas, { sidebar: { size: 14, weight: 500, italic: true, color: "#FFFFFF" } }, "ส่วนที่ไม่รู้จักถูกตัด · ฟอนต์นอกรายการถูกตัด");
eq(t.shop!.base.thai, "Noto Sans Thai", "ชื่อฟอนต์แปลก ๆ ไม่หลุดเข้า CSS");
eq(typographyCss(t.shop, "shop"), "", "ค่าเหมือนค่าเริ่มต้น = ไม่สร้าง CSS");
const css = typographyCss(t.admin, "admin");
ok(css.includes("html[data-adm-theme]{--font:'Geist','IBM Plex Sans Thai',system-ui,sans-serif}"), "ฟอนต์รวม");
ok(css.includes("html[data-adm-theme] .side .nav-i{font-size:14px;font-weight:500;font-style:italic}"), "ส่วนเมนูซ้าย");
ok(css.includes('html[data-adm-theme="light"] .side .nav-i{color:#FFFFFF}'), "สีเฉพาะธีมสว่าง");
ok(css.includes(":is(.sheet,.lsheet,.label){font-weight:400;letter-spacing:normal}"), "เอกสาร A4 ไม่รับระยะตัวอักษร");
ok(!/<|script/i.test(css), "ไม่มีข้อความอันตราย");
// ขนาดพื้นฐาน +2 → ส่วนอื่นขยายตาม
const big = { ...emptyScope("admin"), base: { ...BASE_DEFAULT.admin, size: 17 } };
eq(areaSize(big, "admin", AREAS.admin.find((a) => a.key === "quickbar")!), 15.5, "ขยายตามสัดส่วน");
eq(areaSize(big, "admin", AREAS.admin.find((a) => a.key === "title")!), 29, "หัวข้อขยายมากกว่า");
// ลิงก์ Google Fonts: เฉพาะที่ใช้ · Noto ไม่ต้องโหลด · ฟอนต์น้ำหนักเดียวไม่ใส่ wght
eq(googleFontsUrl([t.admin]), "https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=IBM+Plex+Sans+Thai:wght@300;400;500;600;700&display=swap", "ลิงก์ฟอนต์");
eq(googleFontsUrl([null, emptyScope("shop")]), null, "Noto อย่างเดียว = ไม่โหลด");
eq(familiesUrl(["Itim", "Charm"]), "https://fonts.googleapis.com/css2?family=Charm:wght@400;700&family=Itim&display=swap", "น้ำหนักตามที่มีจริง");
ok(familiesUrl(["Kanit"], "กข")!.endsWith("&text=%E0%B8%81%E0%B8%82"), "โหลดเฉพาะตัวอักษร");
ok(contrast("#FFFFFF", "#161616") > 15 && contrast("#DDDDDD", "#FFFFFF") < 4.5, "ความคมชัด");
console.log(`typography: ผ่าน ${n} ข้อ`);
