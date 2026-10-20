/* =========================================================
   home.js — สไลด์, การ์ดหมวด 3D, สินค้าขายดี, ตัวช่วยเลือกไฟ ของหน้าแรก
   ย้ายมาจาก prototype/mongdoweb-home.html — ใช้ฟังก์ชันกลางจาก shell.js ($, esc, addToCart, …)
   สไลด์มาจากฐานข้อมูลผ่าน <script id="mdw-slides">
   ========================================================= */
(() => {
function start(){
const SLIDES = (() => { try { const v = JSON.parse(document.getElementById('mdw-slides').textContent); return Array.isArray(v) ? v : []; } catch (e) { return []; } })();
/* สีพื้นสำรองเมื่อโหลดรูปไม่ได้ (เรียงตามสไลด์) */
const SLIDE_FALLBACK_BG = ['#0E3A52','#1F2A3A','#2A1F45','#2B2B2B','#123B33'];


/* ตัวช่วยเลือกรุ่น: 3 คำถาม */
const FINDER_STEPS = [
  { key:'where', q:'จะติดตั้งไฟที่ไหน?', opts:[
    { v:'pool',     t:'สระว่ายน้ำ',      d:'ติดผนังสระ ใต้ระดับน้ำ' },
    { v:'pond',     t:'บ่อปลา / บ่อน้ำ',  d:'จุ่มในน้ำ ส่องใต้น้ำ' },
    { v:'fountain', t:'น้ำพุ',            d:'ส่องสายน้ำพุให้เด่น' },
    { v:'garden',   t:'สวน / ต้นไม้',     d:'ส่องต้นไม้ ทางเดิน บนดิน' } ]},
  { key:'color', q:'อยากได้แสงแบบไหน?', opts:[
    { v:'white', t:'แสงขาว',         d:'สว่าง ดูเรียบหรู' },
    { v:'rgb',   t:'RGB เปลี่ยนสีได้', d:'ปรับสีด้วยรีโมท' },
    { v:'any',   t:'ยังไม่แน่ใจ',     d:'แนะนำได้ทั้งสองแบบ' } ]},
  { key:'power', q:'จุดติดตั้งมีไฟฟ้าแบบไหน?', opts:[
    { v:'plug', t:'มีปลั๊กไฟบ้านใกล้ๆ',     d:'ต้องใช้หม้อแปลง DC12V' },
    { v:'far',  t:'ปลั๊กอยู่ไกล',          d:'ต้องเดินสายเพิ่ม' },
    { v:'batt', t:'ใช้แบตเตอรี่ 12V',      d:'ไม่มีไฟบ้านบริเวณนั้น' },
    { v:'have', t:'มีหม้อแปลง 12V แล้ว',    d:'ต้องการแค่ตัวโคม' } ]}
];
const LABEL = {};
FINDER_STEPS.forEach(s => s.opts.forEach(o => LABEL[s.key + ':' + o.v] = o.t));

function finderResult(a){
  let list = CATALOG.filter(p => !p.acc && p.use.includes(a.where) && canBuy(p));
  const exact = list.filter(p => a.color === 'any' || p.color === a.color || p.color === 'any');
  if (exact.length) list = exact;
  const recs = list.slice(0, 2);
  const main = recs[0];
  const acc = [];
  if (main && (a.power === 'plug' || a.power === 'far') && !main.kit && canBuy(byId(FINDER_ACC.psu))) acc.push(FINDER_ACC.psu);
  if ((a.power === 'far' || (a.where !== 'garden' && a.power !== 'have')) && canBuy(byId(FINDER_ACC.shrink))) acc.push(FINDER_ACC.shrink);
  const notes = ['ใช้กับไฟ DC12V เท่านั้น ห้ามต่อไฟบ้าน 220V โดยตรง'];
  if (a.where !== 'garden') notes.push('เช็กระดับกันน้ำ: IP67 จุ่มได้ไม่เกิน 90 ซม. ถ้าลึกกว่านั้นให้เลือกรุ่น IP68');
  if (main && main.kit) notes.push('รุ่นนี้มาเป็นชุดพร้อมใช้ มีหม้อแปลงไฟในกล่องแล้ว');
  if (a.power === 'far')  notes.push('เดินสายเพิ่มได้ ใช้ท่อหดกันน้ำปิดรอยต่อทุกจุด');
  if (a.power === 'batt') notes.push('ต่อกับแบตเตอรี่ 12V ได้โดยตรง ไม่ต้องใช้หม้อแปลง');
  return { recs, acc, notes };
}

/* =========================================================
   HERO SLIDER (U1–U10)
   ========================================================= */
function normSlide(s, i){
  if (!s || typeof s !== 'object') return null;
  const title = str(s.title, 120);
  if (!title) return null;
  const cta = c => (c && typeof c === 'object' && str(c.label, 40)) ? { label: str(c.label, 40), href: safeHref(c.href) } : null;
  const f = s.focal && typeof s.focal === 'object' ? s.focal : {};
  return {
    id: str(s.id, 64) || ('slide' + i), active: !!s.active, order: num(s.order, i),
    image: safeImg(s.image), focal: { x: clamp(num(f.x, 50), 0, 100), y: clamp(num(f.y, 50), 0, 100) },
    alt: str(s.alt, 200), eyebrow: str(s.eyebrow, 60), title, subtitle: str(s.subtitle, 240),
    cta1: cta(s.cta1), cta2: cta(s.cta2), align: s.align === 'center' ? 'center' : 'left',
    overlay: clamp(num(s.overlay, 50), 0, 90), startAt: s.startAt || null, endAt: s.endAt || null,
    credit: str(s.credit, 120), _i: i
  };
}
function inSchedule(s, now){
  const a = s.startAt ? Date.parse(s.startAt) : NaN, b = s.endAt ? Date.parse(s.endAt) : NaN;
  if (!isNaN(a) && now < a) return false;
  if (!isNaN(b) && now > b) return false;
  return true;
}
// กฎจาก SHARED_CONTRACT: slides.filter(active && schedule).sort(order) — ว่าง → สไลด์แรก (ไม่ปล่อย hero ว่าง)
function getSlides(){
  const now = Date.now();
  const list = SLIDES.map(normSlide).filter(s => s && s.active && inSchedule(s, now))
    .sort((a, b) => (a.order - b.order) || (a._i - b._i));
  return list.length ? list : SLIDES.slice(0, 1).map(s => normSlide({ ...s, active: true }, 0)).filter(Boolean);
}
function unsplash(u){
  if (!u.startsWith('https://images.unsplash.com/')) return null;
  const b = u.split('?')[0], q = w => `${b}?auto=format&fit=crop&w=${w}&q=75`;
  return { src: q(1920), srcset: [828, 1280, 1920].map(w => `${q(w)} ${w}w`).join(', ') };
}
const Slider = (() => {
  const DUR = 6000;
  const root = $('#slider'), wrap = $('#slides'), dots = $('#sDots'), countEl = $('#sCount');
  const btnPlay = $('#sPlay');
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></svg>';
  const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  let slides = [], cur = 0, elapsed = 0, last = 0, raf = 0, sig = '';
  let userPaused = RM.matches; // ผู้ใช้ที่ตั้งค่าลดการเคลื่อนไหว: ไม่เล่นอัตโนมัติจนกว่าจะกดเล่นเอง
  const reasons = new Set();

  function fallbackColor(s, i){
    const d = SLIDES.findIndex(x => x.id === s.id);
    return SLIDE_FALLBACK_BG[(d >= 0 ? d : i) % SLIDE_FALLBACK_BG.length];
  }
  function slideHTML(s, i, n){
    const tag = i === 0 ? 'h1' : 'h2';
    const ov = Math.max(s.overlay, 30) / 100; // ขั้นต่ำ 30% เพื่อให้อ่านตัวอักษรได้ทุกภาพ
    let img = '';
    if (s.image){
      const u = unsplash(s.image);
      const attrs = i === 0 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
      img = `<img class="s-img" src="${esc(u ? u.src : s.image)}"${u ? ` srcset="${esc(u.srcset)}" sizes="100vw"` : ''}
        alt="${esc(s.alt)}" width="1920" height="1080" decoding="async" draggable="false" ${attrs}>`;
    }
    const c1 = s.cta1 ? `<a class="btn btn-primary" href="${esc(s.cta1.href)}">${esc(s.cta1.label)} <span class="arr" aria-hidden="true">→</span></a>` : '';
    const c2 = s.cta2 ? `<a class="btn btn-light" href="${esc(s.cta2.href)}">${esc(s.cta2.label)}</a>` : '';
    return `<div class="slide align-${s.align}${s.image ? '' : ' img-broken'}" role="group" aria-roledescription="slide" aria-label="${i + 1} จาก ${n}"
        data-id="${esc(s.id)}" style="--fb:${fallbackColor(s, i)};--ov:${ov};--fx:${s.focal.x}%;--fy:${s.focal.y}%">
      <div class="s-media">${img}</div>
      <div class="s-shade" aria-hidden="true"></div>
      <div class="container s-inner"><div class="s-copy">
        ${s.eyebrow ? `<p class="s-eyebrow" style="--i:0">${esc(s.eyebrow)}</p>` : ''}
        <${tag} class="s-title" style="--i:1">${esc(s.title)}</${tag}>
        ${s.subtitle ? `<p class="s-sub" style="--i:2">${esc(s.subtitle)}</p>` : ''}
        ${c1 || c2 ? `<div class="s-ctas" style="--i:3">${c1}${c2}</div>` : ''}
      </div></div>
      ${s.credit ? `<span class="s-credit">${esc(s.credit)}</span>` : ''}
    </div>`;
  }
  function render(keepId){
    slides = getSlides();
    sig = JSON.stringify(slides);
    const n = slides.length;
    wrap.innerHTML = slides.map((s, i) => slideHTML(s, i, n)).join('');
    dots.innerHTML = slides.map((s, i) => `<button class="seg" type="button" aria-label="ไปสไลด์ที่ ${i + 1}: ${esc(s.title)}"><i></i></button>`).join('');
    $$('.s-img', wrap).forEach(img => { if (img.complete) markImg(img); });
    root.querySelector('.s-controls').hidden = n < 2;
    let idx = keepId ? slides.findIndex(s => s.id === keepId) : 0;
    cur = -1;
    go(idx < 0 ? 0 : idx, true);
  }
  function markImg(img){
    const ok = img.naturalWidth > 0;
    img.classList.toggle('is-loaded', ok);
    img.classList.toggle('is-broken', img.complete && !ok);
    img.closest('.slide').classList.toggle('img-broken', img.complete && !ok);
  }
  // load/error ไม่ bubble — ใช้ capture
  wrap.addEventListener('load', e => { if (e.target.classList && e.target.classList.contains('s-img')) markImg(e.target); }, true);
  wrap.addEventListener('error', e => { if (e.target.classList && e.target.classList.contains('s-img')) markImg(e.target); }, true);

  function go(i, instant){
    const n = slides.length, els = $$('.slide', wrap);
    if (!n) return;
    i = ((i % n) + n) % n;
    const prev = cur;
    els.forEach((el, k) => {
      const on = k === i;
      el.classList.toggle('is-active', on);
      el.classList.toggle('is-leaving', !instant && k === prev && k !== i);
      el.setAttribute('aria-hidden', on ? 'false' : 'true');
      el.inert = !on;
    });
    if (!instant && prev >= 0 && prev !== i){
      const leaving = els[prev];
      setTimeout(() => leaving && leaving.classList.remove('is-leaving'), 1000);
    }
    cur = i;
    $$('.seg', dots).forEach((d, k) => { d.setAttribute('aria-current', k === i ? 'true' : 'false'); d.querySelector('i').style.setProperty('--p', 0); });
    countEl.innerHTML = `<b>${String(i + 1).padStart(2, '0')}</b> / ${String(n).padStart(2, '0')}`;
    // โหลดรูปสไลด์ถัดไปล่วงหน้า เพื่อให้ crossfade ไม่กระตุก
    const nx = els[(i + 1) % n] && els[(i + 1) % n].querySelector('.s-img');
    if (nx) nx.loading = 'eager';
    elapsed = 0; last = 0;
    paint();
  }
  function paint(){
    const d = $$('.seg', dots)[cur];
    if (d) d.querySelector('i').style.setProperty('--p', RM.matches && isPlaying() ? 1 : Math.min(1, elapsed / DUR));
  }
  const isPlaying = () => !userPaused && reasons.size === 0 && slides.length > 1;
  function tick(t){
    if (!last) last = t;
    elapsed += t - last; last = t;
    if (elapsed >= DUR) go(cur + 1); else paint();
    raf = requestAnimationFrame(tick);
  }
  function update(){
    const play = isPlaying();
    if (play && !raf){ last = 0; raf = requestAnimationFrame(tick); }
    if (!play && raf){ cancelAnimationFrame(raf); raf = 0; }
    // live region: polite เฉพาะตอนที่ไม่ได้เล่นอัตโนมัติ (APG carousel)
    wrap.setAttribute('aria-live', play ? 'off' : 'polite');
    // อัปเดตไอคอนเฉพาะตอนสถานะเปลี่ยน (ถ้าเขียนทับทุกครั้ง คลิกจะหลุดเพราะ element ถูกแทนที่ระหว่าง mousedown/up)
    if (btnPlay.dataset.state !== String(userPaused)){
      btnPlay.dataset.state = String(userPaused);
      btnPlay.innerHTML = userPaused ? ICON_PLAY : ICON_PAUSE;
      btnPlay.setAttribute('aria-label', userPaused ? 'เล่นสไลด์อัตโนมัติ' : 'หยุดสไลด์อัตโนมัติ');
    }
    root.dataset.playing = play ? '1' : '0';
  }
  const pause = r => { reasons.add(r); update(); };
  const resume = r => { reasons.delete(r); update(); };

  $('#sPrev').addEventListener('click', () => go(cur - 1));
  $('#sNext').addEventListener('click', () => go(cur + 1));
  btnPlay.addEventListener('click', () => { userPaused = !userPaused; update(); });
  dots.addEventListener('click', e => { const b = e.target.closest('.seg'); if (b) go($$('.seg', dots).indexOf(b)); });
  // หยุดเมื่อเอาเมาส์วาง / โฟกัสด้วยคีย์บอร์ด / แท็บถูกซ่อน
  root.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') pause('hover'); });
  root.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') resume('hover'); });
  // กันสถานะ hover ค้าง (เช่น element ใต้เมาส์ถูกแทนที่แล้วเบราว์เซอร์ส่ง enter/leave ไม่ครบ)
  document.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const inside = root.contains(e.target);
    if (inside && !reasons.has('hover')) pause('hover');
    else if (!inside && reasons.has('hover')) resume('hover');
  }, { passive: true });
  root.addEventListener('focusin', e => { if (e.target.matches(':focus-visible')) pause('focus'); });
  root.addEventListener('focusout', e => { if (!root.contains(e.relatedTarget)) resume('focus'); });
  document.addEventListener('visibilitychange', () => document.hidden ? pause('hidden') : resume('hidden'));
  root.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft'){ e.preventDefault(); go(cur - 1); }
    else if (e.key === 'ArrowRight'){ e.preventDefault(); go(cur + 1); }
  });
  // ปัดซ้าย/ขวา (pointer events) — touch-action: pan-y ทำให้เลื่อนแนวตั้งได้ตามปกติ
  let sx = 0, sy = 0, tracking = false, dragged = false;
  root.addEventListener('pointerdown', e => {
    if (e.target.closest('.s-controls') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    sx = e.clientX; sy = e.clientY; tracking = true; dragged = false;
  });
  root.addEventListener('pointermove', e => {
    if (tracking && Math.abs(e.clientX - sx) > 10 && Math.abs(e.clientX - sx) > Math.abs(e.clientY - sy)) dragged = true;
  });
  root.addEventListener('pointerup', e => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) go(cur + (dx < 0 ? 1 : -1));
  });
  root.addEventListener('pointercancel', () => { tracking = false; });
  root.addEventListener('click', e => { if (dragged){ e.preventDefault(); e.stopPropagation(); dragged = false; } }, true);
  RM.addEventListener && RM.addEventListener('change', () => { if (RM.matches){ userPaused = true; update(); } });

  // ตรวจตารางเวลา (startAt/endAt) ทุก 60 วินาที — เปลี่ยนสไลด์เองเมื่อถึงเวลา
  setInterval(() => { if (JSON.stringify(getSlides()) !== sig) render(slides[cur] && slides[cur].id); }, 60000);

  render();
  update();
  return { render: () => render(slides[cur] && slides[cur].id), go: i => go(i), get index(){ return cur; }, get count(){ return slides.length; }, get playing(){ return isPlaying(); } };
})();

