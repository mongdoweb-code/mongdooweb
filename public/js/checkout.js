/* =========================================================
   checkout.js — หน้าชำระเงิน ย้ายมาจาก prototype/mongdoweb-checkout.html
   ค่าร้าน (บัญชี, PromptPay, ค่าส่ง) และราคาสินค้ามาจากฐานข้อมูลผ่าน <script id="mdw-checkout">
   คำสั่งซื้อและสลิปส่งไปที่ server: POST /api/orders → POST /api/orders/:orderNo/slip
   ยอดเงินทั้งหมดคำนวณใหม่ฝั่ง server เสมอ — ตัวเลขในหน้านี้ใช้แสดงผลเท่านั้น
   ========================================================= */
const BOOT = (() => { try { return JSON.parse(document.getElementById('mdw-checkout').textContent); } catch (e) { return {}; } })();
const SHOP = BOOT.shop;
const CATALOG = Array.isArray(BOOT.catalog) ? BOOT.catalog : [];
const PROVINCES = ['กรุงเทพมหานคร','กระบี่','กาญจนบุรี','กาฬสินธุ์','กำแพงเพชร','ขอนแก่น','จันทบุรี','ฉะเชิงเทรา','ชลบุรี','ชัยนาท','ชัยภูมิ','ชุมพร','เชียงราย','เชียงใหม่','ตรัง','ตราด','ตาก','นครนายก','นครปฐม','นครพนม','นครราชสีมา','นครศรีธรรมราช','นครสวรรค์','นนทบุรี','นราธิวาส','น่าน','บึงกาฬ','บุรีรัมย์','ปทุมธานี','ประจวบคีรีขันธ์','ปราจีนบุรี','ปัตตานี','พระนครศรีอยุธยา','พะเยา','พังงา','พัทลุง','พิจิตร','พิษณุโลก','เพชรบุรี','เพชรบูรณ์','แพร่','ภูเก็ต','มหาสารคาม','มุกดาหาร','แม่ฮ่องสอน','ยโสธร','ยะลา','ร้อยเอ็ด','ระนอง','ระยอง','ราชบุรี','ลพบุรี','ลำปาง','ลำพูน','เลย','ศรีสะเกษ','สกลนคร','สงขลา','สตูล','สมุทรปราการ','สมุทรสงคราม','สมุทรสาคร','สระแก้ว','สระบุรี','สิงห์บุรี','สุโขทัย','สุพรรณบุรี','สุราษฎร์ธานี','สุรินทร์','หนองคาย','หนองบัวลำภู','อ่างทอง','อำนาจเจริญ','อุดรธานี','อุตรดิตถ์','อุทัยธานี','อุบลราชธานี'];

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const byId = id => CATALOG.find(p => p.id === id);
const baht = n => '฿' + n.toLocaleString('th-TH', {minimumFractionDigits: n % 1 ? 2 : 0});
const phClass = p => 'ph' + (p.acc ? ' acc' : p.color === 'rgb' ? ' rgb' : '');
let tt; const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2200); };
const store = {
  get(k){ try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return null; } },
  set(k,v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} },
  del(k){ try { localStorage.removeItem(k); } catch(e){} }
};


let cart = store.get('mdw_cart');
if (!cart || typeof cart !== 'object' || Array.isArray(cart)) cart = {};
Object.keys(cart).forEach(id => { const q = Math.floor(Number(cart[id])); if (!byId(id) || !(q > 0)) delete cart[id]; else cart[id] = Math.min(q, 999); });
/* ป้ายจำนวนบนไอคอนตะกร้าในหัวเว็บ */
function renderHdrCart(){
  const n = Object.values(cart).reduce((a, b) => a + b, 0), c = $('#hdrCount');
  c.textContent = n > 99 ? '99+' : n; c.hidden = n === 0;
  $('#hdrCart').setAttribute('aria-label', n ? `ตะกร้าสินค้า ${n} ชิ้น` : 'ตะกร้าสินค้า ว่าง');
}
let shipId = 'std', step = 1, slipFile = null;
let orderNo = null;   // ได้จาก server หลังกรอกข้อมูลจัดส่ง
let srv = null;       // ยอดที่ server คำนวณ (สตางค์) — ใช้แสดงยอดชำระและสร้าง QR

