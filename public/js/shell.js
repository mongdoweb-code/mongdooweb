/* =========================================================
   shell.js — ส่วนที่ใช้ทุกหน้าหน้าร้าน: แถบประกาศ, เมนูหมวด, ค้นหา, ตะกร้า, เมนูมือถือ,
   ปุ่มลอย, แบนเนอร์คุกกี้ ย้ายมาจาก prototype/mongdoweb-home.html
   ข้อมูล (หมวด/สินค้า/ตั้งค่า) มาจากฐานข้อมูลผ่าน <script id="mdw-data"> ที่ server ใส่ให้
   ========================================================= */
const MDW_DATA = (() => { try { return JSON.parse(document.getElementById('mdw-data').textContent); } catch (e) { return {}; } })();
const SITE = location.origin + '/';
const LINE_URL = (MDW_DATA.settings && MDW_DATA.settings.lineUrl) || 'https://line.me/R/ti/p/@mongdoweb'; // TODO: ยืนยัน LINE OA ID จริง (ตั้งค่าในหลังบ้าน)
/* ขั้นค่าส่งตามยอดสั่งซื้อ (ชุดเดียวกับที่ server ใช้) — ใช้แสดงค่าส่งโดยประมาณในตะกร้า */
const SHOP_CFG = (() => { try { return JSON.parse(document.getElementById('mdw-shop').textContent) || {}; } catch (e) { return {}; } })();
const SHIP_TIERS = Array.isArray(SHOP_CFG.tiers) ? SHOP_CFG.tiers : [];
const FREE_SHIP = typeof SHOP_CFG.freeShipMin === 'number' && SHOP_CFG.freeShipMin > 0 ? SHOP_CFG.freeShipMin : null;
const tierFee = sub => SHIP_TIERS.reduce((fee, t) => sub >= t.min ? t.fee : fee, SHIP_TIERS[0] ? SHIP_TIERS[0].fee : 0);
/* ส่ง event ให้ analytics.js (โหลดสคริปต์ภายนอกเฉพาะเมื่อลูกค้ายินยอม) */
window.mdwTrack = window.mdwTrack || function(){ (window.mdwQ = window.mdwQ || []).push(arguments); };