/* ---------- Category cards: tilt 3D + dropdown (U14, U15) ---------- */
(() => {
  const grid = $('#catGrid');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const st = new WeakMap();
  const active = new Set();
  let raf = 0;
  function loop(){
    raf = 0;
    active.forEach(card => {
      const s = st.get(card), tilt = card.querySelector('.cat-tilt');
      if (!s || !tilt){ active.delete(card); return; }
      s.rx += (s.tx - s.rx) * .15; s.ry += (s.ty - s.ry) * .15; s.l += (s.tl - s.l) * .15;
      tilt.style.transform = `perspective(900px) rotateX(${s.rx.toFixed(2)}deg) rotateY(${s.ry.toFixed(2)}deg) translateY(${s.l.toFixed(2)}px)`;
      if (Math.abs(s.tx - s.rx) + Math.abs(s.ty - s.ry) + Math.abs(s.tl - s.l) < .02 && s.tx === 0 && s.ty === 0 && s.tl === 0){
        tilt.style.transform = ''; active.delete(card);
      }
    });
    if (active.size) raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
  const canTilt = () => fine.matches && !RM.matches;
  function setActive(card, on){ card.classList.toggle('active', on); }

  grid.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const card = e.target.closest('.cat-card');
    if (card && !card.contains(e.relatedTarget)) setActive(card, true);
  });
  grid.addEventListener('pointerout', e => {
    if (e.pointerType !== 'mouse') return;
    const card = e.target.closest('.cat-card');
    if (card && !card.contains(e.relatedTarget)){
      if (!card.contains(document.activeElement) || !document.activeElement.matches(':focus-visible')) setActive(card, false);
      const s = st.get(card); if (s){ s.tx = s.ty = s.tl = 0; kick(); }
    }
  });
  grid.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || !canTilt()) return;
    const card = e.target.closest('.cat-card'); if (!card) return;
    const tilt = card.querySelector('.cat-tilt');
    let s = st.get(card); if (!s){ s = { rx:0, ry:0, l:0, tx:0, ty:0, tl:0 }; st.set(card, s); }
    if (tilt.contains(e.target)){
      const r = tilt.getBoundingClientRect();
      const px = clamp((e.clientX - r.left) / r.width, 0, 1) - .5, py = clamp((e.clientY - r.top) / r.height, 0, 1) - .5;
      s.ty = px * 12; s.tx = -py * 12; // สูงสุด ±6°
    } else { s.tx = 0; s.ty = 0; } // เมาส์อยู่บน dropdown: เลิกเอียงแต่ยังยกขึ้น
    s.tl = -6;
    active.add(card); kick();
  });
  grid.addEventListener('focusin', e => { const c = e.target.closest('.cat-card'); if (c) setActive(c, true); });
  grid.addEventListener('focusout', e => {
    const c = e.target.closest('.cat-card');
    if (c && !c.contains(e.relatedTarget) && !c.matches(':hover')) setActive(c, false);
  });
  // แตะครั้งแรก = เปิดรายการ, แตะครั้งที่สอง = ไปหน้าหมวด
  grid.addEventListener('click', e => {
    const main = e.target.closest('.cat-main'); if (!main) return;
    const card = main.closest('.cat-card');
    if (e.detail !== 0 && lastPointer !== 'mouse' && !card.classList.contains('open')){
      e.preventDefault();
      $$('.cat-card.open', grid).forEach(c => { c.classList.remove('open'); setActive(c, false); });
      card.classList.add('open'); setActive(card, true);
    }
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.cat-card')) $$('.cat-card.open', grid).forEach(c => { c.classList.remove('open'); setActive(c, false); });
  });
  grid.addEventListener('keydown', e => {
    if (e.key === 'Escape'){ const c = e.target.closest('.cat-card'); if (c){ c.classList.remove('open', 'active'); c.querySelector('.cat-main').focus(); } }
  });
})();

