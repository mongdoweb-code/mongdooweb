// ธีมกลางวัน/กลางคืนของหน้าร้าน — สคริปต์ตั้งค่าก่อนวาดหน้า (ไม่กะพริบเป็นสีขาวก่อน)
// คุกกี้ mdw_theme = light | dark | system (ไม่มี = system → ตามโหมดของเครื่องลูกค้า) · ปุ่มสลับอยู่ใน public/js/shell.js
export const SHOP_THEME_COOKIE = "mdw_theme";
export const SHOP_THEME_BOOT = `(function(){try{var h=document.documentElement;var m=(document.cookie.match(/(?:^|; )mdw_theme=(light|dark|system)/)||[])[1]||"system";var d=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);h.setAttribute("data-theme",d?"dark":"light");h.setAttribute("data-theme-mode",m)}catch(e){}})()`;
