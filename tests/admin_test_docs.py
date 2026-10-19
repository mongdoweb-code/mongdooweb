"""Sales documents module: QT → IV → RC + labels. Run: python3 test_docs.py"""
import os, json, re, io
from playwright.sync_api import sync_playwright
import zxingcpp
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__)); OUT = D + '/out/docs'; os.makedirs(OUT, exist_ok=True)
import pathlib as _pl
URL = (_pl.Path(D).parent / 'prototype' / 'mongdoweb-admin.html').as_uri()
QR = os.path.join(D, 'vendor', 'qrcode.min.js')  # ไลบรารี QR สำรองสำหรับทดสอบแบบออฟไลน์
res, errs = [], []
def check(n, c, i=''):
    res.append((n, bool(c), i)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f'  [{i}]'))
def route(r):
    u = r.request.url
    if 'qrcodejs' in u: return r.fulfill(path=QR, content_type='application/javascript')
    if u.startswith('http'): return r.abort()
    return r.continue_()
def ctxnew(b, vw=(1440, 900), init=''):
    c = b.new_context(viewport={'width': vw[0], 'height': vw[1]}, accept_downloads=True, device_scale_factor=2); c.route('**/*', route)
    c.add_init_script('window.__MDW_TEST_NOPRINT = true;' + init); return c