/* =========================================================
   PRODUCTS + JSON-LD ItemList (U23, U25)
   ========================================================= */
$('#prodGrid').innerHTML = PRODUCTS.map(p => `
  <article class="prod-card reveal" id="prod-${esc(p.id)}">
    <a class="prod-img" href="/product/${encodeURIComponent(p.id)}" tabindex="-1" aria-hidden="true">
      ${p.badge ? `<span class="prod-badge">${esc(p.badge)}</span>` : ''}
      ${thumb(p)}
    </a>
    <div class="prod-body">
      <div class="prod-cat">${esc(p.cat)}</div>
      <h3 class="prod-name"><a href="/product/${encodeURIComponent(p.id)}">${esc(p.name)}</a></h3>
      <div class="prod-specs">${p.specs.map(s => `<span>${esc(s)}</span>`).join('')}</div>
      <div class="prod-foot">
        <div class="prod-price">${priceTxt(p)}${p.compareAt ? ` <s>${baht(p.compareAt)}</s>` : ''}</div>
        ${canBuy(p) ? `<button class="add-btn" data-add="${esc(p.id)}" aria-label="ใส่ตะกร้า: ${esc(p.name)}">ใส่ตะกร้า</button>`
          : `<a class="add-btn" href="/product/${encodeURIComponent(p.id)}">${p.price > 0 ? 'สินค้าหมด' : 'ดูรายละเอียด'}</a>`}
      </div>
    </div>
  </article>`).join('');
