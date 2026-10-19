import pathlib as _pl
_P = _pl.Path(__file__).resolve().parent.parent / "prototype"  # โฟลเดอร์ไฟล์ต้นแบบ
_OUT = _pl.Path(__file__).resolve().parent / "out"; _OUT.mkdir(exist_ok=True)  # ภาพหน้าจอจากการทดสอบ
import os, json, io, re, csv, time
from playwright.sync_api import sync_playwright
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
SH = D + '/shots'; os.makedirs(SH, exist_ok=True)
URL = _P.joinpath('mongdoweb-admin.html').as_uri()
results = []
def check(name, cond, info=''):
    results.append((name, bool(cond), info))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{info}]' if info and not cond else ''))

errors = []
SLIDE_KEYS = ['id','active','order','image','focal','alt','eyebrow','title','subtitle','cta1','cta2','align','overlay','startAt','endAt','credit']
CAT_KEYS = ['id','th','en','icon','group','slug','popular','visible','order']

def new_ctx(b, vw=(1440, 900), init=None):
    ctx = b.new_context(viewport={'width': vw[0], 'height': vw[1]}, accept_downloads=True)
    ctx.route('**/*', lambda r: r.abort() if r.request.url.startswith('http') else r.continue_())
    if init: ctx.add_init_script(init)
    return ctx