const subtotal = () => Object.entries(cart).reduce((s,[id,q]) => s + byId(id).price * q, 0);
const shipCost = () => {
  const o = SHOP.shipping.find(s => s.id === shipId);
  if (shipId === 'std' && SHOP.freeShipMin && subtotal() >= SHOP.freeShipMin) return 0;
  return o.price;
};
const total = () => srv && step >= 2 ? srv.totalSatang / 100 : subtotal() + shipCost();

/* ---------- render: summary ---------- */
function renderSummary(){
  $('#sumItems').innerHTML = Object.entries(cart).map(([id,q]) => { const p = byId(id); return `
    <div class="si"><div class="si-thumb"><div class="${phClass(p)}"></div><em>${q}</em></div>
    <div class="si-name">${esc(p.name)}</div><div class="si-price">${baht(p.price*q)}</div></div>`; }).join('');
  $('#sSub').textContent = baht(subtotal());
  const sc = shipCost();
  $('#sShip').innerHTML = sc === 0 ? '<span class="free">ส่งฟรี</span>' : baht(sc);
  $('#sTotal').textContent = baht(total());
  $('#totMini').textContent = baht(total());
  const nd = $('#nudge');
  if (SHOP.freeShipMin && subtotal() < SHOP.freeShipMin){
    const left = SHOP.freeShipMin - subtotal();
    nd.hidden = false;
    nd.innerHTML = `ซื้อเพิ่มอีก <b>${baht(left)}</b> รับส่งฟรี (ส่งธรรมดา)
      <div class="bar"><i style="width:${Math.min(100, subtotal()/SHOP.freeShipMin*100)}%"></i></div>`;
  } else nd.hidden = true;
}
function renderShipOpts(){
  $('#shipOpts').innerHTML = SHOP.shipping.map(s => {
    const free = s.id === 'std' && SHOP.freeShipMin && subtotal() >= SHOP.freeShipMin;
    return `<label class="radio"><input type="radio" name="ship" value="${s.id}" ${s.id === shipId ? 'checked' : ''}>
      <div><b>${s.name}</b><small>${s.desc}</small></div>
      <span class="p ${free ? 'free' : ''}">${free ? 'ฟรี' : baht(s.price)}</span></label>`;
  }).join('');
}
$('#shipOpts').addEventListener('change', e => { shipId = e.target.value; renderSummary(); });

/* ---------- step navigation ---------- */
function go(n){
  step = n;
  ['#step1','#step2','#step3'].forEach((s,i) => $(s).hidden = i + 1 !== n);
  [...$('#stepper').children].forEach((li,i) => li.className = i + 1 < n ? 'st-done' : i + 1 === n ? 'st-now' : '');
  if (n >= 2) {
    if (!orderNo){ step = 1; return go(1); }   // ต้องบันทึกข้อมูลจัดส่งก่อน
    renderPayment(); renderSummary();
  } else renderSummary();
  if (n === 3 && !$('#paidAmt').value) $('#paidAmt').value = total().toFixed(2);
  scrollTo({top:0, behavior:'smooth'});
}
document.addEventListener('click', e => {
  const g = e.target.closest('[data-goto]');
  if (g){ e.preventDefault(); go(Number(g.dataset.goto)); }
});