(() => {
  const ld = { '@context':'https://schema.org', '@type':'ItemList', name:'สินค้าขายดี — มองดูเว็บ',
    itemListElement: PRODUCTS.map((p, i) => ({ '@type':'ListItem', position: i + 1,
      item: { '@type':'Product', name: p.name, category: p.cat, brand: { '@type':'Brand', name:'มองดูเว็บ' },
        ...(p.img ? { image: new URL(p.img, SITE).href } : {}),
        offers: { '@type':'Offer', price: p.price, priceCurrency:'THB', availability: canBuy(p) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: SITE + 'product/' + encodeURIComponent(p.id) } } })) };
  const s = document.createElement('script'); s.type = 'application/ld+json'; s.textContent = JSON.stringify(ld);
  document.head.appendChild(s);
})();

/* ---------- Finder render ---------- */
const finderBox = document.getElementById('finderBox');
let fStep = 0, fAns = {};

function progress(n){
  return `<div class="f-progress">${[0,1,2].map(i => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>`;
}
function renderFinder(){
  if (fStep < FINDER_STEPS.length){
    const s = FINDER_STEPS[fStep];
    finderBox.innerHTML = `<div class="f-anim">
      ${progress(fStep + 1)}
      <div class="f-step-label">คำถามที่ ${fStep + 1} จาก ${FINDER_STEPS.length}</div>
      <div class="f-q">${s.q}</div>
      <div class="f-opts">${s.opts.map(o => `
        <button class="f-opt" data-fv="${o.v}"><b>${o.t}</b><span>${o.d}</span></button>`).join('')}
      </div>
      ${fStep > 0 ? '<button class="f-link" data-fback>← ย้อนกลับ</button>' : ''}
    </div>`;
    return;
  }
  const r = finderResult(fAns);
  if (!r.recs.length){
    finderBox.innerHTML = `<div class="f-anim">${progress(3)}
      <div class="f-q">ยังไม่มีรุ่นที่ตรงกับคำตอบนี้บนหน้าเว็บ</div>
      <p class="sec-sub">ส่งรูปพื้นที่มาให้ทีมงานช่วยแนะนำรุ่นที่เหมาะสมได้ฟรี</p>
      <div class="f-actions"><a href="${LINE_URL}" class="btn btn-line" target="_blank" rel="noopener">ถามทีมงานทาง LINE</a></div>
      <button class="f-link" data-freset>เริ่มเลือกใหม่</button></div>`;
    return;
  }
  const row = (p, isAcc) => `
    <div class="f-rec ${isAcc ? 'acc' : ''}">
      <div class="thumb">${thumb(p)}</div>
      <div><small>${isAcc ? 'ใช้คู่กัน · ' : ''}${esc(p.cat)}</small><b><a href="/product/${encodeURIComponent(p.id)}">${esc(p.name)}</a></b></div>
      <div class="pr">${priceTxt(p)}</div>
    </div>`;
  finderBox.innerHTML = `<div class="f-anim">
    ${progress(3)}
    <div class="f-q">รุ่นที่แนะนำสำหรับคุณ</div>
    <div class="f-summary">${FINDER_STEPS.map(s => `<span>${LABEL[s.key + ':' + fAns[s.key]]}</span>`).join('')}</div>
    <div class="f-recs">
      ${r.recs.map(p => row(p, false)).join('')}
      ${r.acc.map(byId).filter(Boolean).map(p => row(p, true)).join('')}
    </div>
    <ul class="f-notes">${r.notes.map(n => `<li>${n}</li>`).join('')}</ul>
    <div class="f-actions">
      <button class="btn btn-primary" data-fadd="${esc([r.recs[0].id, ...r.acc].join(','))}">ใส่ชุดที่แนะนำลงตะกร้า <span class="arr">→</span></button>
      <a href="${LINE_URL}" class="btn btn-line" target="_blank" rel="noopener">ถามทีมงานทาง LINE</a>
    </div>
    <button class="f-link" data-freset>เริ่มเลือกใหม่</button>
  </div>`;
}
finderBox.addEventListener('click', e => {
  const opt = e.target.closest('[data-fv]');
  if (opt){ fAns[FINDER_STEPS[fStep].key] = opt.dataset.fv; fStep++; renderFinder(); return; }
  if (e.target.closest('[data-fback]')){ fStep--; renderFinder(); return; }
  if (e.target.closest('[data-freset]')){ fStep = 0; fAns = {}; renderFinder(); return; }
  const add = e.target.closest('[data-fadd]');
  if (add){ add.dataset.fadd.split(',').forEach(id => addToCart(id, 1, 'silent')); openCart(add); }
});
renderFinder();

mdwReveal();
}
if (window.mdwShellReady) start(); else document.addEventListener('mdw:shell', start, { once: true });
})();

