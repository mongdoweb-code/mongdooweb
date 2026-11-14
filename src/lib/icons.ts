// ไอคอนเส้นของหมวดสินค้า (24×24, stroke) — แหล่งเดียวของทั้งหลังบ้าน (เลือกไอคอน) และหน้าร้าน (เมนู/การ์ด ส่งไปทาง mdw-data: ShopCategory.iconSvg)
// public/js/shell.js เก็บชุดเดิม 12 ไอคอนไว้เป็นค่าสำรองเท่านั้น · หมวดที่อัปโหลดไอคอนเอง (Category.iconKey) ใช้รูปแทนไอคอนเส้น
// เพิ่มไอคอน: ใส่ในรายการด้านล่าง (key ห้ามซ้ำ/ห้ามเปลี่ยน — เก็บใน Category.icon)

export type CatIcon = { key: string; label: string; group: string; path: string };

export const ICON_GROUPS = ["งานน้ำ", "สวนและภายนอก", "อาคารและภายใน", "ไฟประดับ", "อุปกรณ์และไฟฟ้า", "อื่น ๆ"] as const;

export const CATEGORY_ICON_LIST: CatIcon[] = [
  // งานน้ำ
  { key: "water", label: "ไฟใต้น้ำ", group: "งานน้ำ", path: '<path d="M3 15c2 0 2-1.5 4.5-1.5S9.5 15 12 15s2.5-1.5 4.5-1.5S19 15 21 15M3 19c2 0 2-1.5 4.5-1.5S9.5 19 12 19s2.5-1.5 4.5-1.5S19 19 21 19"/><circle cx="12" cy="7" r="3"/>' },
  { key: "pool", label: "สระว่ายน้ำ", group: "งานน้ำ", path: '<path d="M3 17c2 0 2-1.5 4.5-1.5S9.5 17 12 17s2.5-1.5 4.5-1.5S19 17 21 17"/><path d="M8 14V5a2 2 0 0 1 4 0M14 14V5a2 2 0 0 1 4 0M8 9h6"/>' },
  { key: "fountain", label: "น้ำพุ", group: "งานน้ำ", path: '<path d="M12 21v-9M12 12c-1-4-4-6-7-6M12 12c1-4 4-6 7-6M12 12V4"/><path d="M5 21h14"/>' },
  // สวนและภายนอก
  { key: "uplight", label: "ไฟฝังพื้น", group: "สวนและภายนอก", path: '<rect x="7" y="16" width="10" height="4"/><path d="M12 13V3M8 12 5 6M16 12l3-6"/>' },
  { key: "garden", label: "ไฟส่องต้นไม้", group: "สวนและภายนอก", path: '<path d="M12 21v-7M12 14c-4 0-6-3-6-6 3 0 6 2 6 6zM12 14c4 0 6-3 6-6-3 0-6 2-6 6z"/><path d="M6 21h12"/>' },
  { key: "spot", label: "สปอตไลท์", group: "สวนและภายนอก", path: '<path d="M4 10h9v6H4z"/><path d="M13 10l7-4v14l-7-4"/><path d="M8 16v4"/>' },
  { key: "flood", label: "ฟลัดไลท์", group: "สวนและภายนอก", path: '<rect x="3" y="5" width="13" height="10" rx="1"/><path d="M6 8h7M6 11h7M9 15v4M6 19h6"/><path d="M19 7l2-1M19 10h2.5M19 13l2 1"/>' },
  { key: "street", label: "ไฟถนน", group: "สวนและภายนอก", path: '<path d="M6 21V5a2 2 0 0 1 2-2h7"/><path d="M13 3h6l-1.5 3h-3z"/><path d="M15.5 8l-1 2M17 8v2.5M18.5 8l1 2M4 21h4"/>' },
  { key: "bollard", label: "ไฟทางเดิน", group: "สวนและภายนอก", path: '<rect x="9" y="3" width="6" height="18" rx="1"/><path d="M9 8h6"/><path d="M5 8h2M17 8h2M6 5l1.5 1.5M18 5l-1.5 1.5"/><path d="M6 21h12"/>' },
  { key: "solar", label: "โซล่าเซลล์", group: "สวนและภายนอก", path: '<path d="M3 13h18l-2-8H5z"/><path d="M12 5v8M4 9h16M8 5l-1 8M16 5l1 8"/><path d="M12 13v5M8 21h8"/>' },
  { key: "tree", label: "ต้นไม้ / สวน", group: "สวนและภายนอก", path: '<path d="M12 3 6 11h3l-4 6h14l-4-6h3z"/><path d="M12 17v4"/>' },
  // อาคารและภายใน
  { key: "wash", label: "ไฟส่องตึก", group: "อาคารและภายใน", path: '<rect x="4" y="3" width="16" height="18"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"/>' },
  { key: "building", label: "อาคาร", group: "อาคารและภายใน", path: '<path d="M4 21V5l8-2v18M12 9l8 2v10M2 21h20"/><path d="M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2"/>' },
  { key: "wall", label: "โคมติดผนัง", group: "อาคารและภายใน", path: '<path d="M4 3v18"/><path d="M4 8h5l3 4-3 4H4"/><path d="M15 12h5M14 8l4-2M14 16l4 2"/>' },
  { key: "down", label: "ดาวน์ไลท์ฝังฝ้า", group: "อาคารและภายใน", path: '<path d="M3 5h18"/><path d="M8 5v3a4 4 0 0 0 8 0V5"/><path d="M9 15l-2 4M12 15v5M15 15l2 4"/>' },
  { key: "downlight", label: "ดาวน์ไลท์กลม", group: "อาคารและภายใน", path: '<path d="M3 6h18"/><ellipse cx="12" cy="9" rx="6" ry="2.5"/><path d="M8 13l-2 6M12 13v7M16 13l2 6"/>' },
  { key: "panel", label: "โคมพาเนล", group: "อาคารและภายใน", path: '<rect x="4" y="4" width="16" height="16" rx="1"/><rect x="7" y="7" width="10" height="10"/>' },
  { key: "pendant", label: "โคมไฟแขวน", group: "อาคารและภายใน", path: '<path d="M12 3v6"/><path d="M6 15a6 6 0 0 1 12 0z"/><path d="M10 18a2 2 0 0 0 4 0"/>' },
  { key: "chandelier", label: "โคมระย้า", group: "อาคารและภายใน", path: '<path d="M12 3v4M12 7l-7 3M12 7l7 3M5 10h14"/><path d="M7 10v3a2 2 0 0 0 4 0v-3M13 10v3a2 2 0 0 0 4 0v-3"/><path d="M9 17v2M15 17v2"/>' },
  { key: "ceiling", label: "โคมไฟเพดาน", group: "อาคารและภายใน", path: '<path d="M3 5h18"/><path d="M6 5c0 4 2.7 7 6 7s6-3 6-7"/><path d="M12 15v2M7 14l-1.5 1.5M17 14l1.5 1.5"/>' },
  { key: "track", label: "ไฟราง", group: "อาคารและภายใน", path: '<path d="M3 5h18"/><path d="M7 5v3M17 5v3"/><path d="M5 8h4l1 5H4z"/><path d="M15 8h4l1 5h-6z"/>' },
  { key: "step", label: "ไฟขั้นบันได", group: "อาคารและภายใน", path: '<path d="M3 20h6v-5h6v-5h6"/><path d="M11 14h2M17 9h2"/>' },
  { key: "bulb", label: "หลอดไฟ", group: "อาคารและภายใน", path: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>' },
  { key: "tube", label: "หลอดยาว (T5/T8)", group: "อาคารและภายใน", path: '<rect x="3" y="10" width="18" height="4" rx="2"/><path d="M1 12h2M21 12h2M7 7l1 2M12 6v2M17 7l-1 2"/>' },
  // ไฟประดับ
  { key: "strip", label: "ไฟเส้น LED", group: "ไฟประดับ", path: '<path d="M3 8c3 0 3 8 6 8s3-8 6-8 3 8 6 8"/><circle cx="6" cy="11" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="18" cy="13" r=".8"/>' },
  { key: "neon", label: "ไฟเส้นนีออนดัด", group: "ไฟประดับ", path: '<path d="M4 15c0-6 5-6 5-2s5 4 5-2 6-6 6 0"/><path d="M4 15v4M20 11v8"/>' },
  { key: "string", label: "ไฟประดับสาย / ปิงปอง", group: "ไฟประดับ", path: '<path d="M2 6c6 5 14 5 20 0"/><circle cx="6" cy="11" r="1.5"/><circle cx="12" cy="12.5" r="1.5"/><circle cx="18" cy="11" r="1.5"/><path d="M6 8.5v1M12 9.5v1.5M18 8.5v1"/>' },
  { key: "stage", label: "ไฟเวที", group: "ไฟประดับ", path: '<circle cx="8" cy="8" r="3"/><path d="M10 10l9 9M5 21h14"/><path d="M14 4l2-2M17 7l3-1"/>' },
  { key: "rgb", label: "RGB เปลี่ยนสี", group: "ไฟประดับ", path: '<circle cx="9" cy="9" r="5"/><circle cx="15" cy="9" r="5"/><circle cx="12" cy="15" r="5"/>' },
  { key: "star", label: "ไฟดาว / ตกแต่ง", group: "ไฟประดับ", path: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>' },
  { key: "sign", label: "ป้ายไฟ", group: "ไฟประดับ", path: '<rect x="3" y="4" width="18" height="11" rx="1"/><path d="M7 8h6M7 11h10"/><path d="M8 15v5M16 15v5"/>' },
  { key: "moon", label: "ไฟกลางคืน", group: "ไฟประดับ", path: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>' },
  // อุปกรณ์และไฟฟ้า
  { key: "remote", label: "รีโมท / คอนโทรลเลอร์", group: "อุปกรณ์และไฟฟ้า", path: '<rect x="7" y="2" width="10" height="20" rx="2"/><circle cx="12" cy="7" r="1.5"/><path d="M10 12h.01M14 12h.01M10 15h.01M14 15h.01M10 18h.01M14 18h.01"/>' },
  { key: "power", label: "หม้อแปลง / พาวเวอร์ซัพพลาย", group: "อุปกรณ์และไฟฟ้า", path: '<rect x="3" y="7" width="18" height="10" rx="1"/><path d="M13 9l-3 4h4l-3 4"/><path d="M1 12h2M21 12h2"/>' },
  { key: "cable", label: "สายไฟ", group: "อุปกรณ์และไฟฟ้า", path: '<path d="M4 4c8 0 4 8 8 8s0 8 8 8"/><path d="M2 4h3M19 20h3"/>' },
  { key: "plug", label: "ปลั๊ก / ข้อต่อ", group: "อุปกรณ์และไฟฟ้า", path: '<path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0z"/><path d="M12 17v5"/>' },
  { key: "sensor", label: "เซ็นเซอร์", group: "อุปกรณ์และไฟฟ้า", path: '<circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>' },
  { key: "smart", label: "สมาร์ท / WiFi", group: "อุปกรณ์และไฟฟ้า", path: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><path d="M12 19.5h.01"/>' },
  { key: "battery", label: "แบตเตอรี่", group: "อุปกรณ์และไฟฟ้า", path: '<rect x="2" y="7" width="18" height="10" rx="1.5"/><path d="M22 10v4"/><path d="M6 10v4M10 10v4"/>' },
  { key: "tools", label: "อุปกรณ์ติดตั้ง", group: "อุปกรณ์และไฟฟ้า", path: '<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L3 18l3 3 6.2-6.2a4 4 0 0 0 5.3-5.3l-2.4 2.4-2.6-.4-.4-2.6z"/>' },
  { key: "card", label: "คีย์การ์ด / RFID", group: "อุปกรณ์และไฟฟ้า", path: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h4"/>' },
  { key: "security", label: "กล้อง / ความปลอดภัย", group: "อุปกรณ์และไฟฟ้า", path: '<path d="M3 7h13l3 3-3 3H3z"/><path d="M8 13v4H4M19 9l2-1v4l-2-1"/>' },
  // อื่น ๆ
  { key: "fog", label: "เครื่องพ่นควัน", group: "อื่น ๆ", path: '<path d="M4 15h10v4H4z"/><path d="M14 16h3M17 13c2 0 2-2 4-2M17 17c2 0 2 2 4 2M17 15h4"/>' },
  { key: "sun", label: "กลางวัน / แสงแดด", group: "อื่น ๆ", path: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>' },
  { key: "deco", label: "บ้าน / ทั่วไป", group: "อื่น ๆ", path: '<path d="M3 11 12 4l9 7v9H3z"/><path d="M10 20v-5h4v5"/>' },
];

/** key → path (ใช้ร่วมกับโค้ดเดิม) */
export const CATEGORY_ICONS: Record<string, string> = Object.fromEntries(CATEGORY_ICON_LIST.map((i) => [i.key, i.path]));
export const ICON_KEYS = CATEGORY_ICON_LIST.map((i) => i.key);
export const iconPath = (key: string | null | undefined) => CATEGORY_ICONS[key ?? ""] ?? CATEGORY_ICONS.deco;