/* ---------- STEP 1: validation ---------- */
const RULES = {
  name:  v => v.trim().length >= 2,
  phone: v => /^0\d{9}$/.test(v.replace(/[\s-]/g,'')),
  email: v => !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
  addr:  v => v.trim().length >= 3,
  sub:   v => v.trim().length >= 2,
  dist:  v => v.trim().length >= 2,
  prov:  v => v.trim().length >= 2,
  zip:   v => /^\d{5}$/.test(v.trim())
};
function check(id){
  const el = document.getElementById(id), ok = RULES[id](el.value);
  el.closest('.field').classList.toggle('err', !ok);
  return ok;
}
Object.keys(RULES).forEach(id => document.getElementById(id).addEventListener('blur', () => { if (document.getElementById(id).value) check(id); }));
$('#zip').addEventListener('input', e => e.target.value = e.target.value.replace(/\D/g,''));
$('#step1').addEventListener('submit', async e => {
  e.preventDefault();
  const bad = Object.keys(RULES).filter(id => !check(id));
  if (bad.length){ document.getElementById(bad[0]).focus(); toast('กรุณากรอกข้อมูลให้ครบถ้วน'); return; }
  const f = id => document.getElementById(id).value.trim();
  const addr = { name:f('name'), phone:f('phone'), email:f('email'), addr:f('addr'), sub:f('sub'), dist:f('dist'), prov:f('prov'), zip:f('zip'), note:f('note') };
  store.set('mdw_ship', addr); // จำที่อยู่ไว้ใช้ครั้งหน้า
  // บันทึกคำสั่งซื้อที่ server (ย้อนกลับมาแก้ = แก้คำสั่งซื้อเดิม ไม่สร้างใหม่)
  const btn = e.target.querySelector('[type=submit]'), label = btn.textContent;
  btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
  try {
    const res = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart, shipping: shipId, address: addr, orderNo }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok){
      (data.fields || []).forEach(id => { const el = document.getElementById(id); el && el.closest('.field').classList.add('err'); });
      toast(data.error || 'บันทึกคำสั่งซื้อไม่สำเร็จ กรุณาลองใหม่');
      return;
    }
    orderNo = data.orderNo; srv = data;
    if (Math.abs(srv.totalSatang / 100 - (subtotal() + shipCost())) > 0.001) toast('ราคาสินค้ามีการเปลี่ยนแปลง ยอดชำระอัปเดตตามราคาล่าสุดแล้ว');
  } catch (err){
    toast('เชื่อมต่อไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่'); return;
  } finally { btn.disabled = false; btn.textContent = label; }
  $('#shipTo').classList.add('on');
  $('#shipTo').innerHTML = `<span>จัดส่งถึง</span><b>${esc(addr.name)}</b> · ${esc(addr.phone)}<br>${esc(addr.addr)} ${esc(addr.sub)} ${esc(addr.dist)} ${esc(addr.prov)} ${esc(addr.zip)}`;
  go(2);
});
const esc = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- STEP 2: payment ---------- */
function renderPayment(){
  $('#payAmount').textContent = baht(total());
  $('#orderNo').textContent = orderNo;
  $('#qrName').textContent = SHOP.promptpayName;
  const qb = $('#qrBox');
  if (SHOP.promptpay){
    qb.className = 'qr'; qb.innerHTML = '';
    loadQRLib().then(() => new QRCode(qb, { text: promptPayPayload(SHOP.promptpay, total()), width:196, height:196, correctLevel: QRCode.CorrectLevel.M }))
      .catch(() => { qb.className = 'qr qr-ph'; qb.textContent = 'โหลด QR ไม่สำเร็จ กรุณาใช้การโอนเข้าบัญชี'; });
  } else {
    qb.className = 'qr qr-ph';
    qb.innerHTML = '<div>ร้านยังไม่ได้ตั้งค่า QR PromptPay<br>กรุณาใช้การโอนเข้าบัญชี</div>';
  }
  $('#bankBox').innerHTML = `
    <div class="bank-row"><span>ธนาคาร</span><b>${esc(SHOP.bank.name)}</b></div>
    <div class="bank-row"><span>เลขที่บัญชี</span><div><b>${esc(SHOP.bank.account)}</b><button class="copy" data-copy="${esc(SHOP.bank.account.replace(/\D/g,'') || SHOP.bank.account)}">คัดลอก</button></div></div>
    <div class="bank-row"><span>ชื่อบัญชี</span><b>${esc(SHOP.bank.holder)}</b></div>`;
}
document.querySelectorAll('[data-tab]').forEach(t => t.onclick = () => {
  document.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === t));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + t.dataset.tab));
});
document.addEventListener('click', e => {
  const c = e.target.closest('[data-copy],[data-copy-amount]');
  if (!c) return;
  const text = c.hasAttribute('data-copy-amount') ? total().toFixed(2) : c.dataset.copy;
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('คัดลอกแล้ว: ' + text), () => toast(text));
});

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