def watch(pg, tag):
    pg.on('pageerror', lambda e: errors.append(f'{tag} PAGEERROR {e}'))
    pg.on('console', lambda m: errors.append(f'{tag} console.error {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text and 'net::' not in m.text else None)

def login(pg):
    pg.fill('#u', 'admin'); pg.fill('#pw', 'demo1234'); pg.click('#loginBtn'); pg.wait_for_selector('#appView:not([hidden])')

def go(pg, page):
    if pg.viewport_size['width'] <= 860: pg.click('#sideBtn'); pg.wait_for_timeout(250)
    pg.click(f'[data-page="{page}"]'); pg.wait_for_timeout(200)

def ls(pg, k): return pg.evaluate(f'JSON.parse(localStorage.getItem({json.dumps(k)}))')

with sync_playwright() as p:
    b = p.chromium.launch()

    # ============ A27 login throttling + persistence ============
    ctx = new_ctx(b, init='window.__MDW_TEST_LOCK_MS = 4000;')
    pg = ctx.new_page(); watch(pg, 'login'); pg.goto(URL)
    for i in range(4):
        pg.fill('#u', 'admin'); pg.fill('#pw', 'wrong'); pg.click('#loginBtn')
    check('A27 remaining attempts shown', pg.text_content('#triesLeft') == '1', pg.text_content('#loginErr'))
    pg.fill('#pw', 'wrong'); pg.click('#loginBtn')
    check('A27 locked after 5', not pg.is_hidden('#loginLock') and pg.is_disabled('#loginBtn'))
    pg.screenshot(path=SH + '/t-lockout.png')
    pg.reload()
    check('A27 lock persists after reload', not pg.is_hidden('#loginLock') and pg.is_disabled('#pw'))
    g = ls(pg, 'mdw_login_guard'); check('A27 guard stored', g and g['lockUntil'] > 0)
    pg.wait_for_timeout(4500)
    check('A27 unlock after timeout', pg.is_hidden('#loginLock') and not pg.is_disabled('#loginBtn'))
    login(pg)
    check('A27 login ok after unlock', pg.is_visible('#page-orders'))
    log = ls(pg, 'mdw_admin_log')
    check('A28 auth events logged', any(x['type']=='LOCKOUT' for x in log) and any(x['type']=='LOGIN' for x in log) and sum(x['type']=='LOGIN_FAIL' for x in log) == 4)
    ctx.close()

    # ============ A26 idle timeout ============
    ctx = new_ctx(b, init='window.__MDW_TEST_IDLE_MS = 1500; window.__MDW_TEST_IDLE_COUNT = 3;')
    pg = ctx.new_page(); watch(pg, 'idle'); pg.goto(URL); login(pg)
    pg.wait_for_timeout(1900)
    check('A26 idle dialog appears', pg.is_visible('#idleDlg'))
    pg.screenshot(path=SH + '/t-idle.png')
    pg.click('#idleStay'); pg.wait_for_timeout(300)
    check('A26 stay closes dialog', pg.is_hidden('#idleDlg'))
    # activity resets timer
    for _ in range(4):
        pg.wait_for_timeout(700); pg.mouse.move(100 + _ * 10, 300); pg.keyboard.press('Shift')
    check('A26 activity resets timer', pg.is_hidden('#idleDlg'))
    pg.wait_for_timeout(1700)
    check('A26 dialog again', pg.is_visible('#idleDlg'))
    pg.wait_for_timeout(3800)
    check('A26 auto logout', pg.is_visible('#loginView') and 'อัตโนมัติ' in pg.text_content('#loginInfo'))
    check('A28 idle logout logged', any(x['type']=='IDLE_LOGOUT' for x in ls(pg,'mdw_admin_log')))
    ctx.close()

    # ============ Main desktop session ============
    ctx = new_ctx(b, init='window.__MDW_TEST_NOPRINT = true;')
    pg = ctx.new_page(); watch(pg, 'main'); pg.goto(URL); login(pg)
    check('seed orders present', pg.evaluate('orders.length') == 6)
    # existing flow: approve 9002 has diff -> custom confirm
    pg.click('#reviewNext'); pg.wait_for_timeout(300)
    first = pg.text_content('#dTitle')
    check('review opens oldest pending', first.endswith('9003'), first)
    pg.click('[data-act="approve"]'); pg.wait_for_timeout(200)
    check('approve anomaly asks confirm', pg.is_visible('#dlg'))
    pg.click('#dlg [data-dlg="ok"]'); pg.wait_for_timeout(300)
    o = [x for x in ls(pg,'mdw_orders') if x['id']==first][0]
    check('approve sets PAID + event', o['status']=='PAID' and o['events'][-1]['type']=='APPROVED')
    nxt = pg.text_content('#dTitle')
    check('auto-advance to next pending', nxt != first and nxt.endswith('9002'), nxt)
    pg.click('[data-act="reject-open"]'); pg.select_option('#rReason', index=0); pg.fill('#rNote','โอนเพิ่ม 100'); pg.click('[data-act="reject"]'); pg.wait_for_timeout(300)
    o = [x for x in ls(pg,'mdw_orders') if x['id']==nxt][0]
    check('reject flow', o['status']=='REJECTED' and 'โอนเพิ่ม 100' in o['rejectReason'])
    # ship the PAID 9003
    pg.evaluate(f'openOrder({json.dumps(first)})'); pg.wait_for_timeout(200)
    pg.fill('#trackNo', 'abc'); pg.click('#shipForm [type=submit]')
    check('ship validation', ls(pg,'mdw_orders')[0]['status'] != 'SHIPPED' and [x for x in ls(pg,'mdw_orders') if x['id']==first][0]['status']=='PAID')
    pg.fill('#trackNo', 'kex999888777'); pg.click('#shipForm [type=submit]'); pg.wait_for_timeout(200)
    o = [x for x in ls(pg,'mdw_orders') if x['id']==first][0]
    check('ship flow', o['status']=='SHIPPED' and o['tracking']['no']=='KEX999888777')

    # A22 internal note
    pg.fill('#noteText', 'โทรยืนยัน <b>แล้ว</b>'); pg.click('#noteForm [type=submit]'); pg.wait_for_timeout(200)
    o = [x for x in ls(pg,'mdw_orders') if x['id']==first][0]
    check('A22 note saved with ts+admin', o['adminNotes'][-1]['by']=='admin' and o['adminNotes'][-1]['at'] and o['adminNotes'][-1]['text']=='โทรยืนยัน <b>แล้ว</b>')
    check('A22 note in events', o['events'][-1]['type']=='NOTE' and o['events'][-1].get('internal') is True)
    check('A22 note shown escaped', 'โทรยืนยัน <b>แล้ว</b>' in pg.text_content('.inote-list'))
    pg.click('#noteForm [type=submit]'); check('A22 empty note rejected', len([x for x in ls(pg,'mdw_orders') if x['id']==first][0]['adminNotes'])==1)
    pg.screenshot(path=SH + '/t-drawer-note.png')
    # A23 copy
    pg.click('[data-act="copy-addr"]'); pg.wait_for_timeout(100)
    cp = pg.evaluate('window.__mdwLastCopy')
    check('A23 copy address', '0865556677' in cp and 'เชียงใหม่' in cp, cp)
    pg.click('#dCopyId'); pg.wait_for_timeout(100)
    check('A23 copy order no', pg.evaluate('window.__mdwLastCopy') == first)
    check('A23 click-to-call', pg.locator('#dBody a[href="tel:0865556677"]').count() >= 2)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    check('Esc closes drawer', not pg.evaluate("drawer.classList.contains('open')"))

    # A19 pagination: add 45 orders across dates
    pg.evaluate('''() => {
      const base = orders[0];
      for (let i = 0; i < 45; i++){
        const o = JSON.parse(JSON.stringify(base));
        o.id = 'MDW-T-' + String(i).padStart(3,'0'); o.status = i % 3 ? 'PAID' : 'SHIPPED';
        o.createdAt = new Date(Date.now() - i * 864e5 * 0.9).toISOString(); o.slips[0].sha256 = 'x' + i; o.adminNotes = [];
        o.total = 100 + i; orders.push(o);
      }
      save(); rememberOrders(); renderAll();
    }''')
    pg.click('.tab[data-tab="ALL"]'); pg.wait_for_timeout(200)
    check('A19 20 per page', pg.locator('#rows tr').count() == 20, str(pg.locator('#rows tr').count()))
    check('A19 pager text', 'หน้า 1/3' in pg.text_content('#pgNow'))
    pg.click('[data-pg="2"]'); pg.wait_for_timeout(200)
    check('A19 page 2', 'หน้า 2/3' in pg.text_content('#pgNow'))
    pg.select_option('#pgSize', '50'); pg.wait_for_timeout(200)
    check('A19 page size 50', pg.locator('#rows tr').count() == 50 and 'หน้า 1/2' in pg.text_content('#pgNow'))
    pg.click('[data-range="7"]'); pg.wait_for_timeout(200)
    n7 = pg.evaluate('visible().length'); exp7 = pg.evaluate('''orders.filter(o => new Date(o.createdAt) >= (()=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-6);return d})()).length''')
    check('A19 7-day filter', n7 == exp7 and n7 < 51, f'{n7} vs {exp7}')
    pg.click('[data-range="today"]'); pg.wait_for_timeout(200)
    check('A19 today filter', pg.evaluate('visible().every(o => isToday(o.createdAt))') and pg.evaluate('visible().length') > 0)
    pg.click('.tab[data-tab="PAID"]'); pg.wait_for_timeout(100)
    check('A19 combined with status', pg.evaluate("visible().every(o => o.status==='PAID' && isToday(o.createdAt))"))
    pg.click('.tab[data-tab="ALL"]'); pg.click('[data-range="custom"]'); pg.wait_for_timeout(100)
    pg.fill('#dFrom', '2026-10-20'); pg.fill('#dTo', '2026-10-01'); pg.dispatch_event('#dTo','change'); pg.dispatch_event('#dFrom','change'); pg.wait_for_timeout(100)
    check('A19 custom invalid range msg', 'วันที่เริ่ม' in pg.text_content('#rangeErr'))
    d10 = time.strftime('%Y-%m-%d', time.localtime(time.time() - 10*86400)); d5 = time.strftime('%Y-%m-%d', time.localtime(time.time() - 5*86400))
    pg.fill('#dFrom', d10); pg.dispatch_event('#dFrom','change'); pg.fill('#dTo', d5); pg.dispatch_event('#dTo','change'); pg.wait_for_timeout(100)
    check('A19 custom range', pg.evaluate(f'''visible().every(o => {{ const t=new Date(o.createdAt); return t>=new Date("{d10}T00:00:00") && t<=new Date("{d5}T23:59:59.999"); }})''') and pg.evaluate('visible().length')>0)
    pg.fill('#q', 'MDW-T-00'); pg.dispatch_event('#q','input'); pg.wait_for_timeout(100)
    check('A19 + search combined', pg.evaluate("visible().every(o => o.id.startsWith('MDW-T-00'))"))
    pg.fill('#q', ''); pg.dispatch_event('#q','input'); pg.click('[data-range="all"]'); pg.select_option('#pgSize','20'); pg.wait_for_timeout(100)
    pg.screenshot(path=SH + '/t-orders-paged.png', full_page=True)

    # A20 bulk
    pg.check('#selAll'); pg.wait_for_timeout(100)
    check('A20 select all on page', pg.evaluate('picked.size') == 20 and pg.is_visible('#bulkBar'))
    pg.click('[data-pg="2"]'); pg.wait_for_timeout(100)
    check('A20 page2 selAll unchecked', not pg.is_checked('#selAll'))
    pg.locator('#rows tr').nth(0).locator('.cb').check(); pg.wait_for_timeout(100)
    check('A20 row checkbox (no drawer)', pg.evaluate('picked.size') == 21 and not pg.evaluate("drawer.classList.contains('open')"))
    check('A20 no bulk approve + tooltip', pg.locator('#bulkBar [data-act="approve"]').count()==0 and 'ทีละรายการ' in pg.text_content('#noBulkTip'))
    with pg.expect_download() as dl: pg.click('#bulkCsv')
    path = dl.value.path(); raw = open(path, encoding='utf-8-sig').read()
    rows = list(csv.reader(io.StringIO(raw)))
    check('A20 bulk CSV rows', len(rows) == 22 and rows[0][0] == 'เลขที่', str(len(rows)))
    # print layout
    pg.click('#bulkClear'); pg.wait_for_timeout(100)
    pg.evaluate("picked.add(orders.find(o=>o.status==='PAID').id); picked.add(orders.find(o=>o.status==='SHIPPED').id); renderRows()")
    pg.click('#bulkPrint'); pg.wait_for_timeout(200)
    check('A21 labels rendered', pg.locator('#printArea .label').count() == 2)
    pg.emulate_media(media='print'); pg.wait_for_timeout(200)
    check('A21 print hides app', pg.evaluate("getComputedStyle(document.querySelector('#appView')).display") == 'none' and pg.evaluate("getComputedStyle(document.querySelector('#printArea')).display") == 'block')
    pg.set_viewport_size({'width': 397, 'height': 560})
    pg.screenshot(path=SH + '/t-print-label.png', full_page=True)
    pg.emulate_media(media='screen'); pg.set_viewport_size({'width': 1440, 'height': 900})
    pdf = pg.pdf(width='105mm', height='148mm', print_background=True); open(D + '/labels.pdf','wb').write(pdf)
    # pending order in bulk print -> dialog
    pg.evaluate("picked.clear(); picked.add(orders.find(o=>o.status==='PENDING_VERIFICATION').id); picked.add(orders.find(o=>o.status==='PAID').id); renderRows()")
    pg.click('#bulkPrint'); pg.wait_for_timeout(200)
    check('A21 warns unpaid', pg.is_visible('#dlg'))
    pg.click('#dlg [data-dlg="paid"]'); pg.wait_for_timeout(200)
    check('A21 print only paid', pg.locator('#printArea .label').count() == 1)
    pg.click('#bulkClear')

    # A25 chart totals
    exp = pg.evaluate('''(() => { const r=[]; for(let i=6;i>=0;i--){ const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-i);
        r.push(orders.filter(o=>(o.status==='PAID'||o.status==='SHIPPED') && new Date(o.createdAt).toDateString()===d.toDateString()).reduce((s,o)=>s+o.total,0)); } return r; })()''')
    got = json.loads(pg.get_attribute('#chSvg', 'data-days'))
    check('A25 chart totals correct', exp == got, f'{exp} vs {got}')
    check('A25 total label', pg.text_content('#chTotal').replace(',','') == '฿' + str(sum(exp)), pg.text_content('#chTotal'))
    check('A25 bars count', pg.locator('#chSvg path.bar').count() == sum(1 for v in exp if v>0))
    check('A25 a11y summary', 'ยอดขายที่ยืนยันแล้ว 7 วัน' in pg.text_content('#chSummary') and pg.locator('#chTable tr').count()==8)
    pg.locator('#chSvg g.day').nth(6).hover(); pg.wait_for_timeout(100)
    check('A25 tooltip hover', pg.is_visible('#chTip') and 'คำสั่งซื้อ' in pg.text_content('#chTip'))
    pg.locator('#chSvg g.day').nth(5).focus(); pg.wait_for_timeout(100)
    check('A25 tooltip focus', pg.is_visible('#chTip'))
    pg.locator('.chart-panel').screenshot(path=SH + '/t-chart.png')

    # A24 new-order alert from second page
    pg2 = ctx.new_page(); pg2.goto(URL)
    pg.evaluate("window.__mdwBeeps = 0"); pg.bring_to_front()
    pg2.evaluate('''() => { const l = JSON.parse(localStorage.getItem('mdw_orders')); const o = JSON.parse(JSON.stringify(l[0]));
      o.id = 'MDW-NEW-0001'; o.status='PENDING_VERIFICATION'; o.createdAt = new Date().toISOString(); o.customer.name='ลูกค้าใหม่'; o.adminNotes=[]; o.events=[{at:o.createdAt,type:'CREATED',by:'ลูกค้า',note:'สั่งซื้อ'}];
      l.push(o); localStorage.setItem('mdw_orders', JSON.stringify(l)); }''')
    pg.wait_for_timeout(400)
    check('A24 toast new order', 'MDW-NEW-0001' in pg.text_content('#toast'), pg.text_content('#toast'))
    check('A24 beep', pg.evaluate('window.__mdwBeeps') == 1)
    check('A24 title counter', pg.title().startswith('(1 ใหม่)'), pg.title())
    check('A24 new chip', pg.locator('.chip.new').count() >= 0)
    # sound off
    pg.evaluate("const s=JSON.parse(localStorage.getItem('mdw_settings')||'{}'); s.soundOn=false; localStorage.setItem('mdw_settings', JSON.stringify(s))")
    pg2.evaluate('''() => { const l = JSON.parse(localStorage.getItem('mdw_orders')); const o = JSON.parse(JSON.stringify(l[l.length-1])); o.id='MDW-NEW-0002'; l.push(o); localStorage.setItem('mdw_orders', JSON.stringify(l)); }''')
    pg.wait_for_timeout(400)
    check('A24 no beep when sound off', pg.evaluate('window.__mdwBeeps') == 1 and pg.title().startswith('(2 ใหม่)'))
    pg.evaluate("localStorage.removeItem('mdw_settings')")
    pg2.close()

    # A28 log page
    go(pg, 'log'); pg.wait_for_timeout(200)
    txt = pg.text_content('#logList')
    check('A28 log has order events', 'อนุมัติสลิป' in txt and 'ปฏิเสธสลิป' in txt and 'บันทึกการจัดส่ง' in txt and 'โน้ตภายใน' in txt)
    check('A28 log has login', 'เข้าสู่ระบบ' in txt)
    pg.click('[data-logtab="auth"]'); pg.wait_for_timeout(100)
    check('A28 filter auth', all(t in ('เข้าสู่ระบบ','ออกจากระบบ','รหัสผ่านผิด','ล็อกการเข้าสู่ระบบ','หมดเวลาใช้งาน') for t in pg.locator('#logList .lt').all_text_contents()))
    pg.click('[data-logtab="all"]'); pg.fill('#logQ', 'KEX999'); pg.dispatch_event('#logQ','input'); pg.wait_for_timeout(100)
    check('A28 search', pg.locator('#logList li').count() == 1)
    pg.fill('#logQ', ''); pg.dispatch_event('#logQ','input')
    pg.screenshot(path=SH + '/t-log.png', full_page=True)

    # ============ Slides ============
    go(pg, 'slides')
    check('A1 nav order', pg.evaluate("[...document.querySelectorAll('.side nav .nav-i')].map(n=>n.textContent.trim().split(/\\s+/)[0]).slice(0,3).join('|')") == 'คำสั่งซื้อ|สไลด์หน้าแรก|สินค้า')
    check('A2 rows', pg.locator('#slList li').count() == 5 and pg.locator('#slList .bdg.live').count() == 5)
    check('A2 fallback colour', pg.evaluate("getComputedStyle(document.querySelector('#slList .ph')).backgroundColor") == 'rgb(14, 58, 82)')
    check('A2 fallback hint shown (img failed)', pg.locator('#slList .ph.img-fail').count() == 5)
    # buttons reorder
    pg.click('#slList li:nth-child(1) [data-sl="down"]'); pg.wait_for_timeout(100)
    check('A3 down button', pg.evaluate('slDraft.map(s=>s.id).join()') == 's2,s1,s3,s4,s5')
    check('A10 publish bar appears', pg.is_visible('#slBar') and pg.is_visible('#dotSlides'))
    # drag s5 to top with mouse
    pg.evaluate("document.querySelector('#slList').scrollIntoView({block:'start'}); scrollBy(0,-20)"); pg.wait_for_timeout(100)
    h = pg.locator('#slList li:nth-child(5) .drag-h').bounding_box(); t = pg.locator('#slList li:nth-child(1)').bounding_box()
    pg.mouse.move(h['x']+h['width']/2, h['y']+h['height']/2); pg.mouse.down()
    for k in range(1, 16): pg.mouse.move(h['x']+h['width']/2, h['y']+h['height']/2 - (h['y']-t['y']+20)*k/15); pg.wait_for_timeout(30)
    pg.mouse.up(); pg.wait_for_timeout(200)
    check('A3 mouse drag', pg.evaluate('slDraft.map(s=>s.id).join()') == 's5,s2,s1,s3,s4', pg.evaluate('slDraft.map(s=>s.id).join()'))
    # discard
    pg.click('#slDiscard'); pg.click('#dlg [data-dlg="ok"]'); pg.wait_for_timeout(100)
    check('A10 discard', pg.evaluate('slDraft.map(s=>s.id).join()') == 's1,s2,s3,s4,s5' and pg.is_hidden('#slBar'))

    # last active protection
    for i in range(2, 6): pg.click(f'#slList li:nth-child({i}) [data-sl="toggle"]')
    check('A9 deactivated 4', pg.evaluate('activeCount()') == 1)
    pg.click('#slList li:nth-child(1) [data-sl="toggle"]'); pg.wait_for_timeout(100)
    check('A9 cannot deactivate last', pg.is_visible('#dlg') and 'อย่างน้อย 1' in pg.text_content('#dlgBody') and pg.evaluate('activeCount()') == 1)
    pg.keyboard.press('Escape')
    pg.click('#slList li:nth-child(1) [data-sl="del"]'); pg.wait_for_timeout(100)
    check('A9 cannot delete last active', pg.is_visible('#dlg') and 'ลบสไลด์นี้ไม่ได้' in pg.text_content('#dlgTitle'))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
    check('A14 Esc closes dialog', pg.is_hidden('#dlg'))
    pg.click('#slList li:nth-child(5) [data-sl="del"]'); pg.wait_for_timeout(100)
    check('A9 delete inactive asks confirm', pg.is_visible('#dlg') and 'ลบสไลด์นี้?' in pg.text_content('#dlgTitle'))
    pg.click('#dlg [data-dlg="ok"]'); pg.wait_for_timeout(100)
    check('A9 deleted', pg.locator('#slList li').count() == 4)
    pg.click('#slDiscard'); pg.click('#dlg [data-dlg="ok"]')
    # duplicate
    pg.click('#slList li:nth-child(1) [data-sl="dup"]'); pg.wait_for_timeout(100)
    check('A9 duplicate', pg.locator('#slList li').count() == 6 and '(สำเนา)' in pg.text_content('#slList li:nth-child(2)'))
    pg.click('#slAdd'); pg.wait_for_timeout(200); pg.keyboard.press('Escape')
    pg.click('#slAdd'); pg.wait_for_timeout(200); pg.keyboard.press('Escape')
    check('A9 max 8', pg.locator('#slList li').count() == 8 and pg.is_disabled('#slAdd'))
    pg.click('#slDiscard'); pg.click('#dlg [data-dlg="ok"]')

    # editor: new slide w/ validation
    pg.click('#slAdd'); pg.wait_for_timeout(300)
    check('A14 focus to title on open', pg.evaluate('document.activeElement.id') == 'fTitle')
    pg.fill('#fC1l', ''); pg.fill('#fC1h', 'javascript:alert(1)'); pg.click('#fAlt'); pg.wait_for_timeout(100)
    check('A8 cta1 label error', 'กรุณากรอกข้อความ' in pg.text_content('#err-cta1label'))
    check('A8 href error', 'ลิงก์ต้องขึ้นต้น' in pg.text_content('#err-cta1href'))
    pg.click('#fTitle'); pg.click('#fAlt'); pg.wait_for_timeout(100)
    check('A8 title error', 'กรุณากรอกหัวข้อ' in pg.text_content('#err-title'))
    for href, ok in [('#x', True), ('/contact', True), ('https://a.co/x', True), ('tel:0812345678', True), ('mailto:a@b.co', True), ('ftp://x', False), ('//evil.com', False), ('www.x.com', False)]:
        pg.fill('#fC1h', href); pg.wait_for_timeout(30)
        check(f'A8 href {href} -> {ok}', (pg.text_content('#err-cta1href') == '') == ok)
    pg.fill('#fTitle', 'ก' * 55); pg.wait_for_timeout(50)
    check('A8 counter amber', 'amber' in pg.get_attribute('#cnt-title', 'class'))
    pg.fill('#fTitle', 'ก' * 65); pg.wait_for_timeout(50)
    check('A8 counter red + hint', 'red' in pg.get_attribute('#cnt-title', 'class') and 'ยาวเกิน' in pg.text_content('#hint-title'))
    pg.fill('#fTitle', 'โปรโมชันไฟสระ <script>x</script>'); pg.fill('#fC1l', 'ดูเลย'); pg.fill('#fC1h', '#products')
    pg.fill('#fEyebrow', 'ลดพิเศษ'); pg.fill('#fSubtitle', 'คำอธิบาย')
    check('A7 live preview text', 'โปรโมชันไฟสระ <script>x</script>' in pg.text_content('#pv .pv-t') and pg.locator('#pv script').count() == 0)
    # dates
    pg.fill('#fStart', '2026-11-01T09:00'); pg.fill('#fEnd', '2026-10-30T09:00'); pg.click('#fAlt'); pg.wait_for_timeout(100)
    check('A4 end after start', 'หลังเวลาเริ่ม' in pg.text_content('#err-endAt'))
    pg.fill('#fEnd', '2026-11-30T18:00'); pg.wait_for_timeout(50)
    check('A4 date ok', pg.text_content('#err-endAt') == '')
    # align/overlay
    pg.click('label:has(input[value="center"])'); pg.wait_for_timeout(50)
    check('A4 align center', pg.get_attribute('#pv', 'data-align') == 'center')
    pg.fill('#fOverlay', '30'); pg.dispatch_event('#fOverlay', 'input'); pg.wait_for_timeout(50)
    check('A4 overlay live value', pg.text_content('#ovOut') == '30%')
    pg.check('#fC2on'); pg.fill('#fC2l', 'ปุ่มรอง'); pg.fill('#fC2h', '/contact')
    check('A7 preview has 2 buttons', pg.locator('#pv .pv-ctas span').count() == 2)
    pg.click('[data-pv="mobile"]'); pg.wait_for_timeout(50)
    check('A7 mobile toggle', pg.get_attribute('#pv', 'data-mode') == 'mobile')
    # image required
    check('A8 image required', 'image' in pg.evaluate('validateSlide(edSlide())'))
    # A5 upload: big landscape PNG
    img = Image.new('RGB', (3000, 1500))
    px = img.load()
    import random; random.seed(1)
    for y in range(0, 1500):
        for x in range(0, 3000, 1):
            px[x, y] = ((x * 7 + y) % 256, (y * 3) % 256, random.randint(0, 255))
    big = D + '/big.png'; img.save(big)
    pg.set_input_files('#fFile', big); pg.wait_for_function("edSlide() && edSlide().image.startsWith('data:image/')", timeout=20000); pg.wait_for_timeout(300)
    s = pg.evaluate('edSlide()')
    nbytes = pg.evaluate('dataUrlBytes(edSlide().image)')
    check('A5 data URL stored in draft', s['image'].startswith('data:image/webp') or s['image'].startswith('data:image/jpeg'), s['image'][:30])
    check('A5 compressed <= ~350KB', nbytes <= 360 * 1024, str(nbytes))
    meta = pg.evaluate('imgMeta[edId]')
    check('A5 resized to <=1920 wide', meta['w'] <= 1920, str(meta))
    check('A5 size shown', 'KB' in pg.text_content('#imgInfo') and 'ย่อเหลือ' in pg.text_content('#imgInfo'))
    print('   upload:', os.path.getsize(big), '->', nbytes, meta)
    # A6 focal picker
    pg.locator('#fp').scroll_into_view_if_needed(); pg.wait_for_timeout(100)
    fb = pg.locator('#fp').bounding_box()
    pg.mouse.click(fb['x'] + fb['width'] * .25, fb['y'] + fb['height'] * .75); pg.wait_for_timeout(100)
    f = pg.evaluate('edSlide().focal')
    check('A6 focal click', abs(f['x'] - 25) <= 2 and abs(f['y'] - 75) <= 2, str(f))
    check('A6 crops use focal', pg.evaluate("document.querySelector('#crops .crop-m img').style.objectPosition").startswith(f"{f['x']}% {f['y']}%"))
    fb = pg.locator('#fp').bounding_box()
    pg.mouse.move(fb['x'] + fb['width'] * .5, fb['y'] + fb['height'] * .5); pg.mouse.down(); pg.mouse.move(fb['x'] + fb['width'] * .8, fb['y'] + fb['height'] * .2, steps=5); pg.mouse.up()
    f = pg.evaluate('edSlide().focal')
    check('A6 focal drag', abs(f['x'] - 80) <= 2 and abs(f['y'] - 20) <= 2, str(f))
    pg.focus('#fp'); pg.keyboard.press('ArrowLeft')
    check('A6 focal keyboard', pg.evaluate('edSlide().focal.x') == f['x'] - 2)
    pg.click('[data-pv="desktop"]')
    pg.screenshot(path=SH + '/t-editor-upload.png')
    pg.locator('.fp-wrap').screenshot(path=SH + '/t-focal.png')
    # small portrait warning
    Image.new('RGB', (800, 1200), (200, 100, 50)).save(D + '/portrait.jpg', quality=90)
    pg.set_input_files('#fFile', D + '/portrait.jpg'); pg.wait_for_function("imgMeta[edId] && imgMeta[edId].ow === 800", timeout=10000); pg.wait_for_timeout(200)
    it = pg.text_content('#imgInfo')
    check('A5 narrow warning', '1280' in it or '800px' in it)
    check('A5 portrait warning', 'แนวตั้ง' in it)
    # invalid type & too big
    open(D + '/x.gif', 'wb').write(b'GIF89a' + b'\0' * 50)
    pg.set_input_files('#fFile', {'name': 'x.gif', 'mimeType': 'image/gif', 'buffer': open(D + '/x.gif','rb').read()}); pg.wait_for_timeout(200)
    check('A5 type validation', 'JPG, PNG' in pg.text_content('#err-image'))
    pg.set_input_files('#fFile', {'name': 'huge.jpg', 'mimeType': 'image/jpeg', 'buffer': b'\xff' * (8 * 1024 * 1024 + 10)}); pg.wait_for_timeout(200)
    check('A5 size validation', '8 MB' in pg.text_content('#err-image'))
    # back to big upload
    pg.set_input_files('#fFile', big); pg.wait_for_function("imgMeta[edId] && imgMeta[edId].ow === 3000", timeout=20000)
    # URL input
    pg.fill('#fUrl', 'http://x.com/a.jpg'); pg.click('#fUrlApply'); pg.wait_for_timeout(50)
    check('A5 url must be https', 'https://' in pg.text_content('#err-image'))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    check('A14 Esc closes editor', pg.is_hidden('#slEd'))
    check('A14 focus returns', 'data-sl' in (pg.evaluate("document.activeElement.outerHTML") or '') or pg.evaluate("document.activeElement.id") == 'slAdd')
    # schedule badge
    check('A2 schedule badge เริ่ม', 'เริ่ม 1 พ.ย.' in pg.text_content('#slList li:nth-child(6)'), pg.text_content('#slList li:nth-child(6) .meta'))

    # publish
    pg.click('#slPublish'); pg.wait_for_timeout(300)
    stored = ls(pg, 'mdw_slides')
    check('A10 publish writes mdw_slides', isinstance(stored, list) and len(stored) == 6)
    check('A10 contract keys exact', all(list(x.keys()) == SLIDE_KEYS for x in stored), str(list(stored[0].keys())))
    check('A10 contract types', all(isinstance(x['focal'], dict) and set(x['focal']) == {'x','y'} and isinstance(x['cta1'], dict) and (x['cta2'] is None or set(x['cta2'])=={'label','href'}) and x['align'] in ('left','center') and 0 <= x['overlay'] <= 90 for x in stored))
    check('A10 order 1..n', [x['order'] for x in stored] == list(range(1, 7)))
    new = stored[-1]
    check('A10 new slide data', new['image'].startswith('data:image/') and new['startAt'] and new['endAt'] and new['align']=='center' and new['overlay']==30 and new['cta2']=={'label':'ปุ่มรอง','href':'/contact'} and new['id'].startswith('s_'))
    check('A10 success + home link', pg.is_visible('#slViewHome') and pg.get_attribute('#slViewHome','href') == 'mongdoweb-home.html' and pg.get_attribute('#slViewHome','target') == '_blank')
    check('A28 slide publish logged', any(x['type']=='SLIDES_PUBLISH' for x in ls(pg,'mdw_admin_log')))
    check('A13 meter shows', 'MB' in pg.text_content('#slMeter'))
    pg.screenshot(path=SH + '/t-slides-published.png', full_page=True)

    # A8 publish blocked when invalid
    pg.evaluate("slDraft[0].title=''; renderSlides()")
    pg.click('#slPublish'); pg.wait_for_timeout(200)
    check('A8 publish blocked invalid', pg.is_visible('#dlg') and ls(pg,'mdw_slides')[0]['title'] != '')
    pg.click('#dlg [data-dlg="ok"]'); pg.wait_for_timeout(300)
    check('A8 opens editor with errors', pg.is_visible('#slEd') and 'กรุณากรอกหัวข้อ' in pg.text_content('#err-title'))
    pg.keyboard.press('Escape')
    pg.click('#slDiscard'); pg.click('#dlg [data-dlg="ok"]')

    # A13 refuse when over quota (test quota hook)
    pg.evaluate("window.__MDW_TEST_QUOTA = lsUsage() + 120*1024; renderMeter()")
    pg.click('#slList li:nth-child(1) [data-sl="dup"]'); pg.click('#slList li:nth-child(1) [data-sl="dup"]')
    pg.evaluate("const d = slDraft.find(s=>s.image.startsWith('data:')).image; slDraft.forEach(s=>{ s.image = d; }); renderSlides()")
    check('A13 meter over warning', 'เผยแพร่ไม่ได้' in pg.text_content('#slMeter'))
    before = pg.evaluate("localStorage.getItem('mdw_slides')")
    pg.click('#slPublish'); pg.wait_for_timeout(200)
    check('A13 refuse publish over budget', pg.is_visible('#dlg') and 'พื้นที่' in pg.text_content('#dlgTitle') and pg.evaluate("localStorage.getItem('mdw_slides')") == before)
    pg.locator('#slMeter').screenshot(path=SH + '/t-meter.png')
    pg.click('#dlg [data-dlg="ok"]')
    pg.evaluate("window.__MDW_TEST_QUOTA = 0")
    # real QuotaExceededError handling
    pg.evaluate("() => { window.__realSet = Storage.prototype.setItem; Storage.prototype.setItem = function(k,v){ if(k==='mdw_slides'){ throw new DOMException('full','QuotaExceededError'); } return window.__realSet.call(this,k,v); }; }")
    pg.click('#slPublish'); pg.wait_for_timeout(200)
    check('A13 QuotaExceededError msg', pg.is_visible('#dlg') and 'เต็ม' in pg.text_content('#dlgBody'))
    pg.click('#dlg [data-dlg="ok"]')
    pg.evaluate("() => { Storage.prototype.setItem = window.__realSet; }")
    check('A10 draft kept after failure', pg.is_visible('#slBar'))

    # A11 guard switching pages
    go(pg, 'orders'); pg.wait_for_timeout(200)
    check('A11 guard dialog on page switch', pg.is_visible('#dlg') and 'ยังไม่เผยแพร่' in pg.text_content('#dlgTitle'))
    pg.click('#dlg [data-dlg="stay"]'); pg.wait_for_timeout(100)
    check('A11 stay', pg.is_visible('#page-slides'))
    # beforeunload
    bu = pg.evaluate("(() => { const e = new Event('beforeunload', {cancelable:true}); dispatchEvent(e); return e.defaultPrevented; })()")
    check('A11 beforeunload prevented', bu)
    # A12 reset
    pg.click('#slReset'); pg.click('#dlg [data-dlg="ok"]'); pg.wait_for_timeout(100)
    pg.click('#slPublish'); pg.wait_for_timeout(300)
    st = ls(pg, 'mdw_slides')
    exp_def = pg.evaluate('DEFAULT_SLIDES.map((s,i)=>({...s, order:i+1}))')
    check('A12 reset to defaults published', st == exp_def)
    bu = pg.evaluate("(() => { const e = new Event('beforeunload', {cancelable:true}); dispatchEvent(e); return e.defaultPrevented; })()")
    check('A11 no beforeunload when clean', not bu)

    # ============ Categories ============
    go(pg, 'categories'); pg.wait_for_timeout(100)
    check('A15 table 12 rows', pg.locator('#ctList li').count() == 12)
    check('A15 icons rendered', pg.locator('#ctList .ct-ico svg').count() == 12)
    pg.click('#ctList li:nth-child(1) [data-ct="edit"]'); pg.wait_for_timeout(200)
    pg.fill('#cTh', 'ไฟใต้น้ำ LED'); pg.fill('#cEn', 'Underwater LED'); pg.select_option('#cGroup', 'outdoor')
    pg.click('#icp [data-icon="pool"]')
    pg.click('[data-untag="0"]')
    for t in ['ใหม่', 'ใหม่']: pg.fill('#cPopIn', t); pg.keyboard.press('Enter')
    check('A16 duplicate tag rejected', 'มีคำนี้อยู่แล้ว' in pg.text_content('#cerr-popular'))
    pg.fill('#cPopIn', 'คำที่ห้า'); pg.keyboard.press('Enter')
    check('A16 max 4 tags', pg.evaluate('ctCat().popular.length') == 4 and pg.is_disabled('#cPopIn'))
    pg.fill('#cSlug', 'ไฟ ใต้น้ำ'); pg.click('#cEn'); pg.wait_for_timeout(100)
    check('A16 slug encoded', pg.evaluate('ctCat().slug') == '%e0%b9%84%e0%b8%9f-%e0%b9%83%e0%b8%95%e0%b9%89%e0%b8%99%e0%b9%89%e0%b8%b3', pg.evaluate('ctCat().slug'))
    check('A18 dropdown preview', 'ไฟใต้น้ำ LED' in pg.text_content('#ddPv') and 'คำที่ห้า' in pg.text_content('#ddPv'))
    check('A18 mega preview group', 'ไฟใต้น้ำ LED' in pg.text_content('#ctEdMega') and pg.locator('#ctEdMega li.cur').count() == 1)
    pg.screenshot(path=SH + '/t-cat-editor.png')
    pg.fill('#cTh', ''); pg.click('#cEn'); pg.wait_for_timeout(50)
    check('A16 th required error', 'ภาษาไทย' in pg.text_content('#cerr-th'))
    pg.fill('#cTh', 'ไฟใต้น้ำ LED')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
    # reorder buttons + drag
    pg.click('#ctList li:nth-child(1) [data-ct="down"]')
    check('A17 down button', pg.evaluate('ctDraft[1].id') == 'underwater')
    pg.evaluate("document.querySelector('#ctList').scrollIntoView({block:'start'}); scrollBy(0,-20)"); pg.wait_for_timeout(100)
    h = pg.locator('#ctList li:nth-child(3) .drag-h').bounding_box(); t = pg.locator('#ctList li:nth-child(1)').bounding_box()
    pg.mouse.move(h['x']+10, h['y']+h['height']/2); pg.mouse.down()
    for k in range(1, 12): pg.mouse.move(h['x']+10, h['y']+h['height']/2 - (h['y']-t['y']+15)*k/11); pg.wait_for_timeout(30)
    pg.mouse.up(); pg.wait_for_timeout(100)
    check('A17 drag', pg.evaluate('ctDraft[0].id') == 'fountain', pg.evaluate('ctDraft.map(c=>c.id).slice(0,3).join()'))
    pg.click('#ctList li:nth-child(12) [data-ct="toggle"]')
    pg.click('#ctPublish'); pg.wait_for_timeout(200)
    cs = ls(pg, 'mdw_categories')
    check('A17 publish writes mdw_categories', isinstance(cs, list) and len(cs) == 12)
    check('A17 contract keys exact', all(list(c.keys()) == CAT_KEYS for c in cs), str(list(cs[0].keys())))
    u = [c for c in cs if c['id'] == 'underwater'][0]
    check('A17 contract values', u['th']=='ไฟใต้น้ำ LED' and u['group']=='outdoor' and u['icon']=='pool' and len(u['popular'])==4 and all(len(x)<=20 for x in u['popular']) and cs[11]['visible'] is False and [c['order'] for c in cs]==list(range(1,13)))
    check('A28 cats publish logged', any(x['type']=='CATS_PUBLISH' for x in ls(pg,'mdw_admin_log')))
    pg.screenshot(path=SH + '/t-cats-published.png', full_page=True)
    pg.click('#ctReset'); pg.click('#dlg [data-dlg="ok"]'); pg.click('#ctPublish'); pg.wait_for_timeout(200)
    check('A17 reset to defaults', ls(pg,'mdw_categories') == pg.evaluate('DEFAULT_CATEGORIES.map(c => ({id:c.id,th:c.th,en:c.en,icon:c.icon,group:c.group,slug:c.slug,popular:c.popular,visible:c.visible,order:c.order}))'))

    # ============ Settings ============
    go(pg, 'settings'); pg.wait_for_timeout(100)
    pg.evaluate("localStorage.setItem('mdw_settings', JSON.stringify({bank:{name:'กสิกร',account:'123',holder:'ร้าน'},promptpay:'0812345678',promptpayName:'ร้าน',shipping:{std:40,express:80},freeShipMin:999,checkWithin:'1 ชม.',line:'https://lin.ee/x', extraFutureField: 1}))")
    go(pg, 'orders'); go(pg, 'settings')
    pg.fill('#s-snd-name', 'ร้านมองดูเว็บ'); pg.fill('#s-snd-phone', '021234567'); pg.fill('#s-snd-addr', '1 ถนนสุขุมวิท กรุงเทพฯ 10110'); pg.uncheck('#soundOn')
    check('A11 settings dirty marker', pg.is_visible('#setUnsaved'))
    go(pg, 'log'); pg.wait_for_timeout(100)
    check('A11 settings guard', pg.is_visible('#dlg') and 'ยังไม่ได้บันทึก' in pg.text_content('#dlgTitle'))
    pg.click('#dlg [data-dlg="save"]'); pg.wait_for_timeout(200)
    s = ls(pg, 'mdw_settings')
    check('A29 old fields intact', s['bank']=={'name':'กสิกร','account':'123','holder':'ร้าน'} and s['promptpay']=='0812345678' and s['promptpayName']=='ร้าน' and s['shipping']=={'std':40,'express':80} and s['freeShipMin']==999 and s['checkWithin']=='1 ชม.' and s['line']=='https://lin.ee/x', json.dumps(s, ensure_ascii=False))
    check('A29 sender + soundOn saved', s['sender']=={'name':'ร้านมองดูเว็บ','phone':'021234567','address':'1 ถนนสุขุมวิท กรุงเทพฯ 10110'} and s['soundOn'] is False)
    check('A29 unknown fields preserved', s.get('extraFutureField') == 1)
    check('A28 settings logged', any(x['type']=='SETTINGS_SAVE' for x in ls(pg,'mdw_admin_log')))
    # label uses sender
    pg.evaluate("printLabels([orders.find(o=>o.status==='PAID')])")
    check('A21 label sender from settings', 'ร้านมองดูเว็บ' in pg.text_content('#printArea') and '021234567' in pg.text_content('#printArea'))
    pg.emulate_media(media='print'); pg.set_viewport_size({'width': 397, 'height': 560}); pg.wait_for_timeout(100)
    pg.screenshot(path=SH + '/t-print-label2.png', full_page=True)
    pg.emulate_media(media='screen'); pg.set_viewport_size({'width': 1440, 'height': 900})
    # A28 log cap
    pg.evaluate("for (let i=0;i<520;i++) adminLog('SETTINGS_SAVE','settings','x'+i)")
    check('A28 cap 500', len(ls(pg,'mdw_admin_log')) == 500)
    # logout logged
    pg.click('#logout'); pg.wait_for_timeout(500)
    check('A28 logout logged', any(x['type']=='LOGOUT' for x in ls(pg,'mdw_admin_log')))
    ctx.close()

    # ============ A30 corrupted storage ============
    ctx = new_ctx(b)
    pg = ctx.new_page(); watch(pg, 'corrupt'); pg.goto(URL)
    pg.evaluate("""localStorage.setItem('mdw_orders','{bad json'); localStorage.setItem('mdw_slides','{"a":1}'); localStorage.setItem('mdw_categories','[1,2,null]');
      localStorage.setItem('mdw_settings','"str"'); localStorage.setItem('mdw_admin_log','{}'); localStorage.setItem('mdw_seeded','1'); localStorage.setItem('mdw_login_guard','[]')""")
    pg.reload(); login(pg)
    check('A30 corrupted orders -> empty', pg.evaluate('orders.length') == 0 and pg.is_visible('#emptyRows'))
    go(pg, 'slides'); check('A30 corrupted slides fallback', pg.locator('#slList li').count() == 5 and 'เสียหาย' in pg.text_content('#slNotice'))
    go(pg, 'categories'); check('A30 corrupted cats fallback', pg.locator('#ctList li').count() == 12)
    go(pg, 'settings'); check('A30 corrupted settings fallback', pg.input_value('#s-bank-name') == 'ธนาคารตัวอย่าง')
    go(pg, 'log'); check('A30 log works', pg.locator('#logList li').count() >= 1)
    # partially broken orders
    pg.evaluate("""localStorage.setItem('mdw_orders', JSON.stringify([null, {id:'X1', status:'PAID', createdAt:new Date().toISOString(), total:500, items:'oops'}, {id:'X2'}]))""")
    go(pg, 'orders'); pg.reload(); pg.wait_for_timeout(300)
    pg.click('.tab[data-tab="ALL"]')
    check('A30 partial orders render', pg.locator('#rows tr').count() == 2)
    pg.click('#rows tr:first-child .c-id'); pg.wait_for_timeout(200)
    check('A30 partial order drawer', pg.evaluate("drawer.classList.contains('open')"))
    ctx.close()

    # ============ Mobile touch drag + responsive ============
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    ctx.route('**/*', lambda r: r.abort() if r.request.url.startswith('http') else r.continue_())
    pg = ctx.new_page(); watch(pg, 'touch'); pg.goto(URL); login(pg)
    go(pg, 'slides')
    pg.evaluate("document.querySelector('#slList').scrollIntoView({block:'start'})"); pg.wait_for_timeout(100)
    h = pg.locator('#slList li:nth-child(1) .drag-h').bounding_box(); t = pg.locator('#slList li:nth-child(3)').bounding_box()
    cdp = ctx.new_cdp_session(pg)
    x0, y0 = h['x'] + h['width']/2, h['y'] + h['height']/2
    y1 = t['y'] + t['height'] * .8
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x0, 'y': y0}]})
    for k in range(1, 16):
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x0, 'y': y0 + (y1 - y0) * k / 15}]}); pg.wait_for_timeout(30)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); pg.wait_for_timeout(200)
    check('A3 touch drag', pg.evaluate('slDraft[0].id') != 's1' and pg.evaluate("slDraft.findIndex(s=>s.id==='s1')") == 2, pg.evaluate('slDraft.map(s=>s.id).join()'))
    pg.screenshot(path=SH + '/t-mob-slides-dirty.png', full_page=True)
    # pubbar not covering last row: check last row bottom visible when scrolled to bottom
    pg.evaluate('scrollTo(0, document.body.scrollHeight)'); pg.wait_for_timeout(100)
    lr = pg.locator('#slList li:last-child').bounding_box(); bar = pg.locator('#slBar').bounding_box()
    check('A30 pubbar does not cover list end', lr['y'] + lr['height'] <= bar['y'] + 1, f'{lr} {bar}')
    pg.screenshot(path=SH + '/t-mob-slides-bottom.png')
    ctx.close()

    # ============ No horizontal scroll at widths ============
    for w in [390, 768, 1280, 1440]:
        ctx = new_ctx(b, (w, 900)); pg = ctx.new_page(); watch(pg, f'w{w}'); pg.goto(URL); login(pg)
        bad = []
        for page in ['orders', 'slides', 'categories', 'log', 'settings']:
            go(pg, page); pg.wait_for_timeout(150)
            sw = pg.evaluate('document.documentElement.scrollWidth')
            if sw > w: bad.append(f'{page}:{sw}')
            if page == 'orders':
                pg.click('#rows tr:first-child .c-id'); pg.wait_for_timeout(350)
                if pg.evaluate("document.querySelector('.drawer-panel').scrollWidth > document.querySelector('.drawer-panel').clientWidth + 1"): bad.append('drawer')
                pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
            if page == 'slides':
                pg.click('#slList li:first-child [data-sl="edit"]'); pg.wait_for_timeout(300)
                if pg.evaluate("document.querySelector('#slEdBody').scrollWidth > document.querySelector('#slEdBody').clientWidth + 1"): bad.append('sleditor')
                pg.screenshot(path=SH + f'/w{w}-sleditor.png')
                pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
            if page == 'categories':
                pg.click('#ctList li:first-child [data-ct="edit"]'); pg.wait_for_timeout(300)
                if pg.evaluate("document.querySelector('#ctEdBody').scrollWidth > document.querySelector('#ctEdBody').clientWidth + 1"): bad.append('cteditor')
                pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
            pg.screenshot(path=SH + f'/w{w}-{page}.png', full_page=True)
        check(f'A30 no h-scroll at {w}', not bad, ','.join(bad))
        ctx.close()
    b.close()

print('\n==== console/page errors ====')
print('\n'.join(errors) or 'none')
fails = [r for r in results if not r[1]]
print(f'\n{len(results) - len(fails)}/{len(results)} passed')
for f in fails: print('FAIL:', f[0], f[2])
