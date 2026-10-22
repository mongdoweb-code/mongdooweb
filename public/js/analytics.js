/* =========================================================
   analytics.js — GA4 / Meta Pixel ตามความยินยอม (PDPA)
   - รหัสมาจากตั้งค่าร้านผ่าน <script id="mdw-analytics"> (ว่าง = ไม่โหลด)
   - ไม่มีสคริปต์ภายนอกใดๆ จนกว่าลูกค้าจะยอมรับ: วิเคราะห์ → GA4, การตลาด → Meta Pixel
   - หน้าอื่นส่ง event ผ่าน window.mdwTrack(name, params) — ถ้ายังไม่ยินยอม event จะถูกทิ้ง (ไม่เก็บไว้ส่งทีหลัง)
   - event: view_item, add_to_cart, begin_checkout, purchase (ชื่อตาม GA4; Meta ใช้ชื่อมาตรฐานของ Meta)
   ========================================================= */
(() => {
  const cfg = (() => { try { return JSON.parse(document.getElementById('mdw-analytics').textContent) || {}; } catch (e) { return {}; } })();
  const KEY = 'mdw_consent';
  const consent = () => { try { const s = JSON.parse(localStorage.getItem(KEY)); return s && s.v === 1 ? s : {}; } catch (e) { return {}; } };
  let ga = false, fb = false;

  function loadGa(){
    if (ga || !cfg.ga4) return;
    ga = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){ window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', cfg.ga4, { anonymize_ip: true });
    const s = document.createElement('script');
    s.async = true; s.dataset.mdw = 'ga4';
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(cfg.ga4);
    document.head.appendChild(s);
  }
  function loadFb(){
    if (fb || !cfg.pixel) return;
    fb = true;
    const f = window.fbq = function(){ f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); };
    if (!window._fbq) window._fbq = f;
    f.push = f; f.loaded = true; f.version = '2.0'; f.queue = [];
    const s = document.createElement('script');
    s.async = true; s.dataset.mdw = 'pixel';
    s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
    window.fbq('init', cfg.pixel);
    window.fbq('track', 'PageView');
  }
  // ถอนความยินยอม → ลบคุกกี้ของบริการนั้นที่เคยตั้งไว้ (ทั้งโดเมนนี้และโดเมนแม่)
  function dropCookies(re){
    const host = location.hostname.split('.');
    const domains = ['', ...host.map((_, i) => '.' + host.slice(i).join('.')).filter(d => d.split('.').length > 2)];
    document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(n => re.test(n)).forEach(n => {
      domains.forEach(d => { document.cookie = n + '=; Max-Age=0; path=/' + (d ? '; domain=' + d : ''); });
    });
  }
  function apply(){
    const c = consent();
    if (!c.analytics) dropCookies(/^(_ga|_gid|_gat)/);
    if (!c.marketing) dropCookies(/^(_fbp|_fbc)$/);
    if (c.analytics) { loadGa(); if (ga) window.gtag('consent', 'update', { analytics_storage: 'granted' }); }
    else if (ga) window.gtag('consent', 'update', { analytics_storage: 'denied' });
    if (c.marketing) { loadFb(); if (fb) window.fbq('consent', 'grant'); }
    else if (fb) window.fbq('consent', 'revoke');
  }

  const FB = { view_item: 'ViewContent', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout', purchase: 'Purchase' };
  function track(name, p){
    p = p || {};
    const c = consent();
    const items = (p.items || []).map(i => ({ item_id: String(i.id), item_name: String(i.name || ''), price: Number(i.price) || 0, quantity: Number(i.qty) || 1 }));
    const value = Number(p.value) || items.reduce((s, i) => s + i.price * i.quantity, 0);
    if (c.analytics && ga) window.gtag('event', name, Object.assign({ currency: 'THB', value, items }, p.transaction_id ? { transaction_id: p.transaction_id } : {}));
    if (c.marketing && fb && FB[name]) window.fbq('track', FB[name], { currency: 'THB', value, content_type: 'product', content_ids: items.map(i => i.item_id), num_items: items.reduce((s, i) => s + i.quantity, 0) });
  }

  const queued = (window.mdwQ || []).slice();
  window.mdwQ = [];
  window.mdwTrack = track;
  apply();
  queued.forEach(a => track(a[0], a[1]));
  document.addEventListener('mdw:consent', apply);
  addEventListener('storage', e => { if (e.key === KEY) apply(); });
})();