/* ---------- STEP 3: slip upload ---------- */
const MAX = 5 * 1024 * 1024, TYPES = ['image/jpeg','image/png','image/webp'];
function setSlip(file){
  const msg = $('#fileMsg');
  msg.classList.remove('on'); $('#drop').classList.remove('err');
  if (!file) return;
  if (!TYPES.includes(file.type)){ msg.textContent = 'รองรับเฉพาะไฟล์ภาพ JPG, PNG หรือ WEBP'; msg.classList.add('on'); return; }
  if (file.size > MAX){ msg.textContent = 'ไฟล์ใหญ่เกิน 5 MB กรุณาเลือกไฟล์ใหม่'; msg.classList.add('on'); return; }
  slipFile = file;
  $('#previewImg').src = URL.createObjectURL(file);
  $('#previewName').textContent = file.name;
  $('#previewSize').textContent = (file.size / 1024).toFixed(0) + ' KB';
  $('#preview').classList.add('on'); $('#drop').hidden = true;
}
$('#slip').addEventListener('change', e => setSlip(e.target.files[0]));
const drop = $('#drop');
['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
drop.addEventListener('drop', e => setSlip(e.dataTransfer.files[0]));
$('#slipRemove').onclick = () => { slipFile = null; $('#slip').value = ''; $('#preview').classList.remove('on'); $('#drop').hidden = false; };

$('#step3').addEventListener('submit', async e => {
  e.preventDefault();
  let ok = true;
  if (!slipFile){ $('#fileMsg').textContent = 'กรุณาแนบสลิปการโอน'; $('#fileMsg').classList.add('on'); $('#drop').classList.add('err'); ok = false; }
  [['paidAt', v => !!v], ['paidTime', v => !!v], ['paidAmt', v => Number(v) > 0]].forEach(([id, fn]) => {
    const el = document.getElementById(id), good = fn(el.value);
    el.closest('.field').classList.toggle('err', !good); if (!good) ok = false;
  });
  if (!ok){ toast('กรุณาแนบสลิปและกรอกรายละเอียดให้ครบ'); return; }

  const btn = $('#submitBtn'); btn.disabled = true; btn.textContent = 'กำลังส่งคำสั่งซื้อ...';
  const addr = store.get('mdw_ship') || {};
  const fd = new FormData();
  fd.append('phone', addr.phone || $('#phone').value);
  fd.append('slip', slipFile);
  fd.append('paidAt', `${$('#paidAt').value}T${$('#paidTime').value}`);
  fd.append('amount', $('#paidAmt').value);
  let res, data = {};
  try {
    res = await fetch(`/api/orders/${encodeURIComponent(orderNo)}/slip`, { method: 'POST', body: fd });
    data = await res.json().catch(() => ({}));
  } catch (err){ res = null; }
  if (!res || !res.ok){
    btn.disabled = false; btn.textContent = 'ยืนยันคำสั่งซื้อ';
    const msg = (data && data.error) || 'ส่งสลิปไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่';
    if ((data.fields || []).includes('slip')){ $('#fileMsg').textContent = msg; $('#fileMsg').classList.add('on'); $('#drop').classList.add('err'); }
    (data.fields || []).filter(f => f !== 'slip').forEach(id => { const el = document.getElementById(id); el && el.closest('.field').classList.add('err'); });
    toast(msg);
    return;
  }
  const amt = data.totalSatang / 100;

  store.del('mdw_cart'); cart = {}; renderHdrCart();
  $('#checkoutView').hidden = true; $('#doneView').hidden = false;
  $('#doneNo').textContent = orderNo;
  $('#doneAmt').textContent = baht(amt);
  $('#doneTime').textContent = new Date().toLocaleString('th-TH', { dateStyle:'medium', timeStyle:'short' });
  $('#doneCheck').textContent = SHOP.checkWithin;
  if (SHOP.line) $('#doneLine').href = SHOP.line; else $('#doneLine').hidden = true;
  scrollTo({top:0});
});


// ลบสถานะ error ทันทีที่ผู้ใช้แก้ช่องนั้น
document.addEventListener('input', e => { const f = e.target.closest('.field.err'); if (f) f.classList.remove('err'); });

/* ---------- init ---------- */
$('#provinces').innerHTML = PROVINCES.map(p => `<option value="${esc(p)}">`).join('');
const today = new Date();
$('#paidAt').value = today.toISOString().slice(0,10);
$('#paidAt').max = $('#paidAt').value;

const saved = store.get('mdw_ship');
if (saved && typeof saved === 'object' && !Array.isArray(saved)) Object.entries(saved).forEach(([k,v]) => { const el = document.getElementById(k); if (el && v) el.value = v; });

function start(){
  renderHdrCart();
  const has = Object.keys(cart).length > 0;
  $('#emptyView').hidden = has; $('#checkoutView').hidden = !has;
  if (!has) return;
  if (matchMedia('(max-width:900px)').matches) $('#sumDetails').open = false;
  renderShipOpts(); renderSummary(); go(1);
}
// บนเดสก์ท็อปให้สรุปคำสั่งซื้อเปิดค้างไว้ตลอด (พับได้เฉพาะมือถือ)
$('#sumDetails summary').addEventListener('click', e => { if (!matchMedia('(max-width:900px)').matches) e.preventDefault(); });
start();