// ไอคอนเส้น (stroke) สำหรับแต่ละหมวด
const ICONS = {
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

const CATEGORY_GROUPS = { water:'งานน้ำ', outdoor:'สวนและภายนอก', building:'อาคารและภายใน', deco:'อุปกรณ์และตกแต่ง' };

/* CATALOG — สินค้าจากฐานข้อมูล (รูปแบบเดียวกับต้นแบบ: id = slug, price เป็นบาท)
   best: โชว์ใน "สินค้าขายดี" · use: พื้นที่ที่เหมาะ (ใช้ในตัวช่วยเลือก)
   color: white | rgb | any · kit: ในชุดมีหม้อแปลงแล้ว · acc: อุปกรณ์เสริม · catId: หมวด */
const CATALOG = Array.isArray(MDW_DATA.catalog) ? MDW_DATA.catalog : [];
const DEFAULT_CATEGORIES = Array.isArray(MDW_DATA.categories) ? MDW_DATA.categories : [];
const byId = id => CATALOG.find(p => p.id === id);
const PRODUCTS = CATALOG.filter(p => p.best);

/* =========================================================
   HELPERS — storage ปลอดภัย (ห่อ try/catch ทุกครั้ง), escape, URL ที่อนุญาต
   ========================================================= */
const LS = {
  get(k){ try { return window.localStorage.getItem(k); } catch(e){ return null; } },
  set(k, v){ try { window.localStorage.setItem(k, v); return true; } catch(e){ return false; } },
  json(k){ const r = LS.get(k); if (r == null) return null; try { return JSON.parse(r); } catch(e){ return null; } }
};
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const str = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
// ลิงก์จากหลังบ้าน: อนุญาตเฉพาะ #..., /... (ไม่ใช่ //), http(s)://, tel:, mailto:
function safeHref(h){
  const s = typeof h === 'string' ? h.trim() : '';
  if (/^#[^\s]*$/.test(s) || /^\/(?!\/)/.test(s) || /^https?:\/\/[^\s]+$/i.test(s) || /^(tel|mailto):[^\s]+$/i.test(s)) return s;
  return '#';
}
// รูปจากหลังบ้าน: อนุญาตเฉพาะ https://, รูปที่อัปโหลด (/media/...) หรือ data:image/...
function safeImg(u){
  const s = typeof u === 'string' ? u.trim() : '';
  if (/^https:\/\/[^\s"'<>]+$/i.test(s) || /^\/media\/[\w/.-]+$/.test(s) || /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i.test(s)) return s;
  return '';
}
const RM = matchMedia('(prefers-reduced-motion: reduce)');
const svg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ICONS.deco}</svg>`;
const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const baht = n => '฿' + Number(n).toLocaleString('th-TH', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const phClass = p => 'ph' + (p.acc ? ' acc' : p.color === 'rgb' ? ' rgb' : '');
/* รูปสินค้า (ถ้ามี) หรือภาพแทนแบบต้นแบบ */
const thumb = (p, tag = 'div') => p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy" decoding="async">` : `<${tag} class="${phClass(p)}"></${tag}>`;
/* ราคา 0 = ต้องสอบถามราคา, สินค้าหมด/ต้องสอบถาม = สั่งออนไลน์ไม่ได้ */
const priceTxt = p => p.price > 0 ? baht(p.price) : 'สอบถามราคา';
const canBuy = p => !!p && p.price > 0 && p.inStock !== false;
const maxQty = p => Math.max(0, Math.min(999, p && p.maxQty != null ? p.maxQty : 999));
const FINDER_ACC = MDW_DATA.finderAcc || {};
let lastPointer = 'mouse';
addEventListener('pointerdown', e => { lastPointer = e.pointerType || 'mouse'; }, true);

/* LINE links (placeholder — ตั้งค่า LINE_URL ด้านบน) */
$$('[data-line]').forEach(a => a.href = LINE_URL);

/* =========================================================
   CATEGORIES (U11–U17) — render จาก mdw_categories
   ========================================================= */
function normCat(c, i){
  if (!c || typeof c !== 'object') return null;
  const th = str(c.th, 80);
  if (!th) return null;
  return {
    id: str(c.id, 64) || ('cat' + i), th, en: str(c.en, 80),
    icon: ICONS[c.icon] ? c.icon : 'deco',
    group: CATEGORY_GROUPS[c.group] ? c.group : 'deco',
    slug: str(c.slug, 600).replace(/^\/+/, ''),
    popular: Array.isArray(c.popular) ? c.popular.map(p => str(p, 40)).filter(Boolean).slice(0, 4) : [],
    visible: !!c.visible, order: num(c.order, i), _i: i
  };
}
function getCats(){
  return DEFAULT_CATEGORIES.map(normCat).filter(c => c && c.visible).sort((a, b) => (a.order - b.order) || (a._i - b._i));
}
const catHref = c => '/category/' + encodeURIComponent(c.slug);
let CATS = [];

function renderCats(){
  CATS = getCats();
  const n = CATS.length;
  if ($('#statCats')) $('#statCats').textContent = n;
  if ($('#catCount')) $('#catCount').textContent = n;
  const groups = Object.keys(CATEGORY_GROUPS).map(g => ({ g, label: CATEGORY_GROUPS[g], items: CATS.filter(c => c.group === g) })).filter(x => x.items.length);

  // การ์ดหมวด + dropdown รายการยอดนิยม
  if ($('#catGrid')) $('#catGrid').innerHTML = CATS.map(c => {
    const href = esc(catHref(c));
    return `<div class="cat-card reveal in" data-cat="${esc(c.id)}">
      <div class="cat-tilt">
        <a class="cat-main" href="${href}" aria-describedby="pop-${esc(c.id)}">
          <span class="cat-icon">${svg(c.icon)}</span>
          <div><h3>${esc(c.th)}</h3><span class="cat-en">${esc(c.en)}</span></div>
          <span class="go">ดูสินค้า ${CHEV}</span>
        </a>
      </div>
      <div class="cat-pop" id="pop-${esc(c.id)}">
        <div class="cat-pop-in">
          ${c.popular.length ? `<p class="cat-pop-h">ยอดนิยมใน${esc(c.th)}</p>
          <ul>${c.popular.map(p => `<li><a href="${href}">${esc(p)}</a></li>`).join('')}</ul>` : ''}
          <a class="cat-all" href="${href}">ดูทั้งหมด</a>
        </div>
      </div>
    </div>`;
  }).join('') || '<p class="sec-sub">ยังไม่มีหมวดสินค้าที่เปิดแสดง</p>';

  // Mega panel
  const best = PRODUCTS.find(p => p.badge === 'ขายดี' && canBuy(p)) || PRODUCTS.find(canBuy);
  $('#megaPanel').innerHTML = `
    <div class="container mega-in">
      <div class="mega-cols" style="--cols:${Math.max(1, groups.length)}">
        ${groups.map(g => `<div class="mega-col">
          <p class="mega-gh">${esc(g.label)}</p>
          <ul>${g.items.map(c => `<li><a class="mega-link" href="${esc(catHref(c))}">
            <span class="mi">${svg(c.icon)}</span><span><b>${esc(c.th)}</b><small>${esc(c.en)}</small></span></a></li>`).join('')}</ul>
        </div>`).join('')}
      </div>
      <aside class="mega-promo" aria-label="แนะนำ">
        <div class="mp-finder">
          <small>ตัวช่วยเลือกไฟ</small>
          <b>ไม่แน่ใจว่าควรใช้รุ่นไหน?</b>
          <p>ตอบ 3 ข้อ เราแนะนำรุ่นที่เหมาะพร้อมอุปกรณ์ที่ต้องใช้</p>
          <a href="/#finder" data-mega-close>เริ่มเลือกไฟ <span aria-hidden="true">→</span></a>
        </div>
        ${best ? `<div class="mp-best">
          <div class="thumb">${thumb(best)}</div>
          <div><small>ขายดีอันดับ 1</small><b>${esc(best.name)}</b>
            <div class="row"><span class="pr">${baht(best.price)}</span><button type="button" data-add="${esc(best.id)}" data-mega-close>ใส่ตะกร้า</button></div></div>
        </div>` : ''}
      </aside>
    </div>
    <div class="mega-foot"><div class="container"><span>${n} หมวดสินค้า · ส่งไว 2–3 วัน</span><a href="/#categories" data-mega-close>ดูหมวดสินค้าทั้งหมด →</a></div></div>`;

  // Drawer accordion (มือถือ)
  $('#drawerCats').innerHTML = groups.map((g, k) => `<div class="acc">
      <button class="acc-btn" type="button" aria-expanded="false" aria-controls="acc-${g.g}" id="accb-${g.g}">
        <span>${esc(g.label)}<span class="n">${g.items.length} หมวด</span></span>${CHEV}
      </button>
      <div class="acc-panel" id="acc-${g.g}" role="region" aria-labelledby="accb-${g.g}"><div>
        ${g.items.map(c => `<a href="${esc(catHref(c))}" data-close><span class="mi">${svg(c.icon)}</span><span>${esc(c.th)}<small>${esc(c.en)}</small></span></a>`).join('')}
      </div></div>
    </div>`).join('');

  $('#footerCats').innerHTML = CATS.slice(0, 5).map(c => `<li><a href="${esc(catHref(c))}">${esc(c.th)}</a></li>`).join('');
}
renderCats();

/* ---------- Mega dropdown: hover-intent + keyboard + touch (U12) ---------- */
const Mega = (() => {
  const wrap = $('#navMega'), btn = $('#megaBtn'), panel = $('#megaPanel');
  let tOpen = 0, tClose = 0, openedBy = '', leavePt = null, leaveAt = 0;
  const isOpen = () => wrap.classList.contains('open');
  function open(by){
    clearTimeout(tClose); clearTimeout(tOpen);
    if (isOpen()) return;
    openedBy = by || '';
    const sp = $('#searchPanel'); if (sp.classList.contains('open')){ sp.classList.remove('open'); $('#searchBtn').setAttribute('aria-expanded','false'); $('#suggestWrap').hidden = true; }
    wrap.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
    CartPop.hide();
  }
  function close(focusBtn){
    clearTimeout(tClose); clearTimeout(tOpen);
    if (!isOpen()) return;
    wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
    if (focusBtn) btn.focus();
  }
  const links = () => $$('a, button', panel);
  // safe triangle: จุดที่เมาส์ออก → ขอบบนซ้าย/ขวาของ panel
  function inTriangle(x, y){
    if (!leavePt) return false;
    const r = panel.getBoundingClientRect();
    const [ax, ay] = leavePt, bx = r.left, by = r.top, cx = r.right, cy = r.top;
    const s = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
    const d1 = s(x, y, ax, ay, bx, by), d2 = s(x, y, bx, by, cx, cy), d3 = s(x, y, cx, cy, ax, ay);
    return !(((d1 < 0) || (d2 < 0) || (d3 < 0)) && ((d1 > 0) || (d2 > 0) || (d3 > 0)));
  }
  function scheduleClose(){
    clearTimeout(tClose);
    tClose = setTimeout(close, 250);
  }
  wrap.addEventListener('pointerenter', e => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(tClose);
    if (!isOpen()){ clearTimeout(tOpen); tOpen = setTimeout(() => open('hover'), 120); }
  });
  wrap.addEventListener('pointerleave', e => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(tOpen);
    leavePt = [e.clientX, e.clientY]; leaveAt = Date.now();
    scheduleClose();
  });
  document.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || !isOpen() || !leavePt || wrap.contains(e.target)) return;
    // ยังเคลื่อนเข้าหา panel ในแนวทแยง → ยืดเวลาปิด (สูงสุด 1 วินาที)
    if (inTriangle(e.clientX, e.clientY) && Date.now() - leaveAt < 1000) scheduleClose();
  }, { passive: true });
  btn.addEventListener('click', e => {
    const kb = e.detail === 0; // Enter/Space
    if (!kb && lastPointer === 'mouse' && isOpen() && openedBy === 'hover'){ openedBy = 'click'; return; }
    if (isOpen()) close(); else { open(kb ? 'key' : 'click'); if (kb) links()[0] && links()[0].focus(); }
  });
  btn.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown'){ e.preventDefault(); open('key'); const l = links(); l[0] && l[0].focus(); }
    else if (e.key === 'Escape' && isOpen()){ e.preventDefault(); close(true); }
  });
  panel.addEventListener('keydown', e => {
    const l = links(), i = l.indexOf(document.activeElement);
    if (e.key === 'Escape'){ e.preventDefault(); close(true); return; }
    const cols = $$('.mega-col', panel);
    const colOf = el => cols.findIndex(c => c.contains(el));
    let t = null;
    if (e.key === 'ArrowDown') t = l[(i + 1) % l.length];
    else if (e.key === 'ArrowUp') t = l[(i - 1 + l.length) % l.length];
    else if (e.key === 'Home') t = l[0];
    else if (e.key === 'End') t = l[l.length - 1];
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft'){
      const c = colOf(document.activeElement), dir = e.key === 'ArrowRight' ? 1 : -1;
      if (c >= 0 && cols[c + dir]) t = cols[c + dir].querySelector('a');
      else if (c >= 0 && dir > 0) t = $('.mega-promo a, .mega-promo button', panel);
      else if (c < 0 && dir < 0 && cols.length) t = cols[cols.length - 1].querySelector('a');
    }
    if (t){ e.preventDefault(); t.focus(); }
  });
  wrap.addEventListener('focusout', e => { if (isOpen() && e.relatedTarget && !wrap.contains(e.relatedTarget)) close(); });
  panel.addEventListener('click', e => { if (e.target.closest('a, [data-mega-close]')) close(); });
  document.addEventListener('click', e => { if (isOpen() && !wrap.contains(e.target)) close(); });
  return { open, close, isOpen };
})();

