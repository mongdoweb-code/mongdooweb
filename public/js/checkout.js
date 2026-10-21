/* =========================================================
   checkout.js — หน้าชำระเงิน ย้ายมาจาก prototype/mongdoweb-checkout.html
   ค่าร้าน (บัญชี, PromptPay, ค่าส่ง, จังหวัด/รหัสไปรษณีย์) และราคาสินค้ามาจากฐานข้อมูลผ่าน <script id="mdw-checkout">
   ลำดับ: ตรวจตะกร้ากับ server (POST /api/cart/validate) → POST /api/orders → POST /api/orders/:orderNo/slip
   ยอดเงินทั้งหมดคำนวณใหม่ฝั่ง server เสมอ — ตัวเลขในหน้านี้ใช้แสดงผลเท่านั้น
   ========================================================= */
const BOOT = (() => { try { return JSON.parse(document.getElementById('mdw-checkout').textContent); } catch (e) { return {}; } })();
const SHOP = BOOT.shop || { banks: [], shipping: [{ id: 'std', name: 'ส่งธรรมดา', desc: '' }], tiers: [], expressExtra: 0 };
const CATALOG = Array.isArray(BOOT.catalog) ? BOOT.catalog : [];
const PROV = SHOP.provinces || {};
window.mdwTrack = window.mdwTrack || function(){ (window.mdwQ = window.mdwQ || []).push(arguments); };

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const byId = id => CATALOG.find(p => p.id === id);
const baht = n => '฿' + Number(n).toLocaleString('th-TH', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const digits = v => String(v || '').replace(/\D/g, '');
/* เลขบัญชี 10 หลัก → XXX-X-XXXXX-X ให้อ่านง่าย */
const fmtAcc = a => { const d = digits(a); return d.length === 10 ? `${d.slice(0,3)}-${d.slice(3,4)}-${d.slice(4,9)}-${d.slice(9)}` : a; };
const fmtPhone = v => { const d = digits(v); return d.length === 10 ? `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}` : d.length === 9 ? `${d.slice(0,2)}-${d.slice(2,5)}-${d.slice(5)}` : v; };
const fmtSize = b => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
const phClass = p => 'ph' + (p.acc ? ' acc' : p.color === 'rgb' ? ' rgb' : '');
let tt; const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2600); };
const store = {
  get(k){ try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return null; } },
  set(k,v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} },
  del(k){ try { localStorage.removeItem(k); } catch(e){} }
};
const session = {
  set(k,v){ try { sessionStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
};

/* ---------- cart ---------- */
let cart = store.get('mdw_cart');
if (!cart || typeof cart !== 'object' || Array.isArray(cart)) cart = {};
Object.keys(cart).forEach(id => { const q = Math.floor(Number(cart[id])); if (!(q > 0)) delete cart[id]; else cart[id] = Math.min(q, 999); });
const knownCart = () => Object.entries(cart).filter(([id]) => byId(id));
function renderHdrCart(){
  const n = Object.values(cart).reduce((a, b) => a + b, 0), c = $('#hdrCount');
  c.textContent = n > 99 ? '99+' : n; c.hidden = n === 0;
  $('#hdrCart').setAttribute('aria-label', n ? `ตะกร้าสินค้า ${n} ชิ้น` : 'ตะกร้าสินค้า ว่าง');
}
let shipId = 'std', step = 1, slipFile = null, slipOrig = null;
let orderNo = null;   // ได้จาก server หลังกรอกข้อมูลจัดส่ง
let srv = null;       // ยอดที่ server คำนวณ (สตางค์) — ใช้แสดงยอดชำระและสร้าง QR
let addrSent = null;  // ข้อมูลผู้รับที่ส่งให้ server ล่าสุด
let taxSent = null;   // ข้อมูลใบกำกับภาษีที่ส่งให้ server ล่าสุด

const subtotal = () => knownCart().reduce((s,[id,q]) => s + byId(id).price * q, 0);
/* ค่าส่งตามยอดสั่งซื้อ (ขั้นจากหน้าตั้งค่าร้าน) — server คำนวณซ้ำอีกครั้งตอนบันทึกคำสั่งซื้อ */
const tierFee = sub => SHOP.tiers.reduce((fee, t) => sub >= t.min ? t.fee : fee, SHOP.tiers[0] ? SHOP.tiers[0].fee : 0);
const freeFrom = () => { const t = SHOP.tiers.find(t => t.fee === 0 && t.min > 0); return t ? t.min : null; };
const shipCost = (id = shipId) => tierFee(subtotal()) + (id === 'express' ? SHOP.expressExtra : 0);
const total = () => srv && step >= 2 ? srv.totalSatang / 100 : subtotal() + shipCost();
const thumbHtml = p => p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy">` : `<div class="${phClass(p)}"></div>`;

/* ---------- render: summary ---------- */
function renderSummary(){
  $('#sumItems').innerHTML = knownCart().map(([id,q]) => { const p = byId(id); return `
    <div class="si"><div class="si-thumb">${thumbHtml(p)}<em>${q}</em></div>
    <div class="si-name">${esc(p.name)}</div><div class="si-price">${baht(p.price*q)}</div></div>`; }).join('');
  const sub = srv && step >= 2 ? srv.subtotalSatang / 100 : subtotal();
  const sc = srv && step >= 2 ? srv.shippingSatang / 100 : shipCost();
  $('#sSub').textContent = baht(sub);
  $('#sShip').innerHTML = sc === 0 ? '<span class="free">ส่งฟรี</span>' : baht(sc);
  $('#sTotal').textContent = baht(total());
  $('#totMini').textContent = baht(total());
  const nd = $('#nudge');
  const ff = freeFrom();
  if (ff && sub < ff){
    const left = ff - sub;
    nd.hidden = false;
    nd.innerHTML = `ซื้อเพิ่มอีก <b>${baht(left)}</b> รับส่งฟรี
      <div class="bar"><i style="width:${Math.min(100, sub/ff*100)}%"></i></div>`;
  } else nd.hidden = true;
}
function renderShipOpts(){
  $('#shipOpts').innerHTML = SHOP.shipping.map(s => {
    const fee = shipCost(s.id), free = fee === 0;
    return `<label class="radio"><input type="radio" name="ship" value="${esc(s.id)}" ${s.id === shipId ? 'checked' : ''}>
      <div><b>${esc(s.name)}</b><small>${esc(s.desc)}</small></div>
      <span class="p ${free ? 'free' : ''}">${free ? 'ฟรี' : baht(fee)}</span></label>`;
  }).join('') + (SHOP.tiers.length > 1 ? `<details class="ship-rates"><summary>ดูอัตราค่าส่งตามยอดสั่งซื้อ</summary><ul>${SHOP.tiers.map((t, i) => {
      const next = SHOP.tiers[i + 1];
      const range = next ? `${baht(t.min)} – ${baht(next.min - 0.01)}` : `ตั้งแต่ ${baht(t.min)}`;
      return `<li><span>${range}</span><b>${t.fee ? baht(t.fee) : 'ส่งฟรี'}</b></li>`;
    }).join('')}</ul></details>` : '');
}
$('#shipOpts').addEventListener('change', e => { if (e.target.name === 'ship'){ shipId = e.target.value; renderSummary(); } });

/* ---------- step navigation ---------- */
function go(n){
  if (n >= 2 && !orderNo) n = 1;   // ต้องบันทึกข้อมูลจัดส่งก่อน
  step = n;
  ['#step1','#step2','#step3'].forEach((s,i) => $(s).hidden = i + 1 !== n);
  [...$('#stepper').children].forEach((li,i) => { li.className = i + 1 < n ? 'st-done' : i + 1 === n ? 'st-now' : ''; li.toggleAttribute('aria-current', i + 1 === n); });
  if (n >= 2) renderPayment();
  renderSummary();
  if (n === 3 && !$('#paidAmt').value) $('#paidAmt').value = total().toFixed(2);
  scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
document.addEventListener('click', e => {
  const g = e.target.closest('[data-goto]');
  if (g){ e.preventDefault(); go(Number(g.dataset.goto)); }
});

/* ---------- STEP 1: validation (กฎเดียวกับ server) ---------- */
function isTaxId(v){
  const d = digits(v);
  if (d.length !== 13) return false;
  let s = 0; for (let i = 0; i < 12; i++) s += Number(d[i]) * (13 - i);
  return (11 - (s % 11)) % 10 === Number(d[12]);
}
const isPhone = d => /^0[689]\d{8}$/.test(d) || /^0[2-57]\d{7}$/.test(d);
const val = id => document.getElementById(id).value.trim();
const wantTax = () => $('#wantTax').checked;
const tiKind = () => ($('input[name=tiKind]:checked') || {}).value || 'COMPANY';
/* คืนข้อความผิดภาษาไทย หรือ '' เมื่อถูกต้อง */
const RULES = {
  name:  v => v.length >= 2 ? '' : 'กรุณากรอกชื่อ-นามสกุลผู้รับ',
  phone: v => isPhone(digits(v)) ? '' : !digits(v) ? 'กรุณากรอกเบอร์โทรศัพท์' : 'เบอร์โทรไม่ถูกต้อง — มือถือ 10 หลัก (เช่น 081-234-5678) หรือเบอร์บ้าน 9 หลัก (เช่น 02-123-4567)',
  email: v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'รูปแบบอีเมลไม่ถูกต้อง เช่น name@example.com',
  addr:  v => v.length >= 3 ? '' : 'กรุณากรอกบ้านเลขที่ และถนน/ซอย',
  sub:   v => v.length >= 2 ? '' : 'กรุณากรอกแขวง/ตำบล',
  dist:  v => v.length >= 2 ? '' : 'กรุณากรอกเขต/อำเภอ',
  prov:  v => PROV[v] ? '' : 'กรุณาเลือกจังหวัดจากรายการ',
  zip:   v => {
    if (!/^\d{5}$/.test(v)) return 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก';
    const p = val('prov');
    return PROV[p] && !PROV[p].includes(v.slice(0, 2)) ? `รหัสไปรษณีย์ไม่ตรงกับจังหวัด${p} (ต้องขึ้นต้นด้วย ${PROV[p].join(' หรือ ')})` : '';
  },
};
const TAX_RULES = {
  tiName:   v => v.length >= 2 ? '' : (tiKind() === 'PERSON' ? 'กรุณากรอกชื่อ-นามสกุลสำหรับออกใบกำกับภาษี' : 'กรุณากรอกชื่อบริษัท/นิติบุคคล'),
  tiTaxId:  v => isTaxId(v) ? '' : digits(v).length !== 13 ? 'เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก' : 'เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง กรุณาตรวจอีกครั้ง',
  tiBranch: v => tiKind() === 'PERSON' || v.length >= 3 || /^\d{1,5}$/.test(v) ? '' : 'กรุณาระบุสาขา เช่น สำนักงานใหญ่ หรือรหัสสาขา 5 หลัก',
  tiAddr:   v => $('#tiSame').checked || v.length >= 10 ? '' : 'กรุณากรอกที่อยู่สำหรับออกใบกำกับภาษี',
};
function setErr(id, msg){
  const el = document.getElementById(id); if (!el) return;
  const f = el.closest('.field');
  f.classList.toggle('err', !!msg);
  el.setAttribute('aria-invalid', msg ? 'true' : 'false');
  if (msg) f.querySelector('.msg').textContent = msg;
}
function check(id){
  const rule = RULES[id] || TAX_RULES[id];
  const msg = rule(val(id));
  setErr(id, msg);
  return !msg;
}
[...Object.keys(RULES), ...Object.keys(TAX_RULES)].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('blur', () => { if (el.value.trim() || el.closest('.field').classList.contains('err')) check(id); });
});
$('#prov').addEventListener('change', () => { check('prov'); if (val('zip')) check('zip'); });
$('#zip').addEventListener('input', e => {
  e.target.value = digits(e.target.value).slice(0, 5);
  // เดาจังหวัดจากรหัสไปรษณีย์ เมื่อยังไม่ได้เลือก (เฉพาะกรณีที่ตรงจังหวัดเดียว)
  if (e.target.value.length >= 2 && !val('prov')){
    const hit = Object.keys(PROV).filter(p => PROV[p].includes(e.target.value.slice(0, 2)));
    if (hit.length === 1) $('#prov').value = hit[0];
  }
});
$('#tiTaxId').addEventListener('input', e => { e.target.value = e.target.value.replace(/[^\d\s-]/g, ''); });

/* ---------- ใบกำกับภาษี ---------- */
function syncTax(){
  const on = wantTax();
  $('#taxBox').hidden = !on;
  const person = tiKind() === 'PERSON';
  $('#tiNameLbl').textContent = person ? 'ชื่อ-นามสกุล' : 'ชื่อบริษัท / นิติบุคคล';
  $('.ti-branch').hidden = person;
  $('#tiAddrWrap').hidden = $('#tiSame').checked;
}
$('#wantTax').addEventListener('change', () => { syncTax(); if (wantTax()) $('#tiName').focus(); });
$$('input[name=tiKind]').forEach(r => r.addEventListener('change', syncTax));
$('#tiSame').addEventListener('change', () => { syncTax(); if (!$('#tiSame').checked) $('#tiAddr').focus(); });
const shipAddrText = a => [a.addr, a.sub, a.dist, a.prov, a.zip].filter(Boolean).join(' ');

/* ---------- จำที่อยู่ (PDPA: ค่าเริ่มต้นไม่จำ, ลบได้) ---------- */
const SAVE_KEY = 'mdw_ship', SAVE_FIELDS = ['name','phone','email','addr','sub','dist','prov','zip'];
function loadSaved(){
  const s = store.get(SAVE_KEY);
  // รูปแบบเดิม (บันทึกอัตโนมัติโดยไม่ได้ขอความยินยอม) → ลบทิ้ง
  if (!s || typeof s !== 'object' || s.v !== 2){ if (s) store.del(SAVE_KEY); return; }
  SAVE_FIELDS.forEach(k => { const el = document.getElementById(k); if (el && typeof s[k] === 'string') el.value = s[k].slice(0, 300); });
  if (s.prov && !PROV[s.prov]) $('#prov').value = '';
  $('#remember').checked = true;
  $('#savedAddr').hidden = false;
}
$('#forgetAddr').addEventListener('click', () => {
  store.del(SAVE_KEY);
  $('#remember').checked = false; $('#savedAddr').hidden = true;
  toast('ลบที่อยู่ที่จำไว้ในเครื่องนี้แล้ว');
});

$('#step1').addEventListener('submit', async e => {
  e.preventDefault();
  const ids = [...Object.keys(RULES), ...(wantTax() ? Object.keys(TAX_RULES) : [])];
  const bad = ids.filter(id => !check(id));
  if (bad.length){ document.getElementById(bad[0]).focus(); toast('กรุณาตรวจข้อมูลที่มีเครื่องหมายสีแดง'); return; }
  const addr = { name:val('name'), phone:val('phone'), email:val('email'), addr:val('addr'), sub:val('sub'), dist:val('dist'), prov:val('prov'), zip:val('zip'), note:val('note') };
  const taxInvoice = wantTax() ? { kind: tiKind(), name: val('tiName'), taxId: digits(val('tiTaxId')), branch: tiKind() === 'PERSON' ? '' : val('tiBranch'),
    address: $('#tiSame').checked ? shipAddrText(addr) : val('tiAddr') } : null;
  if ($('#remember').checked){ const s = { v: 2 }; SAVE_FIELDS.forEach(k => s[k] = addr[k]); store.set(SAVE_KEY, s); $('#savedAddr').hidden = false; }
  else store.del(SAVE_KEY);
  // บันทึกคำสั่งซื้อที่ server (ย้อนกลับมาแก้ = แก้คำสั่งซื้อเดิม ไม่สร้างใหม่)
  const btn = e.target.querySelector('[type=submit]'), label = btn.textContent;
  btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
  try {
    const res = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: Object.fromEntries(knownCart()), shipping: shipId, address: addr, taxInvoice, orderNo }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok){
      const msgs = data.messages || {};
      (data.fields || []).forEach(id => setErr(id, msgs[id] || 'กรุณาตรวจข้อมูลช่องนี้'));
      const first = (data.fields || [])[0]; if (first && document.getElementById(first)) document.getElementById(first).focus();
      toast(data.error || 'บันทึกคำสั่งซื้อไม่สำเร็จ กรุณาลองใหม่');
      if (res.status === 409) validateCart(); // ราคา/สต็อกเปลี่ยนระหว่างกรอก → ดึงข้อมูลล่าสุด
      return;
    }
    orderNo = data.orderNo; srv = data; addrSent = addr; taxSent = taxInvoice;
    session.set('mdw_last_order', { no: orderNo, phone: digits(addr.phone) }); // ให้หน้าติดตามกรอกให้อัตโนมัติ (ในแท็บนี้เท่านั้น)
    if (Math.abs(srv.totalSatang / 100 - (subtotal() + shipCost())) > 0.001) toast('ราคาสินค้ามีการเปลี่ยนแปลง ยอดชำระอัปเดตตามราคาล่าสุดแล้ว');
  } catch (err){
    toast('เชื่อมต่อไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่'); return;
  } finally { btn.disabled = false; btn.textContent = label; }
  $('#shipTo').classList.add('on');
  $('#shipTo').innerHTML = `<span>จัดส่งถึง</span><b>${esc(addr.name)}</b> · ${esc(fmtPhone(addr.phone))}<br>${esc(shipAddrText(addr))}`
    + (taxInvoice ? `<span style="margin-top:8px">ใบกำกับภาษี</span>${esc(taxInvoice.name)} · ${esc(taxInvoice.taxId)}` : '');
  go(2);
});