def watch(pg, tag):
    pg.on('pageerror', lambda e: errs.append(f'{tag} PAGEERROR {e}'))
    pg.on('console', lambda m: errs.append(f'{tag} console.error {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text and 'net::' not in m.text else None)
def login(pg):
    pg.fill('#u', 'admin'); pg.fill('#pw', 'demo1234'); pg.click('#loginBtn'); pg.wait_for_selector('#appView:not([hidden])')
def go(pg, page):
    if pg.viewport_size['width'] <= 860: pg.click('#sideBtn'); pg.wait_for_timeout(250)
    pg.click(f'[data-page="{page}"]'); pg.wait_for_timeout(200)
def ls(pg, k): return pg.evaluate(f'JSON.parse(localStorage.getItem({json.dumps(k)}))')
def okdlg(pg, v='ok'):
    pg.wait_for_selector('#dlg:not([hidden])'); pg.click(f'#dlgActs [data-dlg="{v}"]'); pg.wait_for_timeout(150)
def print_pdf(pg, name, size='A4'):
    pg.emulate_media(media='print')
    if size == 'A4': pdf = pg.pdf(format='A4', print_background=True, prefer_css_page_size=True)
    else: pdf = pg.pdf(width='100mm', height='150mm', print_background=True, prefer_css_page_size=True)
    open(f'{OUT}/{name}.pdf', 'wb').write(pdf)
    pg.emulate_media(media='screen')
    return pdf
def shot_print(pg, name, w=794, h=1123):
    """screenshot of print layout (print media emulated) — first sheet"""
    vs = pg.viewport_size
    pg.set_viewport_size({'width': w, 'height': h}); pg.emulate_media(media='print'); pg.wait_for_timeout(150)
    pg.screenshot(path=f'{OUT}/{name}.png', full_page=True)
    pg.emulate_media(media='screen'); pg.set_viewport_size(vs)
    return f'{OUT}/{name}.png'
def decode(path):
    im = Image.open(path)
    return [(r.format.name, r.text) for r in zxingcpp.read_barcodes(im)]
def add_line(pg, q, qty=None):
    pg.click('#deAddLine'); inp = pg.locator('#deLines .ln-name').last
    inp.fill(q); pg.wait_for_timeout(150); pg.keyboard.press('Enter'); pg.wait_for_timeout(100)
    if qty is not None:
        pg.locator('#deLines [data-f="qty"]').last.fill(str(qty))
def pick_customer(pg, q):
    pg.click('#deCustQ'); pg.fill('#deCustQ', q); pg.wait_for_timeout(150); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)

YM = None
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = ctxnew(b); pg = ctx.new_page(); watch(pg, 'main'); pg.goto(URL); login(pg)
    YM = pg.evaluate("todayStr().slice(2,4)+todayStr().slice(5,7)")

    # ---------- unit: bahtText ----------
    cases = {0: 'ศูนย์บาทถ้วน', 1: 'หนึ่งบาทถ้วน', 11: 'สิบเอ็ดบาทถ้วน', 21: 'ยี่สิบเอ็ดบาทถ้วน', 101: 'หนึ่งร้อยเอ็ดบาทถ้วน', 1580: 'หนึ่งพันห้าร้อยแปดสิบบาทถ้วน',
             1000001: 'หนึ่งล้านเอ็ดบาทถ้วน', 2250: 'สองพันสองร้อยห้าสิบบาทถ้วน', 10: 'สิบบาทถ้วน', 20: 'ยี่สิบบาทถ้วน', 0.5: 'ห้าสิบสตางค์', 0.01: 'หนึ่งสตางค์',
             0.21: 'ยี่สิบเอ็ดสตางค์', 1.01: 'หนึ่งบาทหนึ่งสตางค์', 1690.6: 'หนึ่งพันหกร้อยเก้าสิบบาทหกสิบสตางค์', 11000000: 'สิบเอ็ดล้านบาทถ้วน', 21000021: 'ยี่สิบเอ็ดล้านยี่สิบเอ็ดบาทถ้วน',
             1000000: 'หนึ่งล้านบาทถ้วน', 1000000000000: 'หนึ่งล้านล้านบาทถ้วน', 2000000000001: 'สองล้านล้านเอ็ดบาทถ้วน', 100: 'หนึ่งร้อยบาทถ้วน', 1001: 'หนึ่งพันเอ็ดบาทถ้วน', 120000.75: 'หนึ่งแสนสองหมื่นบาทเจ็ดสิบห้าสตางค์'}
    got = pg.evaluate(f"(c => Object.fromEntries(Object.keys(c).map(k => [k, bahtText(Number(k))])))({json.dumps({str(k): v for k, v in cases.items()})})")
    bad = [f'{k}: {got[str(k)]} != {v}' for k, v in cases.items() if got[str(k)] != v]
    check(f'bahtText {len(cases)} unit cases', not bad, '; '.join(bad))
    check('money format 1,580.00', pg.evaluate("money(158000)") == '1,580.00' and pg.evaluate("money(toSat(0.005))") == '0.01')
    check('half-up per line (2.5 × 0.33 = 0.83 · 1.5 × 0.05 = 0.08)', pg.evaluate("lineSat({qty:2.5,price:0.33,discount:0})") == 83 and pg.evaluate("lineSat({qty:1.5,price:0.05,discount:0})") == 8)
    check('tax id checksum', pg.evaluate("taxIdValid('0105559000018') && taxIdValid('0305559000024') && !taxIdValid('0105559000017') && !taxIdValid('123')"))
    check('seed customers fictional + valid', pg.evaluate("customers.length===4 && customers.filter(c=>c.taxId).every(c=>taxIdValid(c.taxId)) && customers.every(c=>/ตัวอย่าง|สาธิต|ทดลอง|สมมติ|สมมุติ/.test(c.name+c.note))"))
    check('seed products incl. owner SKUs', pg.evaluate("['DL1-ww','GDL-F24WH-1-2-1-1','Shipping','UW-RGB-10','UW-WH-10','PL-RGB-12','FT-RING','PL-WH-12','GL-WH','GL-RGB','PSU-12V','ACC-SHRINK'].every(s=>prodBySku(s))") and pg.evaluate("prodBySku('DL1-ww').price===190 && prodBySku('GDL-F24WH-1-2-1-1').price===2150 && prodBySku('Shipping').kind==='service'"))
    # code128 decodes
    pg.evaluate("document.body.insertAdjacentHTML('beforeend', `<div id='bcTest' style='position:fixed;left:0;top:0;width:500px;height:120px;background:#fff;z-index:999;padding:20px'>${code128Svg('QT2610-00001','x')}</div>`); document.querySelector('#bcTest svg').style.cssText='width:460px;height:80px'")
    pg.locator('#bcTest').screenshot(path=f'{OUT}/bc.png'); pg.evaluate("document.querySelector('#bcTest').remove()")
    check('Code128 decodes to doc number', ('Code128', 'QT2610-00001') in decode(f'{OUT}/bc.png'), str(decode(f'{OUT}/bc.png')))

    # ---------- QT via UI ----------
    go(pg, 'docQT'); pg.click('#dcNew'); pg.wait_for_timeout(300)
    pg.click('#deIssue'); pg.wait_for_timeout(200)
    check('validation: empty doc shows Thai errors', 'กรุณาเลือกหรือเพิ่มลูกค้า' in pg.text_content('#deErr-cust') and 'อย่างน้อย 1 รายการ' in pg.text_content('#deErr-lines'))
    pick_customer(pg, 'ตัวอย่างแสงไทย')
    check('customer autocomplete picks', pg.evaluate("ED.doc.customer && ED.doc.customer.code") == '0001')
    add_line(pg, 'DL1-ww', 8)
    pg.click('#deAddShip'); pg.wait_for_timeout(100)
    pg.click('#deAddLine'); pg.locator('#deLines .ln-name').last.fill('ค่าติดตั้งหน้างาน (รายการพิมพ์เอง)'); pg.locator('#deLines [data-f="price"]').last.fill('-5'); pg.wait_for_timeout(100)
    pg.click('#deIssue'); pg.wait_for_timeout(200)
    check('validation: line price ≥ 0', 'ราคาต้องเป็นตัวเลข' in pg.text_content('#deLnErr2'))
    pg.locator('#deLines [data-f="price"]').last.fill('500'); pg.locator('#deLines [data-f="discount"]').last.fill('100')
    pg.fill('#deNote', 'งานติดตั้งไฟบ้านตัวอย่าง <b>ทดสอบ</b>'); pg.wait_for_timeout(400)
    t = pg.evaluate('calcTotals(ED.doc)')
    check('editor totals live (1520+60+400)', t['grand'] == 198000, str(t))
    check('preview updates (A4 sheet has items)', 'DL1-ww' in pg.text_content('#dePv') and '1,980.00' in pg.text_content('#dePv') and '<b>ทดสอบ</b>' in pg.text_content('#dePv'))
    # reorder line via buttons
    pg.locator('#deLines [data-ln="up"]').nth(1).click(); pg.wait_for_timeout(100)
    check('line reorder up', pg.evaluate("ED.doc.items.map(i=>i.sku).join()") == 'Shipping,DL1-ww,')
    pg.locator('#deLines [data-ln="down"]').first.click(); pg.wait_for_timeout(100)
    # drag line 3 to top
    pg.evaluate("document.querySelector('#deLines').scrollIntoView({block:'start'})"); pg.wait_for_timeout(100)
    h = pg.locator('#deLines .drag-h').nth(2).bounding_box(); t0 = pg.locator('#deLines .de-line').nth(0).bounding_box()
    pg.mouse.move(h['x'] + 8, h['y'] + 10); pg.mouse.down()
    for k in range(1, 14): pg.mouse.move(h['x'] + 8, h['y'] + 10 - (h['y'] - t0['y'] + 10) * k / 13); pg.wait_for_timeout(25)
    pg.mouse.up(); pg.wait_for_timeout(200)
    check('line reorder drag', pg.evaluate("ED.doc.items[0].name").startswith('ค่าติดตั้ง'), pg.evaluate("ED.doc.items.map(i=>i.name.slice(0,8)).join('|')"))
    pg.wait_for_timeout(800)
    check('editor draft autosaved (mdw_doc_draft)', ls(pg, 'mdw_doc_draft') and ls(pg, 'mdw_doc_draft')['doc']['type'] == 'QT')
    # unsaved guard on close
    pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    check('unsaved guard on close', pg.is_visible('#dlg') and 'บันทึก' in pg.text_content('#dlgTitle'))
    pg.click('#dlgActs [data-dlg="stay"]'); pg.wait_for_timeout(100)
    pg.click('#deIssue'); okdlg(pg); pg.wait_for_timeout(300)
    qt = pg.evaluate("ED.doc")
    check('QT issued with number', qt['no'] == f'QT{YM}-00001' and qt['status'] == 'open', qt.get('no'))
    check('QT autosave cleared on issue', ls(pg, 'mdw_doc_draft') is None)
    check('QT customer snapshot', qt['customer']['taxId'] == '0105559000018' and qt['customerId'] == 'cu_seed1')
    check('document.title not changed before print', 'มองดูเว็บ' in pg.title())
    pg.click('#dvPrint'); pg.wait_for_timeout(300)
    check('print sets document.title = doc number', pg.title() == f'QT{YM}-00001', pg.title())
    check('print area has A4 sheet + original label', pg.locator('#printArea .sheet').count() >= 1 and 'ต้นฉบับ' in pg.text_content('#printArea .sh-copy'))
    pg.click('#deBody label:has(input[name="dvCopy"][value="b"])'); pg.click('#dvPrint'); pg.wait_for_timeout(300)
    check('print original + copy', 'สำเนา' in pg.text_content('#printArea') and pg.locator('#printArea .sh-copy').count() == 2)
    pg.click('#deBody label:has(input[name="dvCopy"][value="o"])'); pg.click('#dvPrint'); pg.wait_for_timeout(300)
    shot_print(pg, 'QT-print'); print_pdf(pg, 'QT')
    found = decode(f'{OUT}/QT-print.png')
    check('QT barcode readable in print', ('Code128', f'QT{YM}-00001') in found, str(found))
    # convert
    pg.click('[data-dv="convert"]'); pg.wait_for_timeout(400)
    check('convert → IV draft editor', pg.evaluate("ED.mode") == 'edit' and pg.evaluate("ED.doc.type") == 'IV' and pg.evaluate("ED.doc.items.length") == 3 and pg.evaluate("ED.doc.refs.quoteId") == qt['id'])
    check('QT marked accepted', pg.evaluate(f"docById('{qt['id']}').status") == 'accepted')
    pg.click('#deIssue'); okdlg(pg); pg.wait_for_timeout(300)
    iv = pg.evaluate("ED.doc")
    check('IV issued', iv['no'] == f'IV{YM}-00001' and pg.evaluate("docStatus(ED.doc)") == 'unpaid')
    check('IV ↔ QT linked', pg.evaluate(f"docById('{qt['id']}').refs.invoiceId") == iv['id'])
    # partial payment
    pg.click('[data-dv="pay"]'); pg.wait_for_timeout(200)
    pg.fill('#pyAmt', '5000'); pg.click('#paySave'); pg.wait_for_timeout(150)
    check('payment > outstanding rejected', 'ไม่เกินยอดคงค้าง' in pg.text_content('#pye-amt'))
    pg.fill('#pyAmt', '1000'); pg.fill('#pyRef', 'TRX-001'); pg.click('#paySave'); pg.wait_for_timeout(300)
    okdlg(pg, 'close')
    ivd = pg.evaluate(f"docById('{iv['id']}')")
    rc1 = pg.evaluate(f"docById('{ivd['refs']['receiptIds'][0]}')")
    check('partial payment → RC#1', rc1['no'] == f'RC{YM}-00001' and rc1['totals']['grand'] == 1000 and pg.evaluate(f"docStatus(docById('{iv['id']}'))") == 'partial')
    check('RC#1 installment line', 'งวดที่ 1' in rc1['items'][0]['name'] and rc1['refs']['invoiceId'] == iv['id'] and rc1['payments'][0]['ref'] == 'TRX-001')
    pg.click('[data-dv="pay"]'); pg.wait_for_timeout(200)
    check('payment default = outstanding', pg.input_value('#pyAmt') == '980.00')
    pg.click('#paySave'); pg.wait_for_timeout(300); okdlg(pg, 'close')
    ivd = pg.evaluate(f"docById('{iv['id']}')")
    rc2 = pg.evaluate(f"docById('{ivd['refs']['receiptIds'][1]}')")
    check('second payment → RC#2, IV paid', rc2['no'] == f'RC{YM}-00002' and rc2['totals']['grand'] == 980 and pg.evaluate(f"docStatus(docById('{iv['id']}'))") == 'paid')
    check('IV events + admin log', [e['type'] for e in ivd['events']].count('PAYMENT') == 2 and sum(1 for x in ls(pg, 'mdw_admin_log') if x['type'] == 'DOC_PAYMENT') == 2 and any(x['type'] == 'DOC_CONVERT' for x in ls(pg, 'mdw_admin_log')))
    pg.wait_for_timeout(200); shot_print_iv = None
    # IV print (paid → no QR); print RC2
    pg.click('#dvPrint'); pg.wait_for_timeout(300); shot_print(pg, 'IV-paid-print'); print_pdf(pg, 'IV-paid')
    pg.evaluate(f"printDoc(docById('{rc1['id']}'), false)"); pg.wait_for_timeout(300); shot_print(pg, 'RC-installment-print'); print_pdf(pg, 'RC-installment')
    # void RC#2 → IV back to partial, number kept
    pg.evaluate(f"ED = {{doc: docById('{rc2['id']}'), mode:'view'}}; renderDocModal()"); pg.wait_for_timeout(200)
    pg.click('[data-dv="void"]'); pg.wait_for_timeout(150)
    pg.click('#dlgActs [data-dlg="ok"]'); pg.wait_for_timeout(150)
    check('void requires reason', pg.is_visible('#dlg'))
    pg.fill('#voidReason', 'ออกใบเสร็จซ้ำ ทดสอบการยกเลิก'); pg.click('#dlgActs [data-dlg="ok"]'); pg.wait_for_timeout(300)
    check('RC void keeps number', pg.evaluate(f"docById('{rc2['id']}').status") == 'void' and pg.evaluate(f"docById('{rc2['id']}').no") == f'RC{YM}-00002')
    check('void RC → IV outstanding restored', pg.evaluate(f"docStatus(docById('{iv['id']}'))") == 'partial' and pg.evaluate(f"outstandingSat(docById('{iv['id']}'))") == 98000)
    pg.click('#dvPrint'); pg.wait_for_timeout(300); shot_print(pg, 'RC-void-print'); print_pdf(pg, 'RC-void')
    check('void prints watermark', 'ยกเลิก' in pg.text_content('#printArea .sh-mark'))
    # IV cannot be voided while it has payments
    pg.evaluate(f"ED = {{doc: docById('{iv['id']}'), mode:'view'}}; renderDocModal()"); pg.click('[data-dv="void"]'); pg.wait_for_timeout(150)
    check('IV void blocked with active payments', 'ยกเลิกใบเสร็จ' in pg.text_content('#dlgBody')); pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
    # re-pay remaining → RC#3 (never reuse 00002)
    pg.click('[data-dv="pay"]'); pg.click('#paySave'); pg.wait_for_timeout(300); okdlg(pg, 'close')
    ivd = pg.evaluate(f"docById('{iv['id']}')")
    check('never reuse number: next RC = 00003', pg.evaluate(f"docById('{ivd['refs']['receiptIds'][2]}').no") == f'RC{YM}-00003')
    pg.click('[data-de-close]'); pg.wait_for_timeout(200)

    # ---------- numbering: month reset, tampered counter ----------
    nums = pg.evaluate("""(() => {
      const mk = (type, date) => { const d = newDoc(type); d.date = date; d.customer = custSnap(customers[2]); d.customerId = customers[2].id; d.items=[{sku:'X',name:'x',detail:'',unit:'ชิ้น',qty:1,price:10,discount:0}]; if (type==='IV') d.dueDate = addDays(date,7); if (type==='QT') d.validUntil = addDays(date,30); return issueDoc(d).no; };
      const a = mk('QT','2026-11-02'), b2 = mk('QT','2026-11-15');
      const seq = JSON.parse(localStorage.getItem('mdw_doc_seq')); seq['QT-2611'] = 0; localStorage.setItem('mdw_doc_seq', JSON.stringify(seq));
      const c = mk('QT','2026-11-20'); const dd = mk('QT','2026-12-01');
      return [a,b2,c,dd]; })()""")
    check('monthly reset + tampered counter never reuses', nums == ['QT2611-00001', 'QT2611-00002', 'QT2611-00003', 'QT2612-00001'], str(nums))
    check('draft has no number', pg.evaluate("newDoc('QT').no") is None)

    # ---------- VAT modes ----------
    vt = pg.evaluate("""(() => { const d = newDoc('RC'); d.items=[{sku:'DL1-ww',name:'a',unit:'อัน',qty:8,price:190,discount:0},{sku:'Shipping',name:'b',unit:'กล่อง',qty:1,price:60,discount:0}];
      const r = {}; for (const m of ['none','exclusive','inclusive']){ d.vat.mode = m; r[m] = calcTotals(d); } d.billDiscount = 80; d.vat.mode='exclusive'; r.disc = calcTotals(d); return r; })()""")
    check('VAT none', vt['none']['grand'] == 158000 and vt['none']['vat'] == 0)
    check('VAT exclusive 7%', vt['exclusive']['vat'] == 11060 and vt['exclusive']['grand'] == 169060)
    check('VAT inclusive 7/107', vt['inclusive']['vat'] == 10336 and vt['inclusive']['beforeVat'] == 147664 and vt['inclusive']['grand'] == 158000)
    check('bill discount before VAT', vt['disc']['afterDiscount'] == 150000 and vt['disc']['vat'] == 10500 and vt['disc']['grand'] == 160500)
    # enable VAT in settings (UI)
    go(pg, 'settings')
    pg.check('#docVat'); pg.click('#setForm [type=submit]'); pg.wait_for_timeout(200)
    check('VAT on requires shop tax id', 'เลขประจำตัวผู้เสียภาษี' in pg.text_content('#toast'))
    pg.fill('#s-doc-tax', '1234567890123'); pg.click('#setForm [type=submit]'); pg.wait_for_timeout(200)
    check('shop tax id checksum', 'ไม่ถูกต้อง' in pg.text_content('#toast'))
    pg.fill('#s-doc-tax', '0105559000018'); pg.click('#setForm [type=submit]'); pg.wait_for_timeout(300)
    s = ls(pg, 'mdw_settings')
    check('settings.docs saved', s['docs']['vatEnabled'] is True and s['docs']['taxId'] == '0105559000018' and s['docs']['prefixes'] == {'QT': 'QT', 'IV': 'IV', 'RC': 'RC'})
    check('checkout settings fields intact', all(k in s for k in ['bank', 'promptpay', 'promptpayName', 'shipping', 'freeShipMin', 'checkWithin', 'line']))
    # VAT receipt to company without tax id must fail; with company tax id OK
    go(pg, 'docRC'); pg.click('#dcNew'); pg.wait_for_timeout(300)
    pick_customer(pg, 'สวนสวย'); add_line(pg, 'GDL-F24WH', 1); pg.click('#deAddShip'); pg.fill('#dePayRef', 'KBANK 12:01')
    pg.wait_for_timeout(200)
    check('new doc defaults to VAT exclusive', pg.evaluate("ED.doc.vat.mode") == 'exclusive')
    pg.click('#deBody label:has(input[name="deVat"][value="inclusive"])'); pg.wait_for_timeout(200)
    pg.click('#deIssue'); okdlg(pg); pg.wait_for_timeout(300)
    rcv = pg.evaluate("ED.doc")
    check('tax receipt issued', rcv['no'] == f'RC{YM}-00004' and rcv['vat']['mode'] == 'inclusive', rcv.get('no'))
    pg.click('#dvPrint'); pg.wait_for_timeout(300)
    txt = pg.text_content('#printArea')
    check('tax invoice title + seller & buyer tax id/branch', 'ใบเสร็จรับเงิน / ใบกำกับภาษี' in txt and '0-1055-59000-01-8' in txt and '0-3055-59000-02-4' in txt and 'สาขาที่ 00001' in txt and 'สำนักงานใหญ่' in txt)
    check('tax invoice VAT rows', 'ภาษีมูลค่าเพิ่ม 7%' in txt and 'มูลค่าก่อนภาษีมูลค่าเพิ่ม' in txt)
    shot_print(pg, 'RC-tax-invoice-print'); print_pdf(pg, 'RC-tax-invoice')
    pg.click('[data-de-close]'); pg.wait_for_timeout(150)
    # company without tax id + VAT → blocked
    pg.evaluate("customers.push(normCust({id:'cu_nt',code:'0099',kind:'company',name:'บริษัท ไม่มีเลขภาษี (ทดสอบ)',address:{line:'1',prov:'กรุงเทพมหานคร',zip:'10100'}},99)); saveCustomers()")
    pg.click('#dcNew'); pg.wait_for_timeout(300); pick_customer(pg, 'ไม่มีเลขภาษี'); add_line(pg, 'FT-RING', 1); pg.click('#deIssue'); pg.wait_for_timeout(200)
    check('VAT doc requires company buyer tax id', 'เลขประจำตัวผู้เสียภาษีของลูกค้านิติบุคคล' in pg.text_content('#deErr-vat'))
    pg.click('[data-de-close]'); pg.wait_for_timeout(150); okdlg(pg, 'drop')
    # turn VAT off again
    go(pg, 'settings'); pg.uncheck('#docVat'); pg.click('#setForm [type=submit]'); pg.wait_for_timeout(200)

    # ---------- IV with PromptPay QR + 40-line pagination ----------
    pg.evaluate("const s = JSON.parse(localStorage.getItem('mdw_settings')); s.promptpay='0812345678'; localStorage.setItem('mdw_settings', JSON.stringify(s));")
    ivq = pg.evaluate("""(() => { const d = newDoc('IV'); d.customer = custSnap(customers[0]); d.customerId = customers[0].id;
      d.items = [{sku:'GDL-F24WH-1-2-1-1',name:'ไฟส่องต้นไม้ ไฟส่องสวนหย่อม ไฟส่องสนามหญ้า 24W แสงวอร์มไวท์',detail:'',unit:'ชุด',qty:1,price:2150,discount:0},{sku:'Shipping',name:'ค่าส่งสินค้า',detail:'โดย EMS',unit:'กล่อง',qty:1,price:100,discount:0}];
      d.shipping.carrier='ไปรษณีย์ไทย (EMS)'; d.note = 'หมายเหตุลูกค้า: ขอใบกำกับในนามบริษัท'; const r = issueDoc(d); return docById(d.id); })()""")
    check('IV 2,250 like owner sample', ivq['totals']['grand'] == 2250)
    pg.evaluate(f"openDoc(docById('{ivq['id']}'))"); pg.wait_for_timeout(1200)
    pg.click('#dvPrint'); pg.wait_for_timeout(1200)
    check('IV print has PromptPay QR image', pg.locator('#printArea .sh-qr').count() == 1)
    path = shot_print(pg, 'IV-qr-print'); print_pdf(pg, 'IV-qr')
    found = decode(path)
    qrp = [t for f, t in found if f == 'QRCode']
    check('QR decodes: PromptPay payload with amount 2250.00', qrp and '54072250.00' in qrp[0] and qrp[0].startswith('000201010212') and '0066812345678' in qrp[0], str(found))
    check('IV barcode readable', ('Code128', ivq['no']) in found, str(found))
    pg.click('[data-de-close]'); pg.wait_for_timeout(150)
    big = pg.evaluate("""(() => { const d = newDoc('IV'); d.customer = custSnap(customers[1]); d.customerId = customers[1].id;
      d.items = Array.from({length:40}, (_, i) => ({sku: products[i % 11].sku, name: products[i % 11].name + (i % 7 === 0 ? ' — รุ่นพิเศษสำหรับงานโครงการ สายยาว 5 เมตร พร้อมขั้วต่อกันน้ำ' : ''), detail: i % 5 === 0 ? 'สีวอร์มไวท์ 3000K' : '', unit: products[i % 11].unit, qty: (i % 4) + 1, price: products[i % 11].price, discount: i % 9 === 0 ? 20 : 0}));
      d.billDiscount = 500; d.note = 'งานโครงการตัวอย่าง 40 รายการ'; issueDoc(d); return d.id; })()""")
    pg.evaluate(f"printDoc(docById('{big}'), false)"); pg.wait_for_timeout(800)
    info = pg.evaluate("""(() => { const sh = [...document.querySelectorAll('#printArea .sheet')];
      return { n: sh.length, thead: sh.map(s => s.querySelectorAll('thead').length), rows: sh.reduce((a, s) => a + s.querySelectorAll('tbody tr').length, 0),
        endIdx: sh.map(s => !!s.querySelector('.sh-end')), pages: sh.map(s => s.querySelector('.sh-foot span:last-child').textContent),
        overflow: sh.map(s => { const b = s.querySelector('.sh-body'); return b.scrollHeight - b.clientHeight; }) }; })()""")
    pg.set_viewport_size({'width': 1440, 'height': 900})
    check('40 lines → multiple sheets', info['n'] >= 2, str(info))
    check('header row repeated on every sheet', all(x == 1 for x in info['thead']) and info['rows'] == 40, str(info))
    check('totals/signatures only on last sheet', info['endIdx'][-1] and not any(info['endIdx'][:-1]))
    check('หน้า x / y on each sheet', info['pages'] == [f'หน้า {i + 1} / {info["n"]}' for i in range(info['n'])], str(info['pages']))
    check('no clipped content on any sheet', all(o <= 1 for o in info['overflow']), str(info['overflow']))
    pdf = print_pdf(pg, 'IV-40-lines')
    check('PDF page count = sheet count', pdf.count(b'/Type /Page') - pdf.count(b'/Type /Pages') == info['n'] or pdf.count(b'/Type/Page') - pdf.count(b'/Type/Pages') == info['n'], str(info['n']))
    pg.set_viewport_size({'width': 794, 'height': 1123}); pg.emulate_media(media='print'); pg.wait_for_timeout(150)
    pg.screenshot(path=f'{OUT}/IV-40-lines-all.png', full_page=True); pg.emulate_media(media='screen'); pg.set_viewport_size({'width': 1440, 'height': 900})

    # ---------- labels ----------
    pg.evaluate(f"openDoc(docById('{ivq['id']}'))"); pg.wait_for_timeout(500)
    pg.click('.dv-lbl summary'); pg.fill('[data-lbo^="doc:"] [data-lb="boxes"]', '2'); pg.fill('[data-lbo^="doc:"] [data-lb="cod"]', '2250')
    pg.click('[data-dv="label"]'); pg.wait_for_timeout(300)
    check('label per box (2 boxes → 2 labels)', pg.locator('#printArea .label').count() == 2 and '2/2' in pg.text_content('#printArea'))
    check('label content: recipient, zip, COD, marks, no items by default', 'บริษัท ตัวอย่างแสงไทย จำกัด' in pg.text_content('#printArea') and 'เก็บเงินปลายทาง' in pg.text_content('#printArea') and 'ระวังแตก' in pg.text_content('#printArea') and pg.locator('#printArea .lb-items').count() == 0)
    path = shot_print(pg, 'label-A6-print', 378, 567); print_pdf(pg, 'label-A6', 'A6')
    check('label barcode readable', ('Code128', ivq['no']) in decode(path), str(decode(path)))
    pg.select_option('[data-lbo^="doc:"] [data-lb="size"]', 'A4'); pg.fill('[data-lbo^="doc:"] [data-lb="boxes"]', '3'); pg.check('[data-lbo^="doc:"] [data-lb="showItems"]')
    pg.click('[data-dv="label"]'); pg.wait_for_timeout(300)
    check('A4 × 4 layout', pg.locator('#printArea .lsheet').count() == 1 and pg.locator('#printArea .lsheet .label').count() == 3 and pg.locator('#printArea .lb-items').count() == 3)
    shot_print(pg, 'label-A4x4-print'); print_pdf(pg, 'label-A4x4')
    check('label prefs remembered', ls(pg, 'mdw_admin_ui')['label']['size'] == 'A4')
    pg.click('[data-de-close]'); pg.wait_for_timeout(150)

    # ---------- web order → receipt + label from order ----------
    go(pg, 'orders'); pg.click('#tabs [data-tab="PAID"]'); pg.wait_for_timeout(100)
    oid = pg.evaluate("orders.find(o=>o.status==='PAID').id")
    pg.click(f'#rows tr[data-open="{oid}"] .c-id'); pg.wait_for_timeout(300)
    ncust = pg.evaluate("customers.length")
    pg.click('#dBody [data-dact="rc"]'); okdlg(pg); pg.wait_for_timeout(400)
    rco = pg.evaluate("ED.doc")
    o = pg.evaluate(f"byOrder('{oid}')")
    check('order → receipt issued', rco['type'] == 'RC' and rco['no'] and rco['refs']['orderId'] == oid and rco['totals']['grand'] == o['total'], str(rco.get('totals')))
    check('order customer created (match by phone)', pg.evaluate("customers.length") == ncust + 1 and pg.evaluate(f"customers.some(c => phoneKey(c.phone) === phoneKey(byOrder('{oid}').customer.phone))"))
    check('order SKU mapping', any(i['sku'] in ('FT-RING', 'PSU-12V') for i in rco['items']))
    check('order event + log', o['events'][-1]['type'] == 'DOC' and any(x['type'] == 'DOC_ISSUE' and oid in x['note'] for x in ls(pg, 'mdw_admin_log')) is not None)
    pg.click('[data-de-close]'); pg.wait_for_timeout(200)
    check('drawer shows linked receipt, no duplicate button', pg.locator('#dBody [data-dact="rc"]').count() == 0 and pg.locator('#dBody [data-dact="open"]').count() == 1)
    pg.click('#dBody .lbl-box summary'); pg.fill('[data-lbo^="o:"] [data-lb="boxes"]', '2'); pg.select_option('[data-lbo^="o:"] [data-lb="size"]', 'A6')
    pg.locator('#dBody .lbl-box [data-act="print"]').click(); pg.wait_for_timeout(200)
    check('label from order: 2 boxes', pg.locator('#printArea .label').count() == 2 and oid in pg.text_content('#printArea'))
    shot_print(pg, 'label-order-A6-print', 378, 567)
    pg.click('#dBody [data-dact="iv"]'); pg.wait_for_timeout(400)
    check('order → invoice draft opens editor', pg.evaluate("ED.mode") == 'edit' and pg.evaluate("ED.doc.refs.orderId") == oid)
    pg.click('[data-de-close]'); pg.wait_for_timeout(200)
    pg.click('#dClose'); pg.wait_for_timeout(300)

    # ---------- lists, KPIs, search, CSV ----------
    go(pg, 'docIV')
    k = pg.text_content('#dcKpis')
    check('KPIs render', 'ยอดค้างชำระ' in k and 'เกินกำหนดชำระ' in k and 'รับชำระเดือนนี้' in k)
    pg.fill('#dcQ', '0305559000024'); pg.wait_for_timeout(100)
    check('search by tax id', pg.locator('#dcList .dl-row').count() >= 1 and all('สวนสวย' in t for t in pg.locator('#dcList .dl-cust b').all_text_contents()))
    pg.fill('#dcQ', ''); pg.wait_for_timeout(100)
    pg.click('#dcTabs [data-dctab="paid"]'); pg.wait_for_timeout(100)
    check('status tab filter', pg.locator('#dcList .dl-row').count() == 1)
    pg.click('#dcTabs [data-dctab="all"]')
    with pg.expect_download() as dl: pg.click('#dcCsv')
    csvtxt = open(dl.value.path(), encoding='utf-8-sig').read()
    check('docs CSV', f'IV{YM}-00001' in csvtxt and 'ชำระแล้ว' in csvtxt)
    # overdue
    pg.evaluate("""(() => { const d = newDoc('IV'); d.date = addDays(todayStr(), -20); d.dueDate = addDays(todayStr(), -5); d.customer = custSnap(customers[3]); d.customerId = customers[3].id; d.items=[{sku:'GL-WH',name:'ไฟส่องต้นไม้ LED แบบปักดิน แสงขาว',detail:'',unit:'ชิ้น',qty:2,price:450,discount:0}]; issueDoc(d); renderDocsPage(); })()""")
    check('overdue computed + nav badge', pg.evaluate("docs.filter(d=>docStatus(d)==='overdue').length") == 1 and pg.is_visible('#navIvBadge'))
    pg.screenshot(path=f'{OUT}/app-iv-list-desk.png', full_page=True)
    go(pg, 'docQT'); pg.screenshot(path=f'{OUT}/app-qt-list-desk.png', full_page=True)
    go(pg, 'docRC'); pg.screenshot(path=f'{OUT}/app-rc-list-desk.png', full_page=True)

    # ---------- customers ----------
    go(pg, 'customers'); pg.screenshot(path=f'{OUT}/app-customers-desk.png', full_page=True)
    pg.click('#cuNew'); pg.wait_for_timeout(200)
    pg.click('#custDlg label:has(input[name="cuKind"][value="company"])'); pg.fill('#cuName', 'บริษัท <img src=x onerror=alert(1)> ทดสอบ จำกัด'); pg.fill('#cuTax', '0105559000017'); pg.click('#custSave'); pg.wait_for_timeout(100)
    check('customer tax id checksum error', 'ไม่ถูกต้อง' in pg.text_content('#cue-tax'))
    pg.fill('#cuTax', '0105559000018'); pg.click('#custSave'); pg.wait_for_timeout(100)
    check('duplicate tax id+branch rejected', 'ซ้ำ' in pg.text_content('#cue-tax'))
    pg.fill('#cuBranch', 'สาขาที่ 00002'); pg.fill('#cuZip', '123'); pg.click('#custSave'); pg.wait_for_timeout(100)
    check('zip validation', '5 หลัก' in pg.text_content('#cue-zip'))
    pg.fill('#cuZip', '10110'); pg.click('#custSave'); pg.wait_for_timeout(200)
    check('customer saved + escaped in list', pg.locator('#cuList img').count() == 0 and '<img src=x' in pg.text_content('#cuList'))
    pg.click('#cuList [data-cust="cu_seed1"]'); pg.wait_for_timeout(200)
    check('customer history + outstanding', 'ประวัติเอกสาร' in pg.text_content('#custDlgBody') and f'QT{YM}-00001' in pg.text_content('#custDlgBody'))
    pg.screenshot(path=f'{OUT}/app-customer-dlg-desk.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
    check('Esc closes customer dialog', pg.is_hidden('#custDlg'))
    # products modal
    go(pg, 'docQT'); pg.click('#dcNew'); pg.wait_for_timeout(200); pg.click('#deProds'); pg.wait_for_timeout(200)
    pg.click('#pdAdd'); pg.locator('#prodDlgBody [data-pf="sku"]').last.fill('DL1-ww'); pg.click('#prodSave'); pg.wait_for_timeout(100)
    check('product SKU duplicate rejected', 'ซ้ำ' in pg.text_content('#pdErr'))
    pg.locator('#prodDlgBody [data-pf="sku"]').last.fill('NEW-01'); pg.locator('#prodDlgBody [data-pf="name"]').last.fill('สินค้าใหม่ทดสอบ'); pg.locator('#prodDlgBody [data-pf="price"]').last.fill('99.5'); pg.click('#prodSave'); pg.wait_for_timeout(200)
    check('product saved', any(x['sku'] == 'NEW-01' and x['price'] == 99.5 for x in ls(pg, 'mdw_products_doc')))
    add_line(pg, 'NEW-01', 2)
    check('new product usable in autocomplete', pg.evaluate("ED.doc.items[0].sku") == 'NEW-01')
    pg.screenshot(path=f'{OUT}/app-editor-desk.png')
    pg.click('[data-de-close]'); okdlg(pg, 'drop')
    # log
    go(pg, 'log'); pg.click('[data-logtab="docs"]'); pg.wait_for_timeout(100)
    lt = pg.text_content('#logList')
    check('activity log docs tab', 'ออกเอกสาร' in lt and 'รับชำระ' in lt and 'ยกเลิกเอกสาร' in lt and 'แปลงเอกสาร' in lt)
    ctx.close()

    # ---------- draft autosave survives idle logout ----------
    ctx = ctxnew(b, init='window.__MDW_TEST_IDLE_MS = 2500; window.__MDW_TEST_IDLE_COUNT = 1;'); pg = ctx.new_page(); watch(pg, 'idle'); pg.goto(URL); login(pg)
    go(pg, 'docQT'); pg.click('#dcNew'); pg.wait_for_timeout(200); pick_customer(pg, 'ทดลอง'); add_line(pg, 'PSU', 3)
    pg.wait_for_timeout(4500)
    check('idle logout with editor open', pg.is_visible('#loginView'))
    check('editor draft kept after idle logout', ls(pg, 'mdw_doc_draft') and ls(pg, 'mdw_doc_draft')['doc']['items'][0]['sku'] == 'PSU-12V')
    login(pg); go(pg, 'docQT')
    check('restore banner on docs page', pg.locator('[data-docrestore]').count() == 1)
    pg.click('[data-docrestore]'); pg.wait_for_timeout(400)
    check('restored into editor', pg.evaluate("ED.doc.items[0].qty") == 3 and pg.evaluate("ED.doc.customer.name") == 'คุณทดลอง ระบบดี')
    pg.click('#deSaveDraft'); pg.wait_for_timeout(200)
    check('saved as draft (no number)', pg.evaluate("docs.filter(d=>d.status==='draft' && !d.no).length") == 1 and ls(pg, 'mdw_doc_draft') is None)
    ctx.close()

    # ---------- corrupted storage ----------
    ctx = ctxnew(b); pg = ctx.new_page(); watch(pg, 'corrupt'); pg.goto(URL)
    pg.evaluate("localStorage.setItem('mdw_docs','{bad'); localStorage.setItem('mdw_customers','\"x\"'); localStorage.setItem('mdw_products_doc','[1,null,{\"sku\":\"A\"}]'); localStorage.setItem('mdw_doc_seq','[]'); localStorage.setItem('mdw_doc_draft','{\"doc\":5}'); localStorage.setItem('mdw_settings', JSON.stringify({docs:{prefixes:{QT:'<x>'},vatMode:'zzz',quoteValidDays:'abc',logo:'javascript:1'}}))")
    pg.reload(); login(pg)
    for pgn in ['docQT', 'docIV', 'docRC', 'customers', 'settings']:
        go(pg, pgn)
    check('corrupted docs storage tolerated', pg.evaluate("docs.length === 0 && customers.length === 0 && products.length === 0"))
    check('bad settings.docs sanitized', pg.evaluate("docSettings().prefixes.QT === 'QT' && docSettings().vatMode === 'exclusive' && docSettings().quoteValidDays === 30 && docSettings().logo === ''"))
    go(pg, 'docQT'); pg.click('#dcNew'); pg.wait_for_timeout(300)
    check('editor works on empty data', pg.is_visible('#deCustQ'))
    ctx.close()

    # ---------- mobile 390 ----------
    ctx = ctxnew(b, (390, 844)); pg = ctx.new_page(); watch(pg, 'm390'); pg.goto(URL); login(pg)
    pg.evaluate("""(() => { const d = newDoc('IV'); d.customer = custSnap(customers[0]); d.customerId = customers[0].id; d.items=[{sku:'DL1-ww',name:'โคมไฟฝังฝ้า ไฟดาวไลท์ Downlight 1w (วอร์มไวท์)',detail:'',unit:'อัน',qty:8,price:190,discount:0}]; issueDoc(d); })()""")
    bad = []
    for pgn in ['docQT', 'docIV', 'docRC', 'customers', 'settings']:
        go(pg, pgn); pg.wait_for_timeout(150)
        if pg.evaluate('document.documentElement.scrollWidth') > 390: bad.append(pgn)
        pg.screenshot(path=f'{OUT}/m-{pgn}.png', full_page=True)
    check('390: no h-scroll on docs pages', not bad, str(bad))
    go(pg, 'docIV'); pg.click('#dcList .dl-row'); pg.wait_for_timeout(600)
    check('390: viewer no h-scroll', pg.evaluate("document.querySelector('#deBody').scrollWidth <= document.querySelector('#deBody').clientWidth + 1"))
    pg.screenshot(path=f'{OUT}/m-viewer.png')
    pg.evaluate("document.querySelector('.dv-pv').scrollIntoView()"); pg.wait_for_timeout(300); pg.screenshot(path=f'{OUT}/m-viewer-preview.png')
    pg.click('[data-de-close]'); pg.wait_for_timeout(200)
    pg.click('#dcNew'); pg.wait_for_timeout(300); pick_customer(pg, 'สมมติ'); add_line(pg, 'GL-RGB', 2); pg.click('#deAddShip'); pg.wait_for_timeout(300)
    check('390: editor no h-scroll', pg.evaluate("document.querySelector('#deBody').scrollWidth <= document.querySelector('#deBody').clientWidth + 1"))
    check('390: preview collapsed by default', pg.is_hidden('#dePvWrap'))
    pg.evaluate("document.querySelector('#deLines').scrollIntoView({block:'start'})"); pg.wait_for_timeout(100); pg.screenshot(path=f'{OUT}/m-editor-lines.png')
    pg.click('#dePvToggle'); pg.wait_for_timeout(400)
    check('390: preview toggles open', pg.is_visible('#dePvWrap') and pg.locator('#dePv .sheet').count() == 1)
    pg.evaluate("document.querySelector('#dePvWrap').scrollIntoView({block:'start'})"); pg.wait_for_timeout(200); pg.screenshot(path=f'{OUT}/m-editor-preview.png')
    pg.click('[data-de-close]'); okdlg(pg, 'drop')
    go(pg, 'orders'); pg.click('#tabs [data-tab="PAID"]'); pg.locator('#rows tr').first.click(); pg.wait_for_timeout(400)
    pg.evaluate("document.querySelector('#dBody .lbl-box').scrollIntoView({block:'center'})"); pg.click('#dBody .lbl-box summary'); pg.wait_for_timeout(200)
    check('390: drawer no h-scroll with docs/label boxes', pg.evaluate("document.querySelector('.drawer-panel').scrollWidth <= document.querySelector('.drawer-panel').clientWidth + 1"))
    pg.screenshot(path=f'{OUT}/m-drawer-docs.png')
    ctx.close()
    b.close()

print('\n==== errors ====\n' + ('\n'.join(errs) or 'none'))
f = [x for x in res if not x[1]]
print(f'\n{len(res) - len(f)}/{len(res)} passed')
for x in f: print('FAIL:', x[0], x[2])