/* ---------- Drawer accordion (U16) ---------- */
$('#drawerCats').addEventListener('click', e => {
  const b = e.target.closest('.acc-btn'); if (!b) return;
  const acc = b.parentElement, open = !acc.classList.contains('open');
  acc.classList.toggle('open', open); b.setAttribute('aria-expanded', open);
});

/* =========================================================
   MINI CART
   state: { productId: qty } — จำไว้ใน localStorage (ห่อ try/catch กันเบราว์เซอร์ที่ปิด storage)
   TODO: ย้าย state นี้ไป React (Context/Zustand) ตอนแยก component — server ตรวจราคาซ้ำตอนสั่งซื้อเสมอ
   ========================================================= */
const CART_KEY = 'mdw_cart', SEEN_KEY = 'mdw_cart_seen';
/* ตะกร้าดิบจากเครื่อง { slug: qty } — รวมสินค้าที่ไม่อยู่ในข้อมูลหน้าร้านแล้ว (ให้ server ตรวจและแจ้งลูกค้า) */
function rawCart(){
  const raw = LS.json(CART_KEY), out = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw))
    Object.keys(raw).slice(0, 50).forEach(id => { const q = Math.floor(Number(raw[id])); if (q > 0) out[id] = Math.min(q, 999); });
  return out;
}
function loadCart(){
  const raw = rawCart(), out = {};
  Object.keys(raw).forEach(id => { const p = byId(id); if (canBuy(p) && maxQty(p) > 0) out[id] = Math.min(raw[id], maxQty(p)); });
  return out;
}
let cartAtLoad = rawCart();
let cart = loadCart();
/* ราคาที่ลูกค้าเห็นตอนใส่ตะกร้า { slug: บาท } — ใช้แจ้งเมื่อราคาเปลี่ยน */
const seenPrices = () => { const s = LS.json(SEEN_KEY); return s && typeof s === 'object' && !Array.isArray(s) ? s : {}; };
function saveSeen(){ const old = seenPrices(), s = {}; Object.keys(cart).forEach(id => { const p = byId(id); s[id] = old[id] != null ? old[id] : p.price; }); LS.set(SEEN_KEY, JSON.stringify(s)); }
let cartFlags = {};      // { slug: ข้อความแจ้งใต้รายการ } จากการตรวจครั้งล่าสุด
let cartNotes = [];      // ข้อความสรุปด้านบนตะกร้า
let validating = null, validatedAt = 0;