/* ---------- STEP 2: payment ---------- */
const bankCards = () => SHOP.banks.length ? SHOP.banks.map(b => `<div class="bank-card">
    <div class="bank-row"><span>ธนาคาร</span><b>${esc(b.bankName)}</b></div>
    <div class="bank-row"><span>เลขที่บัญชี</span><div><b>${esc(fmtAcc(b.account))}</b><button type="button" class="copy" data-copy="${esc(digits(b.account) || b.account)}" aria-label="คัดลอกเลขบัญชี ${esc(b.bankName)}">คัดลอก</button></div></div>
    ${b.holder ? `<div class="bank-row"><span>ชื่อบัญชี</span><b>${esc(b.holder)}</b></div>` : ''}</div>`).join('')
  : '<p class="note">ร้านยังไม่ได้ตั้งค่าบัญชีรับโอน กรุณาติดต่อร้านทาง LINE</p>';
function renderPayment(){
  $('#payAmount').textContent = baht(total());
  $('#orderNo').textContent = orderNo;
  $('#qrName').textContent = SHOP.promptpayName || '';
  const qb = $('#qrBox');
  if (SHOP.promptpay){
    qb.className = 'qr'; qb.innerHTML = '';
    loadQRLib().then(() => new QRCode(qb, { text: promptPayPayload(SHOP.promptpay, total()), width:196, height:196, correctLevel: QRCode.CorrectLevel.M }))
      .catch(() => { qb.className = 'qr qr-ph'; qb.textContent = 'โหลด QR ไม่สำเร็จ กรุณาใช้การโอนเข้าบัญชี'; });
  } else {
    qb.className = 'qr qr-ph';
    qb.innerHTML = '<div>ร้านยังไม่ได้ตั้งค่า QR PromptPay<br>กรุณาใช้การโอนเข้าบัญชี</div>';
  }
  // บัญชีรับโอนหลายบัญชี — เลือกโอนเข้าบัญชีใดก็ได้
  $('#bankBox').innerHTML = bankCards();
  // ยังไม่มี PromptPay → ซ่อนแท็บ QR และเปิดแท็บโอนเข้าบัญชี
  const qrTab = $('[data-tab="qr"]');
  if (!SHOP.promptpay && qrTab){ qrTab.hidden = true; $('[data-tab="bank"]').click(); }
}
$$('[data-tab]').forEach(t => t.onclick = () => {
  $$('[data-tab]').forEach(x => { x.classList.toggle('on', x === t); x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
  $$('.pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + t.dataset.tab));
});
document.addEventListener('click', e => {
  const c = e.target.closest('[data-copy],[data-copy-amount],[data-copy-order]');
  if (!c) return;
  const text = c.hasAttribute('data-copy-amount') ? total().toFixed(2) : c.hasAttribute('data-copy-order') ? orderNo : c.dataset.copy;
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('คัดลอกแล้ว: ' + text), () => toast(text));
});
$('#payLater').addEventListener('click', () => showDone('later'));

/* PromptPay QR (มาตรฐาน EMVCo ของ ธปท.) — สร้าง payload พร้อมยอดเงิน */
function promptPayPayload(id, amount){
  const f = (tag, v) => tag + String(v.length).padStart(2,'0') + v;
  const t = String(id).replace(/\D/g,'');
  const acc = t.length >= 13 ? f('02', t) : f('01', ('0000000000000' + t.replace(/^0/, '66')).slice(-13));
  let p = f('00','01') + f('01', amount ? '12' : '11') + f('29', f('00','A000000677010111') + acc)
        + f('53','764') + (amount ? f('54', amount.toFixed(2)) : '') + f('58','TH') + '6304';
  return p + crc16(p);
}
function crc16(s){
  let crc = 0xFFFF;
  for (let i = 0; i < s.length; i++){
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
    crc &= 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4,'0');
}
let qrLib;
function loadQRLib(){
  return qrLib ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = '/js/vendor/qrcode.min.js'; // qrcodejs 1.0.0 (MIT)
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}

/* ---------- STEP 3: slip upload (ย่อรูปในเบราว์เซอร์ก่อนส่ง) ---------- */
const TARGET = 1.5 * 1024 * 1024, SERVER_MAX = 5 * 1024 * 1024, RAW_MAX = 30 * 1024 * 1024, TYPES = ['image/jpeg','image/png','image/webp'];
/* รูปจากมือถือ 8–12 MB → JPEG ด้านยาวไม่เกิน 2000px และไม่เกิน 1.5 MB (ลดคุณภาพ/ขนาดทีละขั้นจนพอดี) */
async function compressImage(file){
  if (file.size <= TARGET) return file;
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) {
    src = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = URL.createObjectURL(file); });
  }
  const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
  let scale = Math.min(1, 2000 / Math.max(w0, h0)), best = null;
  for (let round = 0; round < 6; round++){
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w0 * scale)); c.height = Math.max(1, Math.round(h0 * scale));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); // PNG โปร่งใส → พื้นขาว
    ctx.drawImage(src, 0, 0, c.width, c.height);
    for (const q of [0.85, 0.75, 0.65, 0.55]){
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
      if (!blob) continue;
      best = blob;
      if (blob.size <= TARGET) return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
    }
    scale *= 0.75;
  }
  return best ? new File([best], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
}
function fileError(msg){ const m = $('#fileMsg'); m.textContent = msg; m.classList.add('on'); $('#drop').classList.add('err'); }
async function setSlip(file){
  const msg = $('#fileMsg');
  msg.classList.remove('on'); msg.textContent = ''; $('#drop').classList.remove('err');
  if (!file) return;
  if (!TYPES.includes(file.type)) return fileError('รองรับเฉพาะไฟล์ภาพ JPG, PNG หรือ WEBP');
  if (file.size > RAW_MAX) return fileError('ไฟล์ใหญ่เกิน 30 MB กรุณาแคปหน้าจอสลิปแล้วแนบใหม่');
  $('#drop').classList.add('busy'); $('#drop').querySelector('b').textContent = 'กำลังย่อรูป…';
  let out;
  try { out = await compressImage(file); } catch (e) { out = file; }
  $('#drop').classList.remove('busy'); $('#drop').querySelector('b').textContent = 'คลิกเพื่อเลือกไฟล์ หรือลากภาพสลิปมาวาง';
  if (out.size > SERVER_MAX) return fileError('ย่อรูปไม่สำเร็จ ไฟล์ยังใหญ่เกิน 5 MB กรุณาแคปหน้าจอสลิปแล้วแนบใหม่');
  slipFile = out; slipOrig = file;
  $('#previewImg').src = URL.createObjectURL(out);
  $('#previewName').textContent = file.name;
  $('#previewSize').textContent = out === file ? fmtSize(file.size) : `ย่อจาก ${fmtSize(file.size)} เหลือ ${fmtSize(out.size)}`;
  $('#preview').classList.add('on'); $('#drop').hidden = true;
}
$('#slip').addEventListener('change', e => setSlip(e.target.files[0]));
const drop = $('#drop');
['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
drop.addEventListener('drop', e => setSlip(e.dataTransfer.files[0]));
$('#slipRemove').onclick = () => { slipFile = null; $('#slip').value = ''; $('#preview').classList.remove('on'); $('#drop').hidden = false; $('#slip').focus(); };

/* ส่งด้วย XHR เพื่อแสดงแถบความคืบหน้าการอัปโหลด */
function uploadWithProgress(url, fd, onProgress){
  return new Promise(resolve => {
    const x = new XMLHttpRequest();
    x.open('POST', url);
    x.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => { let data = {}; try { data = JSON.parse(x.responseText); } catch (e) {} resolve({ ok: x.status >= 200 && x.status < 300, status: x.status, data }); };
    x.onerror = x.onabort = () => resolve({ ok: false, status: 0, data: {} });
    x.send(fd);
  });
}
function setProgress(p){
  const pct = Math.round(p * 100);
  $('#upPct').textContent = pct + '%';
  $('#upBar').setAttribute('aria-valuenow', pct);
  $('#upBar i').style.width = pct + '%';
}

$('#step3').addEventListener('submit', async e => {
  e.preventDefault();
  let ok = true;
  if (!slipFile){ fileError('กรุณาแนบสลิปการโอน'); ok = false; }
  [['paidAt', v => !!v, 'กรุณาระบุวันที่โอน'], ['paidTime', v => !!v, 'กรุณาระบุเวลาที่โอน'], ['paidAmt', v => Number(v.replace(/[,\s฿]/g, '')) > 0, 'กรุณากรอกยอดที่โอน']].forEach(([id, fn, m]) => {
    const good = fn(document.getElementById(id).value); setErr(id, good ? '' : m); if (!good) ok = false;
  });
  if (!ok){ toast('กรุณาแนบสลิปและกรอกรายละเอียดให้ครบ'); return; }

  const btn = $('#submitBtn'); btn.disabled = true; btn.textContent = 'กำลังส่งคำสั่งซื้อ...';
  $('#upProg').hidden = false; setProgress(0); $('#upLabel').textContent = 'กำลังส่งสลิป…';
  const fd = new FormData();
  fd.append('phone', addrSent ? addrSent.phone : val('phone'));
  fd.append('slip', slipFile);
  fd.append('paidAt', `${$('#paidAt').value}T${$('#paidTime').value}`);
  fd.append('amount', $('#paidAmt').value);
  const res = await uploadWithProgress(`/api/orders/${encodeURIComponent(orderNo)}/slip`, fd, setProgress);
  const data = res.data || {};
  if (!res.ok){
    $('#upProg').hidden = true;
    btn.disabled = false; btn.textContent = 'ยืนยันคำสั่งซื้อ';
    const msg = data.error || 'ส่งสลิปไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่';
    if ((data.fields || []).includes('slip')) fileError(msg);
    (data.fields || []).filter(f => f !== 'slip').forEach(id => setErr(id, msg));
    toast(msg);
    return;
  }
  setProgress(1); $('#upLabel').textContent = 'ส่งสลิปเรียบร้อย';
  showDone('paid');
});

/* ---------- หน้าสั่งซื้อสำเร็จ ---------- */
let doneInfo = null;
function showDone(mode){
  const items = knownCart().map(([id, q]) => { const p = byId(id); return { id, name: p.name, price: p.price, qty: q }; });
  doneInfo = { mode, orderNo, items, sub: srv.subtotalSatang / 100, ship: srv.shippingSatang / 100, total: srv.totalSatang / 100,
    shipName: srv.shippingName, addr: addrSent, tax: taxSent, at: new Date() };
  window.mdwTrack('purchase', { transaction_id: orderNo, value: doneInfo.total, items });
  store.del('mdw_cart'); store.del('mdw_cart_seen'); cart = {}; renderHdrCart();
  const paid = mode === 'paid';
  $('#checkoutView').hidden = true; $('#doneView').hidden = false;
  $('#doneTitle').textContent = paid ? 'ได้รับคำสั่งซื้อและสลิปแล้ว ขอบคุณครับ' : 'บันทึกคำสั่งซื้อแล้ว — รอการชำระเงิน';
  $('#doneCard').classList.toggle('pending', !paid);
  $('#doneNo').textContent = orderNo;
  $('#doneAmt').textContent = baht(doneInfo.total);
  $('#doneStatus').textContent = paid ? 'สถานะ: รอตรวจสอบสลิป' : 'สถานะ: รอโอนเงินและแนบสลิป';
  $('#doneItems').innerHTML = items.map(i => `<div class="si"><div class="si-name">${esc(i.name)} <span class="q">× ${i.qty}</span></div><div class="si-price">${baht(i.price * i.qty)}</div></div>`).join('');
  $('#doneRows').innerHTML = `<div><span>ค่าสินค้า</span><b>${baht(doneInfo.sub)}</b></div>
    <div><span>ค่าจัดส่ง (${esc(doneInfo.shipName)})</span><b>${doneInfo.ship ? baht(doneInfo.ship) : 'ส่งฟรี'}</b></div>
    <div class="grand"><span>ยอดชำระทั้งหมด</span><b>${baht(doneInfo.total)}</b></div>`;
  const a = doneInfo.addr;
  $('#doneAddr').innerHTML = `<span>จัดส่งถึง</span><b>${esc(a.name)}</b> · ${esc(fmtPhone(a.phone))}<br>${esc(shipAddrText(a))}`
    + (doneInfo.tax ? `<span>ขอใบกำกับภาษีในนาม</span><b>${esc(doneInfo.tax.name)}</b> · เลขผู้เสียภาษี ${esc(doneInfo.tax.taxId)}${doneInfo.tax.branch ? ' · ' + esc(doneInfo.tax.branch) : ''}` : '');
  $('#donePayNote').textContent = paid ? 'ร้านได้รับสลิปแล้ว ข้อมูลบัญชีด้านล่างไว้สำหรับอ้างอิง' : `โอนยอด ${baht(doneInfo.total)} เข้าบัญชีใดก็ได้ด้านล่าง แล้วแนบสลิปที่หน้าติดตามคำสั่งซื้อ`;
  $('#doneBanks').innerHTML = bankCards() + (SHOP.promptpay ? `<div class="bank-card"><div class="bank-row"><span>พร้อมเพย์</span><div><b>${esc(SHOP.promptpay)}</b><button type="button" class="copy" data-copy="${esc(digits(SHOP.promptpay))}">คัดลอก</button></div></div></div>` : '');
  const when = doneInfo.at.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  $('#doneTimeline').innerHTML = (paid ? [
      ['ok', 'ได้รับคำสั่งซื้อและสลิป', when],
      ['wait', 'ทีมงานตรวจสอบยอดโอน', SHOP.checkWithin || ''],
      ['', 'แพ็กและจัดส่งสินค้า', 'ดูเลขพัสดุได้ที่หน้าติดตามคำสั่งซื้อ'],
      ['', 'รับสินค้า', 'ภายใน 2–3 วันหลังจัดส่ง'],
    ] : [
      ['ok', 'บันทึกคำสั่งซื้อ', when],
      ['wait', 'โอนเงินและแนบสลิป', 'แนบได้ที่หน้าติดตามคำสั่งซื้อ ด้วยเลขที่คำสั่งซื้อและเบอร์โทร'],
      ['', 'ทีมงานตรวจสอบยอดโอน', SHOP.checkWithin || ''],
      ['', 'แพ็กและจัดส่งสินค้า', 'ภายใน 2–3 วันหลังตรวจสลิป'],
    ]).map(([c, t, s]) => `<li class="${c}">${esc(t)}<small>${esc(s)}</small></li>`).join('');
  const trackUrl = '/track?no=' + encodeURIComponent(orderNo);
  $('#doneTrack').href = trackUrl;
  $('#doneUpload').hidden = paid;
  if (SHOP.line) $('#doneLine').href = SHOP.line; else $('#doneLine').hidden = true;
  scrollTo({ top: 0 });
  $('#doneTitle').focus({ preventScroll: true });
}
$('#doneUpload').addEventListener('click', () => { location.href = '/track?no=' + encodeURIComponent(orderNo); });
$('#donePrint').addEventListener('click', () => window.print());

/* บันทึกสรุปคำสั่งซื้อเป็นรูป PNG (วาดเองบน canvas — ไม่ต้องใช้ไลบรารีภายนอก) */
$('#doneImage').addEventListener('click', async () => {
  if (!doneInfo) return;
  const d = doneInfo, W = 900, P = 48;
  const font = getComputedStyle(document.body).fontFamily;
  try { await document.fonts.ready; } catch (e) {}
  const c = document.createElement('canvas'), ctx = c.getContext('2d');
  const lines = [];   // [ขนาด, น้ำหนัก, ข้อความซ้าย, ข้อความขวา, สี, ระยะบรรทัด]
  const L = (size, weight, left, right = '', color = '#1C1C1C', gap = 1.6) => lines.push([size, weight, left, right, color, gap]);
  const rule = () => lines.push(['rule']);
  L(30, 800, 'มองดูเว็บ', '', '#F26B38', 1.4);
  L(16, 500, d.mode === 'paid' ? 'สรุปคำสั่งซื้อ · รอตรวจสอบสลิป' : 'สรุปคำสั่งซื้อ · รอโอนเงินและแนบสลิป', '', '#6B6862', 2.2);
  L(18, 600, 'เลขที่คำสั่งซื้อ', d.orderNo); L(18, 600, 'วันที่สั่งซื้อ', d.at.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }), '#1C1C1C', 2);
  rule();
  d.items.forEach(i => L(17, 400, `${i.name.length > 46 ? i.name.slice(0, 45) + '…' : i.name} × ${i.qty}`, baht(i.price * i.qty)));
  rule();
  L(17, 400, 'ค่าสินค้า', baht(d.sub)); L(17, 400, `ค่าจัดส่ง (${d.shipName})`, d.ship ? baht(d.ship) : 'ส่งฟรี');
  L(24, 800, 'ยอดชำระ', baht(d.total), '#1C1C1C', 2);
  rule();
  L(15, 600, 'จัดส่งถึง', '', '#6B6862'); L(17, 500, `${d.addr.name} · ${fmtPhone(d.addr.phone)}`);
  L(16, 400, shipAddrText(d.addr).slice(0, 80), '', '#1C1C1C', 2);
  if (SHOP.banks.length){ rule(); L(15, 600, 'บัญชีรับโอน', '', '#6B6862'); SHOP.banks.forEach(b => L(17, 500, b.bankName + (b.holder ? ' · ' + b.holder : ''), fmtAcc(b.account))); }
  rule();
  L(15, 400, 'ติดตามสถานะ: ' + location.origin + '/track', '', '#6B6862');
  let H = P;
  lines.forEach(l => { H += l[0] === 'rule' ? 24 : l[0] * l[5]; });
  H += P;
  const dpr = 2; c.width = W * dpr; c.height = H * dpr; ctx.scale(dpr, dpr);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#F26B38'; ctx.fillRect(0, 0, W, 8);
  let y = P;
  lines.forEach(l => {
    if (l[0] === 'rule'){ ctx.fillStyle = '#E3E0D8'; ctx.fillRect(P, y + 10, W - P * 2, 1); y += 24; return; }
    const [size, weight, left, right, color, gap] = l;
    y += size * gap;
    ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left'; ctx.fillText(left, P, y - size * (gap - 1) / 2);
    if (right){ ctx.textAlign = 'right'; ctx.fillText(right, W - P, y - size * (gap - 1) / 2); }
  });
  c.toBlob(blob => {
    if (!blob){ toast('บันทึกรูปไม่สำเร็จ กรุณาใช้ปุ่มพิมพ์แทน'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${d.orderNo}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('บันทึกรูปสรุปคำสั่งซื้อแล้ว');
  }, 'image/png');
});

// ลบสถานะ error ทันทีที่ผู้ใช้แก้ช่องนั้น
document.addEventListener('input', e => { const f = e.target.closest('.field.err'); if (f){ f.classList.remove('err'); e.target.setAttribute('aria-invalid', 'false'); } });

/* ---------- U16: ตรวจตะกร้ากับ server ก่อนเริ่มกรอกข้อมูล ---------- */
function validateCart(){
  const seen = store.get('mdw_cart_seen') || {};
  return fetch('/api/cart/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: cart, seen }) })
    .then(r => r.ok ? r.json() : null)
    .then(res => {
      if (!res || !Array.isArray(res.lines)) return;
      const next = {}, notes = [];
      res.lines.forEach(l => {
        let p = byId(l.id);
        if (l.qty > 0){
          if (!p){ p = { id: l.id, name: l.name, price: l.price, color: l.color }; CATALOG.push(p); }
          p.name = l.name; p.price = l.price; if (l.img) p.img = l.img; if (l.acc) p.acc = true;
          next[l.id] = l.qty; seen[l.id] = l.price;
        } else delete seen[l.id];
        const nm = l.name || 'สินค้า';
        if (l.status === 'gone') notes.push(l.name ? `นำ "${l.name}" ออกจากตะกร้า เพราะปิดการขายแล้ว` : 'นำสินค้าที่ปิดการขายแล้วออกจากตะกร้า');
        else if (l.status === 'out') notes.push(`นำ "${nm}" ออกจากตะกร้า เพราะสินค้าหมด`);
        else if (l.status === 'ask') notes.push(`นำ "${nm}" ออกจากตะกร้า — สินค้านี้ต้องสอบถามราคาทาง LINE`);
        else if (l.status === 'qty') notes.push(`"${nm}" เหลือ ${l.qty} ชิ้น ปรับจำนวนให้แล้ว`);
        else if (l.status === 'price') notes.push(`"${nm}" ราคาเปลี่ยนจาก ${baht(l.oldPrice)} เป็น ${baht(l.price)}`);
      });
      cart = next;
      store.set('mdw_cart', cart); store.set('mdw_cart_seen', seen);
      const n = $('#coNotice');
      n.hidden = !notes.length;
      n.innerHTML = notes.length ? `<b>ตะกร้าอัปเดตตามข้อมูลล่าสุดของร้าน</b><ul>${notes.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : '';
      if (step === 1 || !orderNo){ start(true); }
    })
    .catch(() => {});
}

/* ---------- init ---------- */
const today = new Date();
const ymd = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
$('#paidAt').value = ymd;
$('#paidAt').max = ymd;
loadSaved();
syncTax();

let begun = false, started = false;
function start(afterValidate){
  renderHdrCart();
  const has = knownCart().length > 0;
  $('#emptyView').hidden = has; $('#checkoutView').hidden = !has;
  if (!has) return;
  if (!afterValidate && matchMedia('(max-width:900px)').matches) $('#sumDetails').open = false;
  renderShipOpts(); renderSummary();
  if (!started){ started = true; go(1); }
  if (afterValidate && !begun){
    begun = true;
    window.mdwTrack('begin_checkout', { value: subtotal(), items: knownCart().map(([id, q]) => { const p = byId(id); return { id, name: p.name, price: p.price, qty: q }; }) });
  }
}
// บนเดสก์ท็อปให้สรุปคำสั่งซื้อเปิดค้างไว้ตลอด (พับได้เฉพาะมือถือ)
$('#sumDetails summary').addEventListener('click', e => { if (!matchMedia('(max-width:900px)').matches) e.preventDefault(); });
start(false);
if (Object.keys(cart).length) validateCart();
