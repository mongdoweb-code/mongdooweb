import pathlib as _pl
_P = _pl.Path(__file__).resolve().parent.parent / "prototype"  # โฟลเดอร์ไฟล์ต้นแบบ
_OUT = _pl.Path(__file__).resolve().parent / "out"; _OUT.mkdir(exist_ok=True)  # ภาพหน้าจอจากการทดสอบ
"""Full flow with the CURRENT DOM: checkout (customer tab) -> admin new-order alert -> approve (incl. anomaly
confirm dialog) -> reject -> close drawer -> ship -> label print -> CSV. Plus F2 ratio/safe-area regression."""
import os, json
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
D = os.path.dirname(os.path.abspath(__file__)); SH = D + '/shots3'; os.makedirs(SH, exist_ok=True)
B = _P.as_uri() + '/'
res, errs = [], []
def check(n, c, i=''):
    res.append((n, bool(c), i)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f'  [{i}]'))
# unique slip image (so checkout's duplicate-slip check does not trigger across runs)
img = Image.new('RGB', (600, 900), (255, 255, 255)); d = ImageDraw.Draw(img); d.text((40, 400), str(os.getpid()) + str(os.times()), fill=(0, 0, 0))
img.save(D + '/slip_e2e.png')

with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True)
    ctx.route('**/*', lambda r: r.abort() if r.request.url.startswith('http') else r.continue_())
    ctx.add_init_script('window.__MDW_TEST_NOPRINT = true;')
    a = ctx.new_page(); a.on('pageerror', lambda e: errs.append('admin ' + str(e)))
    a.on('dialog', lambda dl: (errs.append('native dialog: ' + dl.message), dl.accept()))
    a.goto(B + 'mongdoweb-admin.html'); a.evaluate('localStorage.clear(); sessionStorage.clear()'); a.reload()
    a.fill('#u', 'admin'); a.fill('#pw', 'demo1234'); a.click('#loginBtn'); a.wait_for_selector('#appView:not([hidden])')
    a.evaluate('window.__mdwBeeps = 0')
    # ---- customer checkout ----
    c = ctx.new_page(); c.on('pageerror', lambda e: errs.append('checkout ' + str(e)))
    c.goto(B + 'mongdoweb-checkout.html'); c.click('#demoFill')
    for k, v in dict(name='ทดสอบ อีทูอี', phone='0899999999', addr='1 ถนนทดสอบ', sub='แขวงทดสอบ', dist='เขตทดสอบ', prov='กรุงเทพมหานคร', zip='10100').items(): c.fill('#' + k, v)
    c.click('#step1 button[type=submit]'); c.wait_for_timeout(800)
    c.click("#step2 [data-goto='3']"); c.set_input_files('#slip', D + '/slip_e2e.png'); c.fill('#paidTime', '15:20')
    c.click('#submitBtn'); c.wait_for_timeout(1500)
    oid = c.inner_text('#doneNo').strip()
    check('checkout produced order', oid.startswith('MDW-'), oid)
    # ---- admin receives it ----
    a.bring_to_front(); a.wait_for_timeout(500)
    check('admin toast for new order', oid in a.text_content('#toast'), a.text_content('#toast'))
    check('admin beep + title counter', a.evaluate('window.__mdwBeeps') == 1 and '(1 ใหม่)' in a.title())
    a.click('#tabs [data-tab="PENDING_VERIFICATION"]')
    check('order in pending list', a.locator(f'#rows tr[data-open="{oid}"]').count() == 1)
    a.click(f'#rows tr[data-open="{oid}"] .c-id'); a.wait_for_timeout(400)
    check('drawer open on order', a.text_content('#dTitle') == oid)
    a.click('#dBody [data-act="approve"]'); a.wait_for_timeout(400)
    if a.is_visible('#dlg'): a.click('#dlgActs [data-dlg="ok"]'); a.wait_for_timeout(300)
    st = a.evaluate(f"JSON.parse(localStorage.mdw_orders).find(o=>o.id=='{oid}').status")
    check('approved -> PAID', st == 'PAID', st)
    nxt = a.text_content('#dTitle')
    check('auto-advanced to next pending', nxt != oid)
    # next pending is a flagged demo order: approve -> anomaly confirm dialog (in-page, not native)
    a.click('#dBody [data-act="approve"]'); a.wait_for_timeout(300)
    check('anomaly confirm is in-page dialog', a.is_visible('#dlg'))
    a.click('#dlgActs [data-dlg="cancel"]'); a.wait_for_timeout(200)
    check('cancel keeps pending', a.evaluate(f"JSON.parse(localStorage.mdw_orders).find(o=>o.id=='{nxt}').status") == 'PENDING_VERIFICATION')
    a.click('#dBody [data-act="reject-open"]'); a.click('#dBody [data-act="reject"]'); a.wait_for_timeout(300)
    check('reject -> REJECTED', a.evaluate(f"JSON.parse(localStorage.mdw_orders).find(o=>o.id=='{nxt}').status") == 'REJECTED')
    # ---- close drawer with the robust selector ----
    a.click('#dClose'); a.wait_for_timeout(350)
    check('#dClose closes drawer', not a.evaluate("drawer.classList.contains('open')"))
    # also: drawer header close via role/label
    a.click('#tabs [data-tab="PAID"]'); a.click(f'#rows tr[data-open="{oid}"] .c-id'); a.wait_for_timeout(300)
    a.fill('#trackNo', 'th0123456789'); a.click('#shipForm button[type=submit]'); a.wait_for_timeout(300)
    o = a.evaluate(f"JSON.parse(localStorage.mdw_orders).find(o=>o.id=='{oid}')")
    check('shipped with tracking', o['status'] == 'SHIPPED' and o['tracking']['no'] == 'TH0123456789')
    check('events CREATED→APPROVED→SHIPPED', [e['type'] for e in o['events']] == ['CREATED', 'APPROVED', 'SHIPPED'], str([e['type'] for e in o['events']]))
    a.click('#dBody [data-act="print"]'); a.wait_for_timeout(200)
    check('label for shipped order', 'ทดสอบ อีทูอี' in a.text_content('#printArea') and '10100' in a.inner_text('#printArea').replace('\n', ''))
    a.keyboard.press('Escape'); a.wait_for_timeout(350)
    check('Esc closes drawer', not a.evaluate("drawer.classList.contains('open')"))
    a.click('#tabs [data-tab="ALL"]')
    with a.expect_download() as dl: a.click('#exportCsv')
    csvtxt = open(dl.value.path(), encoding='utf-8-sig').read()
    check('CSV contains order', oid in csvtxt and 'TH0123456789' in csvtxt)
    a.screenshot(path=SH + '/e2e-final.png')

    # ---- F2: ratios + guides + safe area ----
    a.click('[data-page="slides"]'); a.wait_for_timeout(200)
    a.click('#slList li:first-child [data-sl="edit"]'); a.wait_for_timeout(300)
    Image.new('RGB', (2400, 1350), (40, 110, 150)).save(D + '/own2.jpg')
    a.set_input_files('#fFile', D + '/own2.jpg'); a.wait_for_function("edSlide().image.startsWith('data:')", timeout=15000); a.wait_for_timeout(200)
    r = a.evaluate("[...document.querySelectorAll('#crops .ph')].map(e=>{const b=e.getBoundingClientRect();return +(b.width/b.height).toFixed(2)})")
    check('F2 crops 0.6 / 1.24 / 2.0', abs(r[0] - .6) < .02 and abs(r[1] - 1.24) < .02 and abs(r[2] - 2) < .02, str(r))
    check('F2 guides on mobile + desktop only', a.locator('#crops [data-crop="mobile"] .crop-wide').count() == 1 and a.locator('#crops [data-crop="desktop"] .crop-wide').count() == 1 and a.locator('#crops [data-crop="tablet"] .crop-wide').count() == 0)
    # mobile guide: image 16:9 in 0.6 box (shows full height) vs 0.68 (shows full height, wider) -> guide wider than box? -> for R>both, width = .68/.6
    g = a.evaluate("(()=>{const g=document.querySelector('#crops [data-crop=mobile] .crop-wide'), b=g.parentElement.getBoundingClientRect(), r=g.getBoundingClientRect(); return [+(r.width/b.width).toFixed(3), +(r.height/b.height).toFixed(3)]})()")
    check('F2 mobile guide = 0.68 range', abs(g[0] - .68 / .6) < .02 and abs(g[1] - 1) < .02, str(g))
    g = a.evaluate("(()=>{const g=document.querySelector('#crops [data-crop=desktop] .crop-wide'), b=g.parentElement.getBoundingClientRect(), r=g.getBoundingClientRect(); return [+(r.width/b.width).toFixed(3), +(r.height/b.height).toFixed(3)]})()")
    check('F2 desktop guide = 2.67 range', abs(g[0] - 1) < .02 and abs(g[1] - 2 / 2.67) < .02, str(g))
    sb = [float(x) for x in a.get_attribute('#fp .fp-safe', 'data-box').split(',')]
    exp_w = .58 / (16 / 9); exp_h = (16 / 9) / 2.67
    check('F2 safe area = intersection 0.58..2.67', abs(sb[2] - exp_w) < .01 and abs(sb[3] - exp_h) < .01 and abs(sb[0] - (1 - exp_w) / 2) < .01, str(sb))
    check('F2 safe-area advice text', 'พื้นที่ปลอดภัย' in a.text_content('#safeTip'))
    fb = a.locator('#fp').bounding_box(); a.locator('#fp').scroll_into_view_if_needed(); fb = a.locator('#fp').bounding_box()
    a.mouse.click(fb['x'] + fb['width'] * .1, fb['y'] + fb['height'] * .5); a.wait_for_timeout(100)
    sb2 = [float(x) for x in a.get_attribute('#fp .fp-safe', 'data-box').split(',')]
    check('F2 safe area follows focal', sb2[0] < sb[0])
    pv = {}
    for k in ['desktop', 'tablet', 'mobile']:
        a.click(f'[data-pv="{k}"]'); a.wait_for_timeout(60); bb = a.locator('#pv').bounding_box(); pv[k] = round(bb['width'] / bb['height'], 2)
    check('F2 live preview toggle ratios', pv == {'desktop': 2.0, 'tablet': 1.24, 'mobile': 0.6}, str(pv))
    a.locator('.fp-wrap').scroll_into_view_if_needed(); a.wait_for_timeout(100)
    a.locator('.fp-wrap').screenshot(path=SH + '/F2-desk.png')
    a.keyboard.press('Escape')
    ctx.close()
    # 390 editor
    ctx = b.new_context(viewport={'width': 390, 'height': 844}); ctx.route('**/*', lambda r: r.abort() if r.request.url.startswith('http') else r.continue_())
    m = ctx.new_page(); m.on('pageerror', lambda e: errs.append('m ' + str(e))); m.goto(B + 'mongdoweb-admin.html')
    m.fill('#u', 'admin'); m.fill('#pw', 'demo1234'); m.click('#loginBtn'); m.wait_for_selector('#appView:not([hidden])')
    m.click('#sideBtn'); m.wait_for_timeout(250); m.click('[data-page="slides"]'); m.wait_for_timeout(200)
    m.click('#slList li:first-child [data-sl="edit"]'); m.wait_for_timeout(300)
    m.set_input_files('#fFile', D + '/own2.jpg'); m.wait_for_function("edSlide().image.startsWith('data:')", timeout=15000); m.wait_for_timeout(200)
    m.evaluate("document.querySelector('#fpBox').scrollIntoView({block:'start'})"); m.wait_for_timeout(150)
    m.screenshot(path=SH + '/F2-390.png')
    m.evaluate("document.querySelector('#crops').scrollIntoView({block:'start'})"); m.wait_for_timeout(150)
    m.screenshot(path=SH + '/F2-390-crops.png')
    check('F2 390 no overflow in editor', m.evaluate("document.querySelector('#slEdBody').scrollWidth <= document.querySelector('#slEdBody').clientWidth + 1"))
    for k in ['mobile', 'desktop']:
        m.click(f'[data-pv="{k}"]'); m.wait_for_timeout(80); m.locator('.ed-aside').screenshot(path=SH + f'/F2-pv-{k}-390.png')
    ctx.close(); b.close()
print('\nerrors:', errs or 'none')
f = [x for x in res if not x[1]]; print(f'{len(res) - len(f)}/{len(res)} passed'); [print('FAIL', x) for x in f]
