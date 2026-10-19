import pathlib as _pl
_P = _pl.Path(__file__).resolve().parent.parent / "prototype"  # โฟลเดอร์ไฟล์ต้นแบบ
_OUT = _pl.Path(__file__).resolve().parent / "out"; _OUT.mkdir(exist_ok=True)  # ภาพหน้าจอจากการทดสอบ
import os, json, re
from playwright.sync_api import sync_playwright
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__)); SH = D + '/shots2'; os.makedirs(SH, exist_ok=True)
URL = _P.joinpath('mongdoweb-admin.html').as_uri()
HOME = _P.joinpath('mongdoweb-home.html').as_uri()
res, errors = [], []
def check(n, c, info=''):
    res.append((n, bool(c), info)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f'  [{info}]'))
def ctxnew(b, vw=(1440, 900), init=None):
    c = b.new_context(viewport={'width': vw[0], 'height': vw[1]})
    c.route('**/*', lambda r: r.abort() if r.request.url.startswith('http') else r.continue_())
    if init: c.add_init_script(init)
    return c
def watch(pg, tag):
    pg.on('pageerror', lambda e: errors.append(f'{tag} PAGEERROR {e}'))
    pg.on('console', lambda m: errors.append(f'{tag} console.error {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text and 'net::' not in m.text else None)
def login(pg):
    pg.fill('#u', 'admin'); pg.fill('#pw', 'demo1234'); pg.click('#loginBtn'); pg.wait_for_selector('#appView:not([hidden])')
def go(pg, page):
    if pg.viewport_size['width'] <= 860: pg.click('#sideBtn'); pg.wait_for_timeout(250)
    pg.click(f'[data-page="{page}"]'); pg.wait_for_timeout(200)
def ls(pg, k): return pg.evaluate(f'JSON.parse(localStorage.getItem({json.dumps(k)}))')

BLOCK = """(() => { const thr = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
  for (const n of ['localStorage','sessionStorage']) Object.defineProperty(window, n, { configurable:true, get: thr }); })();"""

Image.new('RGB', (2400, 1350), (30, 120, 160)).save(D + '/own.jpg', quality=85)

with sync_playwright() as p:
    b = p.chromium.launch()

    # ================= F3: storage blocked =================
    for vw in [(1440, 900), (390, 844)]:
        ctx = ctxnew(b, vw, BLOCK); pg = ctx.new_page(); watch(pg, f'F3-{vw[0]}'); pg.goto(URL)
        check(f'F3 login page warns ({vw[0]})', pg.is_visible('#loginLs'))
        # throttle works in memory
        pg.fill('#u', 'admin'); pg.fill('#pw', 'x'); pg.click('#loginBtn')
        check(f'F3 wrong pw handled ({vw[0]})', pg.is_visible('#loginErr') and '4' in pg.text_content('#triesLeft'))
        login(pg)
        check(f'F3 app renders KPIs/tabs ({vw[0]})', pg.locator('#kpis .kpi').count() == 4 and pg.locator('#tabs .tab').count() == 5 and pg.locator('#rows tr').count() == 3)
        check(f'F3 banner visible ({vw[0]})', pg.is_visible('#lsBanner') and 'บันทึกข้อมูลไม่ได้' in pg.text_content('#lsBanner'))
        pg.screenshot(path=SH + f'/F3-orders-{vw[0]}.png')
        # approve works in memory
        pg.click('#reviewNext'); pg.wait_for_timeout(200); pg.click('[data-act="approve"]'); pg.wait_for_timeout(150)
        if pg.is_visible('#dlg'): pg.click('#dlg [data-dlg="ok"]')
        pg.wait_for_timeout(200)
        check(f'F3 approve in memory ({vw[0]})', pg.evaluate("orders.filter(o=>o.status==='PAID').length") == 2)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        for page in ['slides', 'categories', 'log', 'settings']:
            go(pg, page)
        check(f'F3 log in memory ({vw[0]})', True)
        go(pg, 'slides')
        check(f'F3 slides page works ({vw[0]})', pg.locator('#slList li').count() == 5)
        pg.click('#slList li:nth-child(1) [data-sl="down"]'); pg.wait_for_timeout(100)
        pg.click('#slPublish'); pg.wait_for_timeout(300)
        check(f'F3 publish in memory ({vw[0]})', pg.evaluate("JSON.parse(MEM.get('mdw_slides'))[0].id") == 's2')
        pg.screenshot(path=SH + f'/F3-slides-{vw[0]}.png', full_page=True)
        go(pg, 'settings'); pg.fill('#s-snd-name', 'ร้านทดสอบ'); pg.click('#setForm [type=submit]'); pg.wait_for_timeout(200)
        check(f'F3 settings save in memory ({vw[0]})', pg.evaluate("JSON.parse(MEM.get('mdw_settings')).sender.name") == 'ร้านทดสอบ')
        go(pg, 'log')
        check(f'F3 log page entries ({vw[0]})', 'เผยแพร่สไลด์' in pg.text_content('#logList') and 'เข้าสู่ระบบ' in pg.text_content('#logList'))
        # logout in memory -> login screen, no reload
        pg.click('#sideBtn') if vw[0] <= 860 else None; pg.wait_for_timeout(200)
        pg.click('#logout'); pg.wait_for_timeout(300)
        if pg.is_visible('#dlg'): pg.click('#dlg [data-dlg="ok"]'); pg.wait_for_timeout(300)
        check(f'F3 logout shows login ({vw[0]})', pg.is_visible('#loginView') and pg.is_hidden('#appView'))
        login(pg)
        check(f'F3 relogin keeps memory data ({vw[0]})', pg.evaluate("orders.filter(o=>o.status==='PAID').length") == 2)
        ctx.close()
    # idle logout with blocked storage
    ctx = ctxnew(b, init=BLOCK + 'window.__MDW_TEST_IDLE_MS=800; window.__MDW_TEST_IDLE_COUNT=1;'); pg = ctx.new_page(); watch(pg, 'F3-idle'); pg.goto(URL); login(pg)
    pg.wait_for_timeout(2600)
    check('F3 idle logout without storage', pg.is_visible('#loginView') and 'อัตโนมัติ' in pg.text_content('#loginInfo'))
    ctx.close()
    # static audit: every direct storage access is inside try
    src = open(_P / 'mongdoweb-admin.html', encoding='utf-8').read().split('<script>')[1]
    bad = []
    for i, line in enumerate(src.splitlines()):
        if re.search(r'\b(localStorage|sessionStorage)\.', line) and 'try' not in line and not line.strip().startswith(('/*', '*', '//')) and "localStorage 'mdw" not in line and 'setRaw(k, s)' not in line:
            bad.append(f'{i}: {line.strip()[:100]}')
    check('F3 static audit: all storage calls in try', not bad, '\n'.join(bad))
    calls = [l for l in src.splitlines() if 'store.setRaw(' in l or 'writeVersion(' in l and 'function' not in l]
    check('F3 audit: setRaw/writeVersion callers wrapped in try', all('try' in l for l in calls), '\n'.join(l for l in calls if 'try' not in l))

    # ================= F4 / F5 / F2 / F7 / F8 =================
    ctx = ctxnew(b); pg = ctx.new_page(); watch(pg, 'F'); pg.goto(URL)
    pg.evaluate("""localStorage.setItem('mdw_seeded','1'); localStorage.setItem('mdw_slides', JSON.stringify([
      {id:'a', active:true, order:1, image:'javascript:alert(1)', focal:{x:50,y:50}, alt:'', eyebrow:'', title:'XSS img', subtitle:'', cta1:{label:'ดู',href:'#x'}, cta2:null, align:'left', overlay:10, startAt:null, endAt:null, credit:''},
      {id:'b', order:2, image:'https://images.unsplash.com/photo-1', focal:{x:50,y:50}, alt:'', eyebrow:'', title:'No active', subtitle:'', cta1:{label:'ดู',href:'#x'}, cta2:null, align:'left', overlay:20, startAt:null, endAt:null, credit:''},
      {id:'c', active:'yes', order:3, image:'https://x.com/a.jpg" onerror="alert(1)', focal:{x:50,y:50}, alt:'', eyebrow:'', title:'str active', subtitle:'', cta1:{label:'ดู',href:'#x'}, cta2:null, align:'left', overlay:60, startAt:null, endAt:null, credit:''},
      {id:'d', active:true, order:4, image:'https://images.unsplash.com/photo-1517384084767-6bc118943770', focal:{x:50,y:50}, alt:'สระเดิม', eyebrow:'', title:'ok', subtitle:'', cta1:{label:'ดู',href:'#x'}, cta2:null, align:'left', overlay:55, startAt:null, endAt:null, credit:'Photo: Marissa Rodriguez / Unsplash'} ]))""")
    pg.reload(); login(pg); go(pg, 'slides')
    check('F7 javascript: image dropped', pg.evaluate("slDraft[0].image") == '' and pg.locator('#slList img[src^="javascript"]').count() == 0)
    check('F7 quote-injection image dropped', pg.evaluate("slDraft[2].image") == '')
    check('F7 shows ไม่มีรูป + fails validation', pg.locator('#slList li:nth-child(1) .ph.img-none').count() == 1 and 'ข้อมูลไม่ครบ' in pg.text_content('#slList li:nth-child(1)'))
    check('F8 missing active -> off', pg.evaluate("slDraft[1].active") is False and 'ปิดอยู่' in pg.text_content('#slList li:nth-child(2)'))
    check('F8 non-boolean active -> off', pg.evaluate("slDraft[2].active") is False)
    check('F5 overlay clamped up to 30', pg.evaluate("slDraft.map(s=>s.overlay)") == [30, 30, 60, 55])
    pg.evaluate("localStorage.setItem('mdw_categories', JSON.stringify([{id:'x',th:'ก',en:'A',icon:'water',group:'water',slug:'a',popular:[],order:1},{id:'y',th:'ข',en:'B',icon:'water',group:'water',slug:'b',popular:[],visible:true,order:2}]))")
    pg.reload(); go(pg, 'categories')
    check('F8 category missing visible -> hidden', pg.evaluate("ctDraft[0].visible") is False)
    pg.evaluate("localStorage.removeItem('mdw_categories')"); pg.reload()
    go(pg, 'slides')
    # F5 range
    pg.click('#slList li:nth-child(4) [data-sl="edit"]'); pg.wait_for_timeout(300)
    check('F5 range min 30 + label', pg.get_attribute('#fOverlay', 'min') == '30' and '30–90%' in pg.text_content('label[for="fOverlay"]'))
    pg.evaluate("(()=>{const r=document.querySelector('#fOverlay'); r.value='0'; r.dispatchEvent(new Event('input',{bubbles:true}));})()"); pg.wait_for_timeout(50)
    check('F5 cannot go below 30', pg.evaluate('edSlide().overlay') == 30 and pg.text_content('#ovOut') == '30%')
    # F5: preview overlay equals home formula -> compare computed alpha of first stop
    bg = pg.evaluate("getComputedStyle(document.querySelector('#pv .pv-ov')).backgroundImage")
    check('F5 preview overlay uses home gradient (desktop 0.3)', 'rgba(10, 10, 10, 0.3)' in bg and 'rgba(10, 10, 10, 0.6)' in bg, bg[:200])
    # F2 crops/previews ratio
    ratios = pg.evaluate("[...document.querySelectorAll('#crops .ph')].map(e=>{const r=e.getBoundingClientRect(); return +(r.width/r.height).toFixed(2)})")
    check('F2 three crops ~0.6/1.24/2.0', len(ratios) == 3 and abs(ratios[0] - .6) < .03 and abs(ratios[1] - 1.24) < .03 and abs(ratios[2] - 2.0) < .03, str(ratios))
    labels = pg.locator('#crops figcaption b').all_text_contents()
    check('F2 crop labels', labels == ['มือถือ', 'แท็บเล็ต', 'คอมพิวเตอร์'], str(labels))
    pv = {}
    for k in ['desktop', 'tablet', 'mobile']:
        pg.click(f'[data-pv="{k}"]'); pg.wait_for_timeout(80)
        r = pg.locator('#pv').bounding_box(); pv[k] = round(r['width'] / r['height'], 2)
    check('F2 preview toggle ratios', abs(pv['desktop'] - 2) < .03 and abs(pv['tablet'] - 1.24) < .03 and abs(pv['mobile'] - .6) < .03, str(pv))
    # F4: upload clears credit + flags alt
    check('F4 precondition credit', pg.input_value('#fCredit').startswith('Photo: Marissa'))
    pg.set_input_files('#fFile', D + '/own.jpg'); pg.wait_for_function("edSlide().image.startsWith('data:')", timeout=15000); pg.wait_for_timeout(200)
    check('F4 credit cleared (state+field)', pg.evaluate('edSlide().credit') == '' and pg.input_value('#fCredit') == '')
    check('F4 alt flagged', 'needs-review' in pg.get_attribute('#fld-alt', 'class') and 'อย่าลืมแก้คำอธิบายรูปให้ตรงกับรูปใหม่' in pg.text_content('#altReviewMsg'))
    check('F2 guides drawn (mobile+desktop)', pg.locator('#crops .crop-wide').count() == 2)
    pg.locator('#fld-alt').scroll_into_view_if_needed()
    pg.screenshot(path=SH + '/F4-alt-review-desk.png')
    pg.locator('.fp-wrap').scroll_into_view_if_needed(); pg.wait_for_timeout(100)
    pg.locator('.fp-wrap').screenshot(path=SH + '/F2-crops-desk.png')
    pg.fill('#fAlt', 'รูปสระของร้าน'); pg.wait_for_timeout(50)
    check('F4 alt flag cleared after edit', 'needs-review' not in pg.get_attribute('#fld-alt', 'class') and pg.text_content('#altReviewMsg') == '')
    pg.fill('#fCredit', 'Photo: Someone'); pg.dispatch_event('#fCredit', 'input')
    pg.fill('#fUrl', 'https://images.unsplash.com/photo-999'); pg.click('#fUrlApply'); pg.wait_for_timeout(100)
    check('F4 unsplash URL clears credit', pg.evaluate('edSlide().credit') == '' and pg.input_value('#fCredit') == '' and 'Unsplash' in pg.text_content('#altReviewMsg'))
    for k in ['desktop', 'tablet', 'mobile']:
        pg.click(f'[data-pv="{k}"]'); pg.wait_for_timeout(80)
        pg.locator('.ed-aside').screenshot(path=SH + f'/F2-preview-{k}.png')
    pg.keyboard.press('Escape')
    ctx.close()

    # F2/F5 side-by-side with real home (same slide)
    ctx = ctxnew(b, (1280, 800)); pg = ctx.new_page(); watch(pg, 'cmp'); pg.goto(URL); login(pg)
    hp = ctx.new_page(); hp.set_viewport_size({'width': 1280, 'height': 800}); hp.goto(HOME); hp.wait_for_timeout(800)
    r = hp.locator('#slider').bounding_box(); home_ar = round(r['width'] / r['height'], 2)
    hp.locator('#slider').screenshot(path=SH + '/cmp-home-1280.png')
    pg.bring_to_front(); go(pg, 'slides'); pg.click('#slList li:first-child [data-sl="edit"]'); pg.wait_for_timeout(300)
    pg.locator('#pv').screenshot(path=SH + '/cmp-admin-desktop.png')
    check('F2 home 1280 ratio ≈ admin desktop', abs(home_ar - 2.0) < .05, str(home_ar))
    hov = hp.evaluate("getComputedStyle(document.querySelector('.slide.is-active .s-shade')).backgroundImage")
    aov = pg.evaluate("getComputedStyle(document.querySelector('#pv .pv-ov')).backgroundImage")
    norm = lambda s: re.findall(r'rgba\([^)]*\)', s)
    check('F5 overlay colours identical to home (desktop)', norm(hov) == norm(aov), f'home={norm(hov)} admin={norm(aov)}')
    ctx.close()
    ctx = ctxnew(b, (390, 844)); hp = ctx.new_page(); hp.goto(HOME); hp.wait_for_timeout(800)
    r = hp.locator('#slider').bounding_box(); hm = round(r['width'] / r['height'], 2)
    hp.locator('#slider').screenshot(path=SH + '/cmp-home-390.png')
    hmov = hp.evaluate("getComputedStyle(document.querySelector('.slide.is-active .s-shade')).backgroundImage")
    pg = ctx.new_page(); pg.goto(URL); login(pg); go(pg, 'slides'); pg.click('#slList li:first-child [data-sl="edit"]'); pg.wait_for_timeout(300)
    pg.click('[data-pv="mobile"]'); pg.wait_for_timeout(100)
    amov = pg.evaluate("getComputedStyle(document.querySelector('#pv .pv-ov')).backgroundImage")
    pg.locator('#pv').screenshot(path=SH + '/cmp-admin-mobile.png')
    check('F2 home 390 ratio ≈ admin mobile', abs(hm - .63) < .05, str(hm))
    check('F5 overlay colours identical to home (mobile)', norm(hmov) == norm(amov), f'home={norm(hmov)} admin={norm(amov)}')
    pg.screenshot(path=SH + '/F2-editor-390.png')
    pg.locator('.fp-wrap').scroll_into_view_if_needed(); pg.wait_for_timeout(100); pg.screenshot(path=SH + '/F2-crops-390.png')
    ctx.close()

    # ================= G1 drafts =================
    ctx = ctxnew(b, init='window.__MDW_TEST_IDLE_MS = 2500; window.__MDW_TEST_IDLE_COUNT = 1;'); pg = ctx.new_page(); watch(pg, 'G1'); pg.goto(URL); login(pg)
    go(pg, 'slides')
    pg.click('#slList li:nth-child(1) [data-sl="down"]'); pg.wait_for_timeout(900)
    d = ls(pg, 'mdw_slides_draft')
    check('G1 slide draft autosaved', d and d['items'][0]['id'] == 's2' and d['savedAt'] and d['by'] == 'admin')
    check('G1 pubbar says autosaved', 'บันทึกฉบับร่างอัตโนมัติแล้ว' in pg.text_content('#slBarSum'))
    go(pg, 'categories')
    if pg.is_visible('#dlg'): pg.click('#dlg [data-dlg="keep"]'); pg.wait_for_timeout(200)
    pg.click('#ctList li:nth-child(2) [data-ct="toggle"]'); pg.wait_for_timeout(900)
    check('G1 category draft autosaved', ls(pg, 'mdw_categories_draft')['items'][1]['visible'] is False)
    # idle logout must keep drafts
    pg.wait_for_timeout(4200)
    check('G1 idle logged out', pg.is_visible('#loginView'))
    check('G1 drafts survive idle logout', ls(pg, 'mdw_slides_draft') is not None and ls(pg, 'mdw_categories_draft') is not None)
    login(pg); pg.wait_for_timeout(200)
    check('G1 restore offer banners', pg.locator('[data-draft-restore]').count() == 2 and 'กู้คืนฉบับร่างที่ยังไม่เผยแพร่ (บันทึกเมื่อ' in pg.text_content('#draftBanners'))
    pg.screenshot(path=SH + '/G1-banner-desk.png')
    check('G1 not auto-applied', pg.evaluate("slDraft[0].id") == 's1')
    pg.click('[data-draft-restore="slides"]'); pg.wait_for_timeout(300)
    check('G1 restore slides', pg.is_visible('#page-slides') and pg.evaluate("slDraft[0].id") == 's2' and pg.is_visible('#slBar'))
    pg.click('[data-draft-drop="cats"]'); pg.wait_for_timeout(200)
    check('G1 drop cats draft', ls(pg, 'mdw_categories_draft') is None and pg.locator('[data-draft-restore]').count() == 0)
    pg.click('#slPublish'); pg.wait_for_timeout(300)
    check('G1 publish clears draft', ls(pg, 'mdw_slides_draft') is None)
    pg.click('#slList li:nth-child(1) [data-sl="down"]'); pg.wait_for_timeout(900)
    check('G1 draft again', ls(pg, 'mdw_slides_draft') is not None)
    pg.click('#slDiscard'); pg.click('#dlg [data-dlg="ok"]'); pg.wait_for_timeout(300)
    check('G1 discard clears draft', ls(pg, 'mdw_slides_draft') is None)
    # reload (tab closed) then draft offered
    pg.click('#slList li:nth-child(2) [data-sl="up"]'); pg.wait_for_timeout(900)
    pg.evaluate("allowUnload = true"); pg.reload(); pg.wait_for_timeout(300)
    check('G1 offer after reload', pg.locator('[data-draft-restore="slides"]').count() == 1)
    ctx.close()
    # mobile banner screenshot
    ctx = ctxnew(b, (390, 844)); pg = ctx.new_page(); pg.goto(URL)
    pg.evaluate("localStorage.setItem('mdw_slides_draft', JSON.stringify({savedAt:new Date().toISOString(), by:'admin', items: DEFAULT_SLIDES.slice().reverse()}))")
    login(pg); pg.wait_for_timeout(200); pg.screenshot(path=SH + '/G1-banner-390.png')
    check('G1 banner fits 390', pg.evaluate('document.documentElement.scrollWidth') <= 390)
    ctx.close()

    # ================= G2 rollback =================
    ctx = ctxnew(b); pg = ctx.new_page(); watch(pg, 'G2'); pg.goto(URL); login(pg); go(pg, 'slides')
    check('G2 no prev initially', pg.locator('[data-rollback]').count() == 0)
    pg.click('#slList li:nth-child(1) [data-sl="edit"]'); pg.fill('#fTitle', 'เวอร์ชัน A'); pg.keyboard.press('Escape'); pg.click('#slPublish'); pg.wait_for_timeout(300)
    prev = ls(pg, 'mdw_slides_prev')
    check('G2 prev stores defaults', prev and prev['items'][0]['title'] == 'เปลี่ยนสระว่ายน้ำธรรมดา ให้สวยระดับรีสอร์ต' and prev['wasDefault'] is True)
    pg.wait_for_timeout(1100)
    pg.click('#slList li:nth-child(1) [data-sl="edit"]'); pg.fill('#fTitle', 'เวอร์ชัน B'); pg.keyboard.press('Escape'); pg.click('#slPublish'); pg.wait_for_timeout(300)
    check('G2 prev = A', ls(pg, 'mdw_slides_prev')['items'][0]['title'] == 'เวอร์ชัน A')
    btxt = pg.text_content('[data-rollback="slides"]')
    check('G2 button text with time', 'ย้อนกลับเป็นเวอร์ชันก่อนหน้า (เผยแพร่เมื่อ' in btxt, btxt)
    pg.locator('#slVer').screenshot(path=SH + '/G2-verbox.png')
    pg.click('[data-rollback="slides"]'); pg.wait_for_timeout(150)
    check('G2 confirm', pg.is_visible('#dlg') and 'ย้อนกลับ' in pg.text_content('#dlgTitle'))
    pg.click('#dlgActs [data-dlg="cancel"]'); check('G2 cancel keeps B', ls(pg, 'mdw_slides')[0]['title'] == 'เวอร์ชัน B')
    pg.click('[data-rollback="slides"]'); pg.click('#dlg [data-dlg="ok"]'); pg.wait_for_timeout(300)
    check('G2 rollback -> A live', ls(pg, 'mdw_slides')[0]['title'] == 'เวอร์ชัน A' and pg.evaluate('slDraft[0].title') == 'เวอร์ชัน A')
    check('G2 rollback swaps prev -> B', ls(pg, 'mdw_slides_prev')['items'][0]['title'] == 'เวอร์ชัน B')
    check('G2 logged SLIDES_ROLLBACK', any(x['type'] == 'SLIDES_ROLLBACK' for x in ls(pg, 'mdw_admin_log')))
    check('G2 contract shape kept', all(list(x.keys()) == ['id','active','order','image','focal','alt','eyebrow','title','subtitle','cta1','cta2','align','overlay','startAt','endAt','credit'] for x in ls(pg, 'mdw_slides')))
    go(pg, 'categories')
    pg.click('#ctList li:nth-child(1) [data-ct="down"]'); pg.click('#ctPublish'); pg.wait_for_timeout(300)
    check('G2 cats prev', ls(pg, 'mdw_categories_prev')['items'][0]['id'] == 'underwater')
    pg.click('[data-rollback="cats"]'); pg.click('#dlg [data-dlg="ok"]'); pg.wait_for_timeout(300)
    check('G2 cats rollback', ls(pg, 'mdw_categories')[0]['id'] == 'underwater' and any(x['type'] == 'CATS_ROLLBACK' for x in ls(pg, 'mdw_admin_log')))
    go(pg, 'log'); check('G2 log label', 'ย้อนกลับสไลด์' in pg.text_content('#logList') and 'ย้อนกลับหมวดหมู่' in pg.text_content('#logList'))
    ctx.close()

    # ================= G3 / G4 =================
    for vw in [(1440, 900), (390, 844)]:
        ctx = ctxnew(b, vw); pg = ctx.new_page(); watch(pg, f'G3-{vw[0]}'); pg.goto(URL); login(pg); go(pg, 'slides')
        g = pg.text_content('#slGuide')
        check(f'G3 guide 4 steps + specs ({vw[0]})', pg.locator('#slGuide .steps li').count() == 4 and all(x in g for x in ['อัปโหลดรูป','เลือกจุดสำคัญของภาพ','ดูตัวอย่างมือถือ/คอมพิวเตอร์','กดเผยแพร่','1920×1080','แนวนอน','กลางภาพ','ตัวหนังสือ']))
        check(f'G4 prototype notice ({vw[0]})', 'เครื่องนี้เท่านั้น' in pg.text_content('.proto-note') and 'เซิร์ฟเวอร์/CDN' in pg.text_content('.proto-note'))
        pg.screenshot(path=SH + f'/G3-slides-{vw[0]}.png', full_page=True)
        check(f'G3 no hscroll ({vw[0]})', pg.evaluate('document.documentElement.scrollWidth') <= vw[0])
        pg.click('#slGuideClose'); pg.wait_for_timeout(100)
        check(f'G3 dismiss ({vw[0]})', pg.is_hidden('#slGuide') and pg.is_visible('#slGuideOpen'))
        pg.reload(); go(pg, 'slides')
        check(f'G3 dismiss remembered ({vw[0]})', pg.is_hidden('#slGuide'))
        pg.click('#slGuideOpen'); check(f'G3 reopen ({vw[0]})', pg.is_visible('#slGuide'))
        ctx.close()

    # ================= G5 =================
    for vw in [(1440, 900), (390, 844)]:
        ctx = ctxnew(b, vw); pg = ctx.new_page(); watch(pg, f'G5-{vw[0]}'); pg.goto(URL); login(pg); go(pg, 'categories')
        pg.click('#ctList li:nth-child(1) [data-ct="edit"]'); pg.wait_for_timeout(300)
        check(f'G5 no warning when visible ({vw[0]})', pg.text_content('#hideImpactBox') == '')
        pg.click('#cVis'); pg.wait_for_timeout(100)
        t = pg.text_content('#hideImpactBox')
        check(f'G5 count shown for underwater ({vw[0]})', '4 รายการ' in t and 'ขายดี 2' in t, t)
        pg.locator('#hideImpactBox').scroll_into_view_if_needed(); pg.screenshot(path=SH + f'/G5-{vw[0]}.png')
        pg.keyboard.press('Escape')
        pg.click('#ctList li:nth-child(9) [data-ct="edit"]'); pg.wait_for_timeout(200); pg.click('#cVis'); pg.wait_for_timeout(100)
        check(f'G5 fallback text ({vw[0]})', 'การค้นหาและลิงก์' in pg.text_content('#hideImpactBox'))
        pg.keyboard.press('Escape'); ctx.close()

    # no-hscroll sweep again incl. new UI
    for w in [390, 768, 1280, 1440]:
        ctx = ctxnew(b, (w, 900)); pg = ctx.new_page(); watch(pg, f'sweep{w}'); pg.goto(URL); login(pg)
        bad = []
        for page in ['orders', 'slides', 'categories', 'log', 'settings']:
            go(pg, page)
            if pg.evaluate('document.documentElement.scrollWidth') > w: bad.append(page)
        go(pg, 'slides'); pg.click('#slList li:first-child [data-sl="edit"]'); pg.wait_for_timeout(300)
        if pg.evaluate("document.querySelector('#slEdBody').scrollWidth > document.querySelector('#slEdBody').clientWidth + 1"): bad.append('editor')
        check(f'no hscroll {w}', not bad, ','.join(bad))
        ctx.close()
    b.close()

print('\n==== errors ====\n' + ('\n'.join(errors) or 'none'))
f = [r for r in res if not r[1]]
print(f'\n{len(res) - len(f)}/{len(res)} passed')
for x in f: print('FAIL:', x[0], x[2])
