// ไอคอนเส้นของหมวดสินค้า (ชุดเดียวกับ public/js/shell.js) — ใช้แสดง/เลือกไอคอนในหลังบ้าน
export const CATEGORY_ICONS: Record<string, string> = {
  water:   '<path d="M3 15c2 0 2-1.5 4.5-1.5S9.5 15 12 15s2.5-1.5 4.5-1.5S19 15 21 15M3 19c2 0 2-1.5 4.5-1.5S9.5 19 12 19s2.5-1.5 4.5-1.5S19 19 21 19"/><circle cx="12" cy="7" r="3"/>',
  pool:    '<path d="M3 17c2 0 2-1.5 4.5-1.5S9.5 17 12 17s2.5-1.5 4.5-1.5S19 17 21 17"/><path d="M8 14V5a2 2 0 0 1 4 0M14 14V5a2 2 0 0 1 4 0M8 9h6"/>',
  fountain:'<path d="M12 21v-9M12 12c-1-4-4-6-7-6M12 12c1-4 4-6 7-6M12 12V4"/><path d="M5 21h14"/>',
  uplight: '<rect x="7" y="16" width="10" height="4"/><path d="M12 13V3M8 12 5 6M16 12l3-6"/>',
  garden:  '<path d="M12 21v-7M12 14c-4 0-6-3-6-6 3 0 6 2 6 6zM12 14c4 0 6-3 6-6-3 0-6 2-6 6z"/><path d="M6 21h12"/>',
  down:    '<path d="M3 5h18"/><path d="M8 5v3a4 4 0 0 0 8 0V5"/><path d="M9 15l-2 4M12 15v5M15 15l2 4"/>',
  strip:   '<path d="M3 8c3 0 3 8 6 8s3-8 6-8 3 8 6 8"/><circle cx="6" cy="11" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="18" cy="13" r=".8"/>',
  stage:   '<circle cx="8" cy="8" r="3"/><path d="M10 10l9 9M5 21h14"/><path d="M14 4l2-2M17 7l3-1"/>',
  wash:    '<rect x="4" y="3" width="16" height="18"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"/>',
  spot:    '<path d="M4 10h9v6H4z"/><path d="M13 10l7-4v14l-7-4"/><path d="M8 16v4"/>',
  wall:    '<path d="M4 3v18"/><path d="M4 8h5l3 4-3 4H4"/><path d="M15 12h5M14 8l4-2M14 16l4 2"/>',
  deco:    '<path d="M3 11 12 4l9 7v9H3z"/><path d="M10 20v-5h4v5"/>'
};
export const ICON_KEYS = Object.keys(CATEGORY_ICONS);