/* U16: ตรวจตะกร้ากับ server — ราคาเปลี่ยน/ปิดขาย/ของหมด/สต็อกไม่พอ → ปรับให้และแจ้งลูกค้า */
function validateCart(force){
  // ครั้งแรกส่งจำนวนดิบจากเครื่อง (ยังไม่ถูกตัดตามข้อมูลที่แคชไว้) ให้ server เป็นผู้ตัดสิน
  const items = Object.assign({}, cart, cartAtLoad || {});
  if (!Object.keys(items).length){ cartAtLoad = null; return Promise.resolve(false); }
  if (validating) return validating;
  if (!force && Date.now() - validatedAt < 3000) return Promise.resolve(false);
  const body = $('#cartBody'); body.setAttribute('aria-busy', 'true');
  validating = fetch('/api/cart/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, seen: seenPrices() }) })
    .then(r => r.ok ? r.json() : null)
    .then(res => {
      if (!res || !Array.isArray(res.lines)) return false;
      const next = {}, flags = {}, notes = [], seen = seenPrices();
      res.lines.forEach(l => {
        let p = byId(l.id);
        if (l.status !== 'gone'){
          // อัปเดตข้อมูลสินค้าในหน้าให้ตรงกับฐานข้อมูล (ตะกร้า, ป๊อปอัป, ปุ่มซื้อคู่กัน ใช้ชุดเดียวกัน)
          if (!p){ p = { id: l.id, name: l.name, cat: '', catId: '', specs: [], use: [], color: l.color || 'any' }; CATALOG.push(p); }
          p.name = l.name; p.price = l.price; p.inStock = l.status !== 'out' && l.status !== 'ask';
          if (l.maxQty != null) p.maxQty = l.maxQty; else delete p.maxQty;
          if (l.img) p.img = l.img;
        }
        const nm = l.name || (p && p.name) || '';
        if (l.status === 'gone') notes.push(nm ? `นำ "${nm}" ออกจากตะกร้า เพราะปิดการขายแล้ว` : 'นำสินค้าที่ปิดการขายแล้วออกจากตะกร้า');
        else if (l.status === 'out') notes.push(`นำ "${nm}" ออกจากตะกร้า เพราะสินค้าหมด`);
        else if (l.status === 'ask') notes.push(`นำ "${nm}" ออกจากตะกร้า — สินค้านี้ต้องสอบถามราคาทาง LINE`);
        else if (l.status === 'qty'){ notes.push(`"${nm}" เหลือ ${l.qty} ชิ้น ปรับจำนวนในตะกร้าให้แล้ว`); flags[l.id] = `ปรับเป็น ${l.qty} ชิ้นตามสต็อก`; }
        else if (l.status === 'price'){ notes.push(`"${nm}" ราคาเปลี่ยนจาก ${baht(l.oldPrice)} เป็น ${baht(l.price)}`); flags[l.id] = `ราคาเดิม ${baht(l.oldPrice)}`; }
        if (l.qty > 0){ next[l.id] = l.qty; seen[l.id] = l.price; } else delete seen[l.id];
      });
      cartAtLoad = null;
      const changed = notes.length > 0 || JSON.stringify(next) !== JSON.stringify(cart);
      cart = next; cartFlags = flags; cartNotes = notes;
      LS.set(CART_KEY, JSON.stringify(cart)); LS.set(SEEN_KEY, JSON.stringify(seen));
      renderCart();
      if (notes.length && !cartEl.classList.contains('open')) toast(notes.length === 1 ? notes[0] : `ตะกร้ามีการเปลี่ยนแปลง ${notes.length} รายการ — เปิดตะกร้าเพื่อดูรายละเอียด`);
      document.dispatchEvent(new CustomEvent('mdw:cart-validated', { detail: { changed, notes } }));
      return changed;
    })
    .catch(() => false)
    .finally(() => { validating = null; validatedAt = Date.now(); body.removeAttribute('aria-busy'); });
  return validating;
}

const cartEl = document.getElementById('cart');
const saveCart = () => { LS.set(CART_KEY, JSON.stringify(cart)); saveSeen(); };
const cartQty = () => Object.values(cart).reduce((a,b) => a + b, 0);
const cartSum = () => Object.entries(cart).reduce((s,[id,q]) => s + byId(id).price * q, 0);
const capCount = n => n > 99 ? '99+' : String(n);
const cartAria = n => n ? `ตะกร้าสินค้า ${n} ชิ้น` : 'ตะกร้าสินค้า ว่าง';

function addToCart(id, qty = 1, mode = 'open'){ // mode: open | toast | silent
  const p = byId(id);
  if (!p) return false;
  if (!canBuy(p)){ toast(p.price > 0 ? `"${p.name}" สินค้าหมดชั่วคราว` : `"${p.name}" กรุณาสอบถามราคาทาง LINE`); return false; }
  const want = (cart[id] || 0) + qty;
  if (want > maxQty(p)) toast(`"${p.name}" มีสินค้าเหลือ ${maxQty(p)} ชิ้น`);
  cart[id] = Math.min(want, maxQty(p));
  if (!cart[id]){ delete cart[id]; return false; }
  saveCart(); renderCart();
  ['cartCount', 'fabCount'].forEach(k => { const c = document.getElementById(k); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); });
  if (mode === 'open') openCart(); else if (mode === 'toast') toast('เพิ่ม "' + byId(id).name + '" ลงตะกร้าแล้ว');
  window.mdwTrack('add_to_cart', { value: p.price * qty, items: [{ id: p.id, name: p.name, price: p.price, qty }] });
  return true;
}
function setQty(id, q){
  const p = byId(id);
  if (p && q > maxQty(p)) toast(`"${p.name}" มีสินค้าเหลือ ${maxQty(p)} ชิ้น`);
  if (q <= 0 || !p) delete cart[id]; else cart[id] = Math.min(q, maxQty(p));
  delete cartFlags[id];
  saveCart(); renderCart();
}
function renderBadges(){
  const n = cartQty();
  [['cartCount', 'cartBtn'], ['fabCount', 'fabCart']].forEach(([c, b]) => {
    const el = document.getElementById(c);
    el.textContent = capCount(n); el.hidden = n === 0;
    document.getElementById(b).setAttribute('aria-label', cartAria(n));
  });
  CartPop.render();
  updateFabs();
}
function renderCart(){
  const n = cartQty();
  renderBadges();
  document.getElementById('cartHeadCount').textContent = n ? `(${n} ชิ้น)` : '';
  const sum = cartSum(), fee = n ? tierFee(sum) : 0;
  document.getElementById('cartTotal').textContent = baht(sum);
  document.getElementById('cartShip').innerHTML = !SHIP_TIERS.length ? 'คำนวณตอนชำระเงิน' : fee === 0 ? '<span class="free">ส่งฟรี</span>' : baht(fee);
  document.getElementById('cartGrand').textContent = baht(sum + fee);
  const bar = document.getElementById('cartShipBar');
  bar.hidden = !n || !FREE_SHIP;
  if (n && FREE_SHIP){
    const left = Math.max(0, Math.round((FREE_SHIP - sum) * 100) / 100), pct = Math.min(100, sum / FREE_SHIP * 100);
    bar.classList.toggle('done', left <= 0);
    bar.innerHTML = (left > 0 ? `ซื้อเพิ่มอีก <b>${baht(left)}</b> รับสิทธิ์ส่งฟรี` : '<b>ยอดนี้ได้รับสิทธิ์ส่งฟรี</b>')
      + `<span class="bar" role="progressbar" aria-label="ความคืบหน้าสู่ส่งฟรี" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="width:${pct.toFixed(1)}%"></i></span>`;
  }
  const note = document.getElementById('cartNotice');
  note.hidden = !cartNotes.length;
  note.innerHTML = cartNotes.length ? `<b>ตะกร้าอัปเดตตามข้อมูลล่าสุดของร้าน</b><ul>${cartNotes.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : '';
  document.getElementById('cartFoot').style.display = n ? '' : 'none';
  const body = document.getElementById('cartBody');
  if (!n){
    body.innerHTML = `<div class="cart-empty"><b>ยังไม่มีสินค้าในตะกร้า</b>ลองใช้ตัวช่วยเลือกไฟ เพื่อหารุ่นที่เหมาะกับพื้นที่ของคุณ
      <br><a href="/#finder" class="btn btn-primary" data-cart-close>ช่วยเลือกไฟ</a></div>`;
    return;
  }
  const items = Object.entries(cart).map(([id,q]) => { const p = byId(id); return `
    <div class="ci">
      <a class="ci-thumb" href="/product/${encodeURIComponent(p.id)}" tabindex="-1" aria-hidden="true">${thumb(p)}</a>
      <div>
        <div class="ci-name"><a href="/product/${encodeURIComponent(p.id)}">${esc(p.name)}</a></div>
        <div class="ci-unit">${baht(p.price)} / ชิ้น</div>${cartFlags[id] ? `<div class="ci-flag">${esc(cartFlags[id])}</div>` : ''}
        <div class="qty">
          <button data-qty="${esc(id)}" data-d="-1" aria-label="ลดจำนวน ${esc(p.name)}">−</button>
          <span aria-label="จำนวน">${q}</span>
          <button data-qty="${esc(id)}" data-d="1" aria-label="เพิ่มจำนวน ${esc(p.name)}">+</button>
        </div>
      </div>
      <div class="ci-right">
        <div class="ci-line">${baht(p.price * q)}</div>
        <button class="ci-del" data-del="${esc(id)}" aria-label="ลบ ${esc(p.name)} ออกจากตะกร้า">ลบ</button>
      </div>
    </div>`; }).join('');
  // สินค้าที่ซื้อคู่กัน: หม้อแปลง (เฉพาะเมื่อมีโคมที่ไม่ใช่ชุดพร้อมใช้) และท่อหดกันน้ำ ที่ยังไม่อยู่ในตะกร้า
  const ids = Object.keys(cart);
  const needPsu = ids.some(id => !byId(id).acc && !byId(id).kit);
  const ups = [needPsu && FINDER_ACC.psu, FINDER_ACC.shrink].map(id => id && byId(id)).filter(p => canBuy(p) && !cart[p.id]);
  body.innerHTML = items + (ups.length ? `
    <div class="upsell"><h3>มักซื้อคู่กัน</h3>${ups.map(p => `
      <div class="up-item"><div><b>${esc(p.name)}</b><small>${baht(p.price)}</small></div>
      <button data-up="${esc(p.id)}" aria-label="เพิ่ม ${esc(p.name)}">+ เพิ่ม</button></div>`).join('')}
    </div>` : '');
}

/* โฟกัสในหน้าต่าง (drawer/cart) — จำปุ่มที่เปิด, วนโฟกัสด้วย Tab, คืนโฟกัสตอนปิด */
function trapFocus(container, e){
  const f = $$('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])', container).filter(el => el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
}
let cartReturn = null;
function openCart(from){
  renderCart(); CartPop.hide(); Mega.close();
  validateCart(); // U16: ตรวจราคา/สต็อกล่าสุดทุกครั้งที่เปิดตะกร้า
  cartReturn = (from && from.focus) ? from : document.activeElement;
  cartEl.classList.add('open'); cartEl.setAttribute('aria-hidden','false'); document.body.classList.add('locked');
  setTimeout(() => { const b = $('.cart-head [data-cart-close]'); b && b.focus({ preventScroll: true }); }, 30);
}
function closeCart(){
  if (!cartEl.classList.contains('open')) return;
  cartEl.classList.remove('open'); cartEl.setAttribute('aria-hidden','true'); document.body.classList.remove('locked');
  if (cartReturn && document.contains(cartReturn)) cartReturn.focus({ preventScroll: true });
}
cartEl.addEventListener('keydown', e => { if (e.key === 'Tab') trapFocus($('.cart-panel'), e); });

document.getElementById('cartBtn').onclick = e => openCart(e.currentTarget);
document.getElementById('fabCart').onclick = e => openCart(e.currentTarget);
cartEl.addEventListener('click', e => {
  const q = e.target.closest('[data-qty]');
  if (q){ const id = q.dataset.qty; setQty(id, cart[id] + Number(q.dataset.d)); return; }
  const d = e.target.closest('[data-del]');
  if (d){ setQty(d.dataset.del, 0); $('.cart-head [data-cart-close]').focus(); return; }
  const u = e.target.closest('[data-up]');
  if (u){ addToCart(u.dataset.up, 1, 'silent'); return; }
  if (e.target.closest('[data-cart-close]')) closeCart();
});
document.getElementById('checkoutBtn').onclick = async e => {
  const b = e.currentTarget; b.disabled = true;
  const changed = await validateCart(true);
  b.disabled = false;
  // ตะกร้าเปลี่ยน (ราคา/สต็อก) → ให้ลูกค้าเห็นข้อความก่อน แล้วค่อยกดสั่งซื้ออีกครั้ง
  if (changed || !cartQty()){ const n = $('#cartNotice'); if (!n.hidden){ n.tabIndex = -1; n.focus(); } return; }
  location.href = '/checkout';
};

// ปุ่ม "ใส่ตะกร้า" — ยืนยันด้วยสถานะ ✓ เพิ่มแล้ว (U23) + เปิดตะกร้า
document.addEventListener('click', e => {
  const b = e.target.closest('[data-add]');
  if (!b) return;
  addToCart(b.dataset.add, 1, 'silent');
  if (b.classList.contains('add-btn')){
    clearTimeout(b._t);
    b.classList.add('added'); b.textContent = '✓ เพิ่มแล้ว';
    b._t = setTimeout(() => { b.classList.remove('added'); b.textContent = 'ใส่ตะกร้า'; }, 1500);
  }
  openCart(b);
});

/* ---------- Cart hover preview (U20, เดสก์ท็อป) ---------- */
const CartPop = (() => {
  const wrap = $('#cartWrap'), pop = $('#cartPop');
  const can = matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1025px)');
  let t = 0;
  const show = () => { if (!can.matches || cartEl.classList.contains('open')) return; render(); wrap.classList.add('pop-open'); pop.setAttribute('aria-hidden', 'false'); };
  const hide = () => { clearTimeout(t); wrap.classList.remove('pop-open'); pop.setAttribute('aria-hidden', 'true'); };
  function render(){
    const n = cartQty(), items = Object.entries(cart);
    pop.innerHTML = n ? `
      <div class="cp-head"><span>ในตะกร้า</span><b>${n} ชิ้น</b></div>
      <ul>${items.slice(0, 3).map(([id, q]) => `<li><span>${esc(byId(id).name)}</span><span>× ${q}</span></li>`).join('')}</ul>
      ${items.length > 3 ? `<p class="cp-more">และอีก ${items.length - 3} รายการ</p>` : ''}
      <div class="cp-sum"><span>ยอดรวมสินค้า</span><b>${baht(cartSum())}</b></div>
      <button class="btn btn-primary btn-sm" type="button" data-pop-open tabindex="-1">ดูตะกร้า</button>`
      : `<div class="cp-head"><span>ตะกร้าสินค้า</span><b>0 ชิ้น</b></div>
      <p class="cp-empty">ยังไม่มีสินค้าในตะกร้า</p>
      <a class="btn btn-outline btn-sm" href="/#products" data-pop-close tabindex="-1">ดูสินค้าขายดี</a>`;
  }
  wrap.addEventListener('pointerenter', e => { if (e.pointerType !== 'mouse') return; clearTimeout(t); t = setTimeout(show, 150); });
  wrap.addEventListener('pointerleave', e => { if (e.pointerType !== 'mouse') return; clearTimeout(t); t = setTimeout(hide, 250); });
  pop.addEventListener('click', e => {
    if (e.target.closest('[data-pop-open]')) openCart($('#cartBtn'));
    else if (e.target.closest('[data-pop-close]')) hide();
  });
  return { show, hide, render };
})();

/* ---------- Floating cart + back-to-top (U20, U24) ---------- */
const fabCart = $('#fabCart'), toTop = $('#toTop'), header = document.getElementById('header');
const mobileMQ = matchMedia('(max-width: 768px)');
function setFab(el, show){ el.classList.toggle('is-hidden', !show); el.tabIndex = show ? 0 : -1; el.setAttribute('aria-hidden', show ? 'false' : 'true'); }
function updateFabs(){
  const y = window.scrollY;
  // header เป็น sticky — offsetTop เปลี่ยนตามการเลื่อน จึงใช้ตำแหน่งปลายสไลเดอร์เทียบกับขอบบนแทน
  const sl = $('#slider');
  const pastHeader = sl ? sl.getBoundingClientRect().top < -header.offsetHeight : y > header.offsetHeight;
  setFab(fabCart, mobileMQ.matches && pastHeader && cartQty() > 0);
  setFab(toTop, y > 700);
}
toTop.addEventListener('click', () => {
  scrollTo({ top: 0, behavior: RM.matches ? 'auto' : 'smooth' });
  $('#logoLink').focus({ preventScroll: true });
});
let scrollRaf = 0;
addEventListener('scroll', () => {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; header.classList.toggle('scrolled', scrollY > 8); updateFabs(); });
}, { passive: true });
mobileMQ.addEventListener && mobileMQ.addEventListener('change', updateFabs);
renderCart();

/* ---------- Toast ---------- */
let tt;
function toast(msg){
  const t = document.getElementById('toast');
  t.querySelector('span').textContent = msg;
  t.classList.add('show');
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2400);
}

/* =========================================================
   SEARCH + instant suggestions (U21)
   ========================================================= */
(() => {
  const panel = $('#searchPanel'), btn = $('#searchBtn'), input = $('#q'), box = $('#suggestWrap'), list = $('#suggest'), status = $('#sgStatus');
  const SEARCH_URL = '/search?q=';
  const norm = s => String(s).normalize('NFC').toLowerCase().replace(/[​-‍﻿]/g, '').replace(/\s+/g, '');
  // คำพ้อง ไทย ↔ อังกฤษ ที่ลูกค้าใช้บ่อย
  const SYN = { pool:'สระ', 'สระ':'pool', fountain:'น้ำพุ', 'น้ำพุ':'fountain', garden:'สวน', 'สวน':'garden', underwater:'ใต้น้ำ', 'ใต้น้ำ':'underwater',
    rgb:'เปลี่ยนสี', 'เปลี่ยนสี':'rgb', 'สีขาว':'แสงขาว', white:'แสงขาว', 'ขาว':'white', 'หม้อแปลง':'adapter', 'อะแดปเตอร์':'หม้อแปลง' };
  const INDEX = CATALOG.map(p => ({ p, name: norm(p.name), hay: norm([p.name, p.cat, (p.specs || []).join(' '), p.kw || ''].join(' ')) }));
  let results = [], sel = -1;

  function search(q){
    const toks = q.trim().split(/\s+/).map(norm).filter(Boolean);
    if (!toks.length) return [];
    return INDEX.map(x => {
      let ok = true, score = 0;
      toks.forEach(t => {
        const alt = SYN[t] ? norm(SYN[t]) : null;
        if (x.hay.includes(t) || (alt && x.hay.includes(alt))){ score += x.name.startsWith(t) ? 3 : x.name.includes(t) ? 2 : 1; }
        else ok = false;
      });
      return ok ? { p: x.p, score: score + (x.p.best ? .5 : 0) } : null;
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 6).map(x => x.p);
  }
  function highlight(name, q){
    const t = q.trim().split(/\s+/).sort((a, b) => b.length - a.length)[0] || '';
    const i = t ? name.toLowerCase().indexOf(t.toLowerCase()) : -1;
    if (i < 0) return esc(name);
    return esc(name.slice(0, i)) + '<mark>' + esc(name.slice(i, i + t.length)) + '</mark>' + esc(name.slice(i + t.length));
  }
  const linkFor = p => '/product/' + encodeURIComponent(p.id);
  function show(on){ box.hidden = !on; input.setAttribute('aria-expanded', on ? 'true' : 'false'); }
  function render(){
    const q = input.value;
    if (!q.trim()){ show(false); results = []; sel = -1; input.removeAttribute('aria-activedescendant'); status.textContent = ''; return; }
    results = search(q); sel = -1; input.removeAttribute('aria-activedescendant');
    if (!results.length){
      list.innerHTML = `<div class="sg-empty" role="option" aria-disabled="true" aria-selected="false"><b>ไม่พบสินค้า “${esc(q.trim())}”</b>ลองคำอื่น เช่น “ไฟใต้น้ำ” “สระ” “RGB” หรือ <a href="/#finder" data-sg-close>ให้เราช่วยเลือกรุ่น</a></div>`;
      $('#sgFoot').hidden = true;
      status.textContent = 'ไม่พบสินค้า';
    } else {
      list.innerHTML = results.map((p, i) => `<a class="sg-opt" role="option" id="sg-${i}" aria-selected="false" href="${esc(linkFor(p))}" tabindex="-1">
        <span class="thumb">${thumb(p, 'span')}</span>
        <span><b>${highlight(p.name, q)}</b><small>${esc(p.cat)}</small></span>
        <span class="pr">${priceTxt(p)}</span></a>`).join('');
      $('#sgFoot').hidden = false;
      status.textContent = `พบ ${results.length} รายการ`;
    }
    show(true);
  }
  function move(d){
    if (!results.length) return;
    sel += d;
    if (sel >= results.length) sel = -1;
    else if (sel < -1) sel = results.length - 1;
    $$('.sg-opt', list).forEach((o, i) => o.setAttribute('aria-selected', i === sel ? 'true' : 'false'));
    if (sel >= 0){ const o = $('#sg-' + sel); input.setAttribute('aria-activedescendant', o.id); o.scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  }
  input.addEventListener('input', render);
  input.addEventListener('focus', () => { if (input.value.trim()) render(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown'){ e.preventDefault(); if (box.hidden) render(); move(1); }
    else if (e.key === 'ArrowUp'){ e.preventDefault(); move(-1); }
    else if (e.key === 'Enter' && sel >= 0){ e.preventDefault(); $('#sg-' + sel).click(); }
    else if (e.key === 'Escape'){
      e.stopPropagation();
      if (!box.hidden){ show(false); } else { closePanel(true); }
    }
  });
  list.addEventListener('click', e => { if (e.target.closest('[data-sg-close]')) closePanel(); });
  $('#searchForm').addEventListener('submit', e => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q){ input.focus(); return; }
    location.href = SEARCH_URL + encodeURIComponent(q);
  });
  function openPanel(){ panel.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); Mega.close(); input.focus(); }
  function closePanel(focusBtn){ panel.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); show(false); if (focusBtn) btn.focus(); }
  btn.addEventListener('click', () => panel.classList.contains('open') ? closePanel() : openPanel());
  document.addEventListener('click', e => { if (!box.hidden && !e.target.closest('.search-box')) show(false); });
})();

/* ---------- Mobile drawer ---------- */
const drawer = document.getElementById('drawer'), menuBtn = document.getElementById('menuBtn');
function openDrawer(){ drawer.classList.add('open'); drawer.setAttribute('aria-hidden','false'); menuBtn.setAttribute('aria-expanded','true'); document.body.classList.add('locked');
  setTimeout(() => $('.drawer-top [data-close]').focus({ preventScroll: true }), 30); }
function closeDrawer(){ if (!drawer.classList.contains('open')) return; drawer.classList.remove('open'); drawer.setAttribute('aria-hidden','true'); menuBtn.setAttribute('aria-expanded','false'); document.body.classList.remove('locked'); menuBtn.focus({ preventScroll: true }); }
menuBtn.onclick = openDrawer;
drawer.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeDrawer(); });
drawer.addEventListener('keydown', e => { if (e.key === 'Tab') trapFocus($('.drawer-panel'), e); });

addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (cartEl.classList.contains('open')) closeCart();
  else if (drawer.classList.contains('open')) closeDrawer();
  else if (Mega.isOpen()) Mega.close(true);
  CartPop.hide();
});

/* =========================================================
   ANNOUNCEMENT BAR (U22)
   ========================================================= */
(() => {
  const bar = $('#topbar'), KEY = 'mdw_topbar_closed';
  const hide = () => { document.documentElement.style.setProperty('--tb-h', '0px'); };
  // ร้านปิดแถบประกาศในหลังบ้าน → server ไม่ส่งแถบมาเลย
  if (!bar){ hide(); return; }
  const VER = bar.dataset.ver || 'v1', host = $('#tbMsgs');
  // ลูกค้าปิดข้อความนี้ไปแล้ว — เห็นใหม่เมื่อร้านเปลี่ยนข้อความ
  if (LS.get(KEY) === VER){ bar.remove(); hide(); return; }
  let i = 0, paused = false;
  bar.addEventListener('pointerenter', () => paused = true);
  bar.addEventListener('pointerleave', () => paused = false);
  bar.addEventListener('focusin', () => paused = true);
  bar.addEventListener('focusout', () => paused = false);
  const els = $$('.tb-msg', host);
  const timer = els.length > 1 ? setInterval(() => {
    if (paused || document.hidden) return;
    els[i].classList.remove('on'); els[i].setAttribute('aria-hidden', 'true');
    i = (i + 1) % els.length;
    els[i].classList.add('on'); els[i].removeAttribute('aria-hidden');
  }, 5000) : 0;
  $('#tbClose').addEventListener('click', () => { clearInterval(timer); LS.set(KEY, VER); bar.remove(); hide(); window.mdwLayoutSync && window.mdwLayoutSync(); $('#logoLink').focus(); });
})();

/* =========================================================
   PDPA CONSENT (U27)
   ========================================================= */
(() => {
  const el = $('#consent'), KEY = 'mdw_consent', prefs = $('#consentPrefs'), setBtn = $('#consentSettings');
  const saved = LS.json(KEY);
  const slider = $('#slider');
  let lift = 0;
  function sync(){
    const h = el.hidden ? 0 : el.offsetHeight;
    document.documentElement.style.setProperty('--consent-h', h + 'px');
    // ยกเนื้อหา/ปุ่มควบคุมสไลด์ขึ้นเท่าที่แบนเนอร์บังขอบล่างของสไลเดอร์ (ณ ตำแหน่งบนสุดของหน้า)
    // คำนวณเฉพาะตอนแผงตั้งค่าปิด เพื่อไม่ให้เนื้อหาสไลด์กระโดดตอนกด "ตั้งค่า"
    if (el.hidden || !slider) lift = 0;
    else if (prefs.hidden){
      const bottom = slider ? slider.getBoundingClientRect().bottom + window.scrollY : 0;
      lift = Math.round(clamp(bottom - (window.innerHeight - h) + 8, 0, 160));
    }
    if (slider) slider.style.setProperty('--lift', lift + 'px');
  }
  window.mdwLayoutSync = sync;
  addEventListener('resize', sync);
  const ro = window.ResizeObserver ? new ResizeObserver(sync) : null;
  function openBanner(withPrefs){
    const s = LS.json(KEY) || {};
    $('#ckAnalytics').checked = !!s.analytics; $('#ckMarketing').checked = !!s.marketing;
    el.hidden = false; prefs.hidden = !withPrefs; setBtn.setAttribute('aria-expanded', withPrefs ? 'true' : 'false');
    ro ? ro.observe(el) : sync(); sync();
  }
  function save(analytics, marketing){
    LS.set(KEY, JSON.stringify({ v: 1, necessary: true, analytics, marketing, at: new Date().toISOString() }));
    el.hidden = true; sync(); ro && ro.unobserve(el);
    document.dispatchEvent(new Event('mdw:consent')); // analytics.js โหลด/หยุดสคริปต์ตามที่เลือก
    toast('บันทึกการตั้งค่าคุกกี้แล้ว');
  }
  if (!saved || saved.v !== 1) openBanner(false);
  $('#consentAccept').onclick = () => save(true, true);
  setBtn.onclick = () => { const o = prefs.hidden; prefs.hidden = !o; setBtn.setAttribute('aria-expanded', o ? 'true' : 'false'); sync(); };
  $('#consentSave').onclick = () => save($('#ckAnalytics').checked, $('#ckMarketing').checked);
  $('#openConsent').onclick = () => { openBanner(true); $('#ckAnalytics').focus(); };
})();

/* ตะกร้าเปลี่ยนจากแท็บอื่น → อัปเดตตาม */
addEventListener('storage', e => {
  if (e.key === null || e.key === CART_KEY){ cart = loadCart(); renderCart(); }
});
/* ตรวจตะกร้ากับ server ตั้งแต่เปิดหน้า (ป้ายจำนวน/ยอดถูกต้องเสมอ) */
if (Object.keys(cartAtLoad || {}).length) setTimeout(() => validateCart(true), 400);
/* หน้าสินค้า → event view_item (ส่งจริงเมื่อยินยอมคุกกี้วิเคราะห์/การตลาดเท่านั้น) */
(() => {
  const m = /^\/product\/([^/?#]+)/.exec(location.pathname);
  if (!m) return;
  let slug = m[1]; try { slug = decodeURIComponent(slug); } catch (e) {}
  const p = byId(slug);
  if (p) window.mdwTrack('view_item', { value: p.price, items: [{ id: p.id, name: p.name, price: p.price, qty: 1 }] });
})();


/* ---------- Reveal on scroll (เรียกซ้ำได้หลังสร้าง element ใหม่) ---------- */
const mdwReveal = (() => {
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting){ x.target.classList.add('in'); io.unobserve(x.target); } }), {threshold:.12})
    : null;
  return () => $$('.reveal:not(.in)').forEach(el => io ? io.observe(el) : el.classList.add('in'));
})();
mdwReveal();

document.getElementById('yr').textContent = new Date().getFullYear();
// เปิดตะกร้าทันทีเมื่อมาจากลิงก์ #cart (เช่น ไอคอนตะกร้าในหน้า checkout)
if (location.hash === '#cart'){ history.replaceState(null, '', location.pathname + location.search); openCart($('#cartBtn')); }

/* แจ้งสคริปต์ของแต่ละหน้า (เช่น home.js) ว่าส่วนกลางพร้อมแล้ว */
window.mdwShellReady = true;
document.dispatchEvent(new Event('mdw:shell'));

