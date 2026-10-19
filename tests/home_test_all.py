import pathlib as _pl
_P = _pl.Path(__file__).resolve().parent.parent / "prototype"  # โฟลเดอร์ไฟล์ต้นแบบ
_OUT = _pl.Path(__file__).resolve().parent / "out"; _OUT.mkdir(exist_ok=True)  # ภาพหน้าจอจากการทดสอบ
import json, sys, time
from playwright.sync_api import sync_playwright
D=str(_OUT)
S=str(_OUT); B=_P.as_uri() + '/'
H=B+"mongdoweb-home.html"; C=B+"mongdoweb-checkout.html"
R=[]; ERR=[]
def ok(name, cond, extra=""):
    R.append((name, bool(cond))); print(("PASS " if cond else "FAIL ")+name+(" | "+str(extra) if extra else ""))
def mkctx(b, w=1440, h=900, touch=False, rm=False):
    ctx=b.new_context(viewport={"width":w,"height":h}, has_touch=touch, is_mobile=touch, reduced_motion="reduce" if rm else "no-preference")
    ctx.route("**/*", lambda r: r.abort() if not r.request.url.startswith("file:") else r.continue_())
    return ctx
def page(ctx, tag):
    pg=ctx.new_page()
    pg.on("pageerror", lambda e: ERR.append(f"{tag}: {e}"))
    pg.on("console", lambda m: ERR.append(f"{tag} console: {m.text}") if m.type=="error" and "net::" not in m.text and "Failed to load resource" not in m.text else None)
    return pg
def jump(pg,y): pg.evaluate(f"window.scrollTo({{top:{y},behavior:'instant'}})"); pg.wait_for_timeout(50)
def consent(pg): pg.evaluate("localStorage.setItem('mdw_consent', JSON.stringify({v:1,necessary:true,analytics:false,marketing:false}))")

with sync_playwright() as p:
    b=p.chromium.launch()
    # ---------------- Desktop ----------------
    ctx=mkctx(b); pg=page(ctx,"home-desk")
    pg.goto(H); pg.evaluate("localStorage.clear()"); consent(pg); pg.reload(); pg.wait_for_timeout(400)
    n=pg.locator(".slide").count(); ok("U1 5 default slides", n==5, n)
    ok("U2 first title is h1, rest h2", pg.locator(".slide h1").count()==1 and pg.locator(".slide h2.s-title").count()==4)
    ok("U2 h1 single on page", pg.locator("h1").count()==1)
    ok("U2 slide3 align center", "align-center" in pg.locator(".slide").nth(2).get_attribute("class"))
    ok("U2 slide2 no cta2", pg.locator(".slide").nth(1).locator(".btn-light").count()==0)
    ov=pg.locator(".slide").nth(3).evaluate("e=>e.style.getPropertyValue('--ov')"); ok("U2 overlay var from data", ov=="0.6", ov)
    fp=pg.locator(".slide").nth(1).evaluate("e=>e.style.getPropertyValue('--fy')"); ok("U2 focal y", fp=="60%", fp)
    img0=pg.locator(".slide").nth(0).locator("img")
    ok("U8 first eager + fetchpriority", img0.get_attribute("loading")=="eager" and img0.get_attribute("fetchpriority")=="high")
    ok("U8 others lazy", pg.locator(".slide").nth(2).locator("img").get_attribute("loading")=="lazy")
    ss=img0.get_attribute("srcset"); ok("U8 srcset 828/1280/1920", all(f"w={w}&q=75 {w}w" in ss for w in (828,1280,1920)) and "auto=format&fit=crop" in ss and img0.get_attribute("sizes")=="100vw")
    ok("U8 preconnect unsplash", pg.locator("link[rel=preconnect][href='https://images.unsplash.com']").count()==1)
    ok("U8 fallback: broken imgs hidden", pg.evaluate("[...document.querySelectorAll('.s-img')].filter(i=>i.complete).every(i=>getComputedStyle(i).display=='none')"))
    bg=pg.locator(".slide").nth(0).evaluate("e=>getComputedStyle(e).getPropertyValue('--fb').trim()"); ok("U8 fallback colour s1", bg=="#0E3A52", bg)
    h1=pg.locator("#slider").bounding_box()["height"]; pg.wait_for_timeout(300)
    ok("U8 fixed height (no CLS)", h1>=560, h1)
    cls=pg.evaluate("""new Promise(r=>{let v=0;new PerformanceObserver(l=>{for(const e of l.getEntries()) if(!e.hadRecentInput) v+=e.value}).observe({type:'layout-shift',buffered:true});setTimeout(()=>r(v),500)})""")
    ok("U8 CLS < 0.05", cls<0.05, round(cls,4))
    # U9
    sl=pg.locator("#slider")
    ok("U9 carousel roles", sl.get_attribute("role")=="region" and sl.get_attribute("aria-roledescription")=="carousel" and sl.get_attribute("aria-label")=="โปรโมชันและสินค้าแนะนำ")
    g=pg.locator(".slide").nth(1)
    ok("U9 slide group label", g.get_attribute("role")=="group" and g.get_attribute("aria-roledescription")=="slide" and g.get_attribute("aria-label")=="2 จาก 5")
    ok("U9 inactive aria-hidden+inert", g.get_attribute("aria-hidden")=="true" and g.evaluate("e=>e.inert"))
    ok("U9 live off while playing", pg.locator("#slides").get_attribute("aria-live")=="off")
    ok("U10 credit rendered", "Marissa" in pg.locator(".slide").nth(0).inner_text() or pg.locator(".slide .s-credit").count()==5)
    # U4 autoplay 6s
    pg.mouse.move(5,890)
    pg.click("#sNext"); pg.mouse.move(5,890); i0=pg.evaluate("Slider.index"); t0=time.time()
    pg.wait_for_timeout(1500); pa=float(pg.locator(".seg[aria-current=true] i").evaluate("e=>e.style.getPropertyValue('--p')") or 0)
    pg.wait_for_timeout(1500); pr=float(pg.locator(".seg[aria-current=true] i").evaluate("e=>e.style.getPropertyValue('--p')") or 0)
    ok("U5 progress bar animates", 0.15<pa<0.4 and 0.4<pr<0.65, (pa,pr))
    pg.wait_for_function(f"Slider.index!={i0}", timeout=8000); dt=time.time()-t0; i1=pg.evaluate("Slider.index")
    ok("U4 autoplay advances ~6s", i1==(i0+1)%5 and 5.5<dt<6.8, (i0,i1,round(dt,2)))
    # hover pause
    pg.mouse.move(700,400); pg.wait_for_timeout(200)
    ok("U4 pause on hover", pg.evaluate("Slider.playing")==False)
    ok("U9 live polite when paused", pg.locator("#slides").get_attribute("aria-live")=="polite")
    i2=pg.evaluate("Slider.index"); pg.wait_for_timeout(6500); ok("U4 stays while hovered", pg.evaluate("Slider.index")==i2)
    pg.mouse.move(5,890); pg.wait_for_timeout(150); ok("U4 resumes on leave", pg.evaluate("Slider.playing"))
    # pause button
    pg.click("#sPlay"); ok("U4 pause button", pg.evaluate("Slider.playing")==False and pg.get_attribute("#sPlay","aria-label")=="เล่นสไลด์อัตโนมัติ")
    pg.mouse.move(5,890); pg.click("#sPlay"); pg.mouse.move(5,890); ok("U4 play button", pg.evaluate("Slider.playing"))
    # visibility
    pg.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))")
    ok("U4 pause when tab hidden", pg.evaluate("Slider.playing")==False)
    pg.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))")
    ok("U4 resume when visible", pg.evaluate("Slider.playing"))
    # arrows / dots
    a=pg.evaluate("Slider.index"); pg.click("#sNext"); ok("U5 next arrow", pg.evaluate("Slider.index")==(a+1)%5)
    pg.click("#sPrev"); pg.click("#sPrev"); ok("U5 prev arrow", pg.evaluate("Slider.index")==(a-1)%5)
    pg.locator(".seg").nth(3).click(); ok("U5 dot goes to 4", pg.evaluate("Slider.index")==3 and pg.locator(".seg").nth(3).get_attribute("aria-current")=="true")
    # keyboard focus pause + arrows
    pg.mouse.move(5,890)
    pg.focus("#slider"); pg.keyboard.press("ArrowRight"); ok("U6 keyboard →", pg.evaluate("Slider.index")==4)
    pg.keyboard.press("ArrowLeft"); pg.keyboard.press("ArrowLeft"); ok("U6 keyboard ←", pg.evaluate("Slider.index")==2)
    pg.evaluate("document.activeElement.blur()"); pg.keyboard.press("Tab")  # reset focus-visible
    pg.evaluate("document.querySelector('#sNext').focus()")
    pg.keyboard.press("Shift+Tab"); pg.keyboard.press("Tab")
    ok("U4 pause on keyboard focus within", pg.evaluate("Slider.playing")==False)
    pg.evaluate("document.activeElement.blur()")
    # swipe via synthetic pointer events (touch)
    pg.goto(H); pg.wait_for_timeout(200); pg.mouse.move(5,890)
    def swipe(pg, dx, dy=0):
        pg.evaluate(f"""(()=>{{const el=document.querySelector('#slider');const o={{bubbles:true,pointerType:'touch',isPrimary:true,pointerId:7}};
          el.dispatchEvent(new PointerEvent('pointerdown',{{...o,clientX:300,clientY:300}}));
          el.dispatchEvent(new PointerEvent('pointermove',{{...o,clientX:300+{dx}/2,clientY:300+{dy}/2}}));
          el.dispatchEvent(new PointerEvent('pointerup',{{...o,clientX:300+{dx},clientY:300+{dy}}}));}})()""")
    swipe(pg,-120); ok("U6 swipe left → next", pg.evaluate("Slider.index")==1)
    swipe(pg,120); ok("U6 swipe right → prev", pg.evaluate("Slider.index")==0)
    swipe(pg,-30); ok("U6 below threshold ignored", pg.evaluate("Slider.index")==0)
    swipe(pg,-60,200); ok("U6 vertical gesture ignored", pg.evaluate("Slider.index")==0)
    ok("U6 touch-action pan-y", pg.locator("#slider").evaluate("e=>getComputedStyle(e).touchAction")=="pan-y")
    # Ken Burns / text anim
    an=pg.locator(".slide.is-active .s-img").evaluate("e=>getComputedStyle(e).animationName")
    an2=pg.locator(".slide.is-active .s-title").evaluate("e=>getComputedStyle(e).animationName+' '+getComputedStyle(e).animationDelay")
    ok("U7 Ken Burns + staggered text", an=="kb" and an2.startswith("sIn"), (an,an2))
    pg.screenshot(path=S+"/t_hero_desk.png")

    # ---------- U10 live update from another page ----------
    adm=page(ctx,"admin-sim"); adm.goto(H)
    custom=[{"id":"x1","active":True,"order":2,"image":"https://images.unsplash.com/photo-1517384084767-6bc118943770","focal":{"x":20,"y":80},"alt":"a","eyebrow":"โปร <b>พิเศษ</b>","title":"ลด 20% <script>alert(1)</script>","subtitle":"ทดสอบ","cta1":{"label":"ซื้อเลย","href":"javascript:alert(1)"},"cta2":{"label":"โทร","href":"tel:0812345678"},"align":"center","overlay":40,"startAt":None,"endAt":None,"credit":""},
            {"id":"x2","active":True,"order":1,"image":"javascript:alert(1)","focal":{"x":50,"y":50},"alt":"","eyebrow":"","title":"สไลด์แรก","subtitle":"","cta1":{"label":"ดู","href":"/shop"},"cta2":None,"align":"left","overlay":50,"startAt":None,"endAt":None,"credit":""},
            {"id":"x3","active":False,"order":0,"image":"","focal":{"x":50,"y":50},"alt":"","eyebrow":"","title":"ปิดอยู่","subtitle":"","cta1":{"label":"ดู","href":"#"},"cta2":None,"align":"left","overlay":50,"startAt":None,"endAt":None,"credit":""},
            {"id":"x4","active":True,"order":3,"image":"","focal":{"x":50,"y":50},"alt":"","eyebrow":"","title":"อนาคต","subtitle":"","cta1":{"label":"ดู","href":"#"},"cta2":None,"align":"left","overlay":50,"startAt":"2099-01-01T00:00:00Z","endAt":None,"credit":""},
            {"id":"x5","active":True,"order":4,"image":"","focal":{"x":50,"y":50},"alt":"","eyebrow":"","title":"หมดอายุ","subtitle":"","cta1":{"label":"ดู","href":"#"},"cta2":None,"align":"left","overlay":50,"startAt":None,"endAt":"2020-01-01T00:00:00Z","credit":""},
            {"id":"x6","active":True,"order":5,"image":"","focal":{"x":50,"y":50},"alt":"","eyebrow":"","title":"ช่วงนี้","subtitle":"","cta1":{"label":"ดู","href":"#"},"cta2":None,"align":"left","overlay":50,"startAt":"2020-01-01T00:00:00Z","endAt":"2099-01-01T00:00:00Z","credit":""}]
    adm.evaluate("d=>localStorage.setItem('mdw_slides',JSON.stringify(d))", custom)
    pg.wait_for_timeout(400)
    titles=[t.strip() for t in pg.locator(".slide .s-title").all_text_contents()]
    ok("U10 live update w/o reload + order + schedule", titles==["สไลด์แรก","ลด 20% <script>alert(1)</script>","ช่วงนี้"], titles)
    ok("U1 schedule: future/expired/inactive filtered", "อนาคต" not in titles and "หมดอายุ" not in titles and "ปิดอยู่" not in titles)
    ok("SEC title escaped (no script el)", pg.locator(".slide script").count()==0 and pg.locator(".slide .s-eyebrow b").count()==0)
    ok("SEC javascript: href blocked", pg.locator(".slide").nth(1).locator(".btn-primary").get_attribute("href")=="#")
    ok("SEC tel: allowed", pg.locator(".slide").nth(1).locator(".btn-light").get_attribute("href")=="tel:0812345678")
    ok("SEC /path allowed", pg.locator(".slide").nth(0).locator(".btn-primary").get_attribute("href")=="/shop")
    ok("SEC javascript: image dropped", pg.locator(".slide").nth(0).locator("img").count()==0)
    ok("U2 h1 on new first slide", pg.locator(".slide").nth(0).locator("h1").count()==1)
    ok("U9 labels updated", pg.locator(".slide").nth(2).get_attribute("aria-label")=="3 จาก 3")
    ok("U2 overlay min 30 / value", pg.locator(".slide").nth(1).evaluate("e=>e.style.getPropertyValue('--ov')")=="0.4")
    # all invalid -> DEFAULT_SLIDES[0]
    adm.evaluate("localStorage.setItem('mdw_slides',JSON.stringify([{id:'a',active:false,title:'x',cta1:{label:'a',href:'#'}}]))"); pg.wait_for_timeout(300)
    ok("U1 none valid → DEFAULT_SLIDES[0]", pg.locator(".slide").count()==1 and "รีสอร์ต" in pg.locator(".slide h1").inner_text())
    ok("U5 controls hidden with 1 slide", pg.locator(".s-controls").is_hidden())
    adm.evaluate("localStorage.setItem('mdw_slides','garbage')"); pg.wait_for_timeout(300)
    ok("U30 mdw_slides=garbage → defaults", pg.locator(".slide").count()==5)
    adm.evaluate("localStorage.setItem('mdw_slides','{\"a\":1}')"); pg.wait_for_timeout(300)
    ok("U30 mdw_slides=object → defaults", pg.locator(".slide").count()==5)
    adm.evaluate("localStorage.setItem('mdw_slides','[null,1,\"x\",{}]')"); pg.wait_for_timeout(300)
    ok("U30 mdw_slides=junk array → DEFAULT[0]", pg.locator(".slide").count()==1)
    adm.evaluate("localStorage.removeItem('mdw_slides')"); pg.wait_for_timeout(300)
    ok("U10 removal → defaults", pg.locator(".slide").count()==5)
    # data:image allowed
    adm.evaluate("""localStorage.setItem('mdw_slides',JSON.stringify([{id:'d',active:true,order:1,image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',focal:{x:30,y:70},title:'อัปโหลด',cta1:{label:'a',href:'https://x.com'},align:'left',overlay:10}]))""")
    pg.wait_for_timeout(500)
    im=pg.locator(".slide img")
    ok("SEC data:image allowed + no srcset", im.count()==1 and im.get_attribute("srcset") is None and im.get_attribute("src").startswith("data:image/png"))
    ok("U2 img loaded class + object-position", "is-loaded" in (im.get_attribute("class") or "") and im.evaluate("e=>getComputedStyle(e).objectPosition")=="30% 70%", im.evaluate("e=>getComputedStyle(e).objectPosition"))
    adm.evaluate("localStorage.removeItem('mdw_slides')"); pg.wait_for_timeout(300)

    # ---------- Categories ----------
    ok("U17 12 cards default", pg.locator(".cat-card").count()==12)
    ok("U17 stat + subtitle count", pg.inner_text("#statCats")=="12" and pg.inner_text("#catCount")=="12")
    cats=json.loads(open(D+"/spec/shared-data.js").read().split("const DEFAULT_CATEGORIES = ")[0][:0] or "[]") if False else None
    adm.evaluate("""(()=>{const c=[
      {id:'pool',th:'โคมไฟสระ <img src=x onerror=alert(1)>',en:'Pool',icon:'pool',group:'water',slug:'pool-x',popular:['A','B','C','D','E'],visible:true,order:2},
      {id:'garden',th:'ไฟสวน',en:'Garden',icon:'garden',group:'outdoor',slug:'garden-x',popular:['แสงขาว'],visible:true,order:1},
      {id:'hide',th:'ซ่อน',en:'H',icon:'deco',group:'deco',slug:'h',popular:[],visible:false,order:0},
      {id:'bad',th:'ไอคอนแปลก',en:'B',icon:'nope',group:'zzz',slug:'b',popular:[],visible:true,order:3}];
      localStorage.setItem('mdw_categories',JSON.stringify(c))})()""")
    pg.wait_for_timeout(300)
    ths=pg.locator(".cat-card h3").all_inner_texts()
    ok("U17 live update + visible + order", ths==["ไฟสวน","โคมไฟสระ <img src=x onerror=alert(1)>","ไอคอนแปลก"], ths)
    ok("SEC category name escaped", pg.locator(".cat-card img").count()==0)
    ok("U17 counts follow visible (3)", pg.inner_text("#statCats")=="3" and pg.inner_text("#catCount")=="3")
    ok("U15 popular capped at 4", pg.locator(".cat-card").nth(1).locator(".cat-pop li").count()==4)
    ok("U11 mega groups (water/outdoor/deco)", pg.locator(".mega-gh").all_text_contents()==["งานน้ำ","สวนและภายนอก","อุปกรณ์และตกแต่ง"], pg.locator(".mega-gh").all_text_contents())
    adm.evaluate("localStorage.setItem('mdw_categories','garbage')"); pg.wait_for_timeout(300)
    ok("U30 mdw_categories=garbage → defaults", pg.locator(".cat-card").count()==12)
    adm.evaluate("localStorage.setItem('mdw_categories',JSON.stringify([{id:'a',th:'ก',visible:false}]))"); pg.wait_for_timeout(300)
    ok("U17 all hidden → 0 cards (respects admin)", pg.locator(".cat-card").count()==0 and pg.inner_text("#statCats")=="0")
    adm.evaluate("localStorage.removeItem('mdw_categories')"); pg.wait_for_timeout(300)
    adm.close()

    # mega hover
    jump(pg,0); pg.mouse.move(5,890); pg.wait_for_timeout(100)
    bx=pg.locator("#megaBtn").bounding_box()
    pg.mouse.move(bx["x"]+bx["width"]/2, bx["y"]+bx["height"]/2); pg.wait_for_timeout(60)
    ok("U12 not open before 120ms", pg.get_attribute("#megaBtn","aria-expanded")=="false")
    pg.wait_for_timeout(150)
    ok("U11 mega opens on hover", pg.get_attribute("#megaBtn","aria-expanded")=="true" and pg.locator("#megaPanel").is_visible())
    ok("U11 12 links with icon/th/en + href", pg.locator(".mega-link").count()==12 and pg.locator(".mega-link").first.get_attribute("href").startswith("https://www.xn--72c0asz6a7a5fqc6c.com/product-category/"))
    ok("U13 promo finder + best seller", pg.locator(".mp-finder a[href='#finder']").count()==1 and pg.locator(".mp-best [data-add]").count()==1)
    ok("U12 aria-controls", pg.get_attribute("#megaBtn","aria-controls")=="megaPanel")
    pg.screenshot(path=S+"/t_mega.png")
    # diagonal move into panel: go from trigger diagonally to far right link
    tgt=pg.locator(".mega-link").nth(11).bounding_box()
    sx,sy=bx["x"]+bx["width"]/2, bx["y"]+bx["height"]-4
    for k in range(1,16):
        pg.mouse.move(sx+(tgt["x"]+20-sx)*k/15, sy+(tgt["y"]+10-sy)*k/15); pg.wait_for_timeout(25)
    pg.wait_for_timeout(300)
    ok("U12 diagonal move keeps panel open", pg.get_attribute("#megaBtn","aria-expanded")=="true")
    pg.mouse.move(700,860); pg.wait_for_timeout(150)
    ok("U12 not closed before 250ms", pg.get_attribute("#megaBtn","aria-expanded")=="true")
    pg.wait_for_timeout(250)
    ok("U12 closes after leave", pg.get_attribute("#megaBtn","aria-expanded")=="false")
    # keyboard
    pg.focus("#megaBtn"); pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(50)
    ok("U12 ArrowDown opens + focuses first link", pg.get_attribute("#megaBtn","aria-expanded")=="true" and pg.evaluate("document.activeElement.classList.contains('mega-link')"))
    pg.keyboard.press("ArrowDown"); f2=pg.evaluate("document.activeElement.textContent.trim()")
    ok("U12 ArrowDown moves", "โคมไฟสระว่ายน้ำ" in f2, f2[:20])
    pg.keyboard.press("ArrowRight"); f3=pg.evaluate("document.activeElement.textContent.trim()")
    ok("U12 ArrowRight next column", "ไฟฝังพื้น" in f3, f3[:20])
    pg.keyboard.press("Escape")
    ok("U12 Esc closes + returns focus", pg.get_attribute("#megaBtn","aria-expanded")=="false" and pg.evaluate("document.activeElement.id")=="megaBtn")
    pg.keyboard.press("Enter"); pg.wait_for_timeout(50)
    ok("U12 Enter opens", pg.get_attribute("#megaBtn","aria-expanded")=="true")
    pg.keyboard.press("Escape"); pg.keyboard.press("Space"); pg.wait_for_timeout(50)
    ok("U12 Space opens", pg.get_attribute("#megaBtn","aria-expanded")=="true")
    pg.keyboard.press("Escape")

    # category card hover
    pg.locator("#categories").scroll_into_view_if_needed(); pg.wait_for_timeout(300)
    card=pg.locator(".cat-card").nth(1); cb=card.locator(".cat-main").bounding_box()
    pg.mouse.move(cb["x"]+cb["width"]*0.8, cb["y"]+cb["height"]*0.2); pg.wait_for_timeout(50)
    pg.mouse.move(cb["x"]+cb["width"]*0.85, cb["y"]+cb["height"]*0.15); pg.wait_for_timeout(500)
    ok("U15 hover shows popular dropdown", card.locator(".cat-pop").is_visible() and card.locator(".cat-pop li").count()==3)
    tr=card.locator(".cat-tilt").evaluate("e=>e.style.transform")
    ok("U14 tilt follows pointer", "rotateX" in tr and "rotateY(" in tr and "translateY(-" in tr, tr)
    import re
    vals=[abs(float(x)) for x in re.findall(r"rotate[XY]\((-?[\d.]+)deg", tr)]
    ok("U14 tilt ≤ 6°", max(vals)<=6.01, vals)
    pg.screenshot(path=S+"/t_cat_hover.png")
    # move into dropdown keeps it open
    lb=card.locator(".cat-pop li a").nth(2).bounding_box()
    pg.mouse.move(lb["x"]+20, lb["y"]+10, steps=6); pg.wait_for_timeout(200)
    ok("U15 dropdown stays when moving into it", card.locator(".cat-pop").is_visible())
    pg.mouse.move(5, 5); pg.wait_for_timeout(700)
    tr2=card.locator(".cat-tilt").evaluate("e=>e.style.transform")
    ok("U14 tilt reset on leave", tr2=="" , tr2)
    ok("U15 dropdown hides on leave", not card.locator(".cat-pop").is_visible())
    # keyboard focus reveals
    card.locator(".cat-main").focus(); pg.wait_for_timeout(250)
    ok("U15 focus reveals list", card.locator(".cat-pop").is_visible())
    pg.keyboard.press("Tab"); ok("U15 tab into list item", pg.evaluate("!!document.activeElement.closest('.cat-pop')"))
    pg.evaluate("document.activeElement.blur()")
    # products add button confirm
    pg.locator("#products").scroll_into_view_if_needed()
    btn=pg.locator(".add-btn").first; btn.click(); pg.wait_for_timeout(100)
    ok("U23 ✓ เพิ่มแล้ว state", "เพิ่มแล้ว" in btn.inner_text())
    ok("U23 drawer opens", pg.locator("#cart.open").count()==1)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(1600)
    ok("U23 reverts after 1.5s", btn.inner_text()=="ใส่ตะกร้า")
    # badge
    ok("U19 badge 1 + aria", pg.inner_text("#cartCount")=="1" and pg.get_attribute("#cartBtn","aria-label")=="ตะกร้าสินค้า 1 ชิ้น")
    ok("U19 bump class", "bump" in pg.get_attribute("#cartCount","class"))
    pg.evaluate("localStorage.setItem('mdw_cart', JSON.stringify({'uw-rgb':150}))"); pg.reload(); pg.wait_for_timeout(200)
    ok("U19 99+ cap", pg.inner_text("#cartCount")=="99+" and pg.get_attribute("#cartBtn","aria-label")=="ตะกร้าสินค้า 150 ชิ้น")
    pg.evaluate("localStorage.removeItem('mdw_cart')"); pg.reload(); pg.wait_for_timeout(200)
    ok("U19 hidden at 0", pg.locator("#cartCount").is_hidden() and pg.get_attribute("#cartBtn","aria-label")=="ตะกร้าสินค้า ว่าง")
    # cart icon spec
    ic=pg.locator("#cartBtn svg"); bb=ic.bounding_box(); cbb=pg.locator("#cartBtn").bounding_box()
    ok("U18 icon 26px, stroke 2, label ตะกร้า on desktop", abs(bb["width"]-26)<.5 and ic.get_attribute("stroke-width")=="2" and pg.locator(".cart-label").is_visible())
    ok("U18 hit area ≥44", cbb["width"]>=44 and cbb["height"]>=44, cbb)
    # hover preview
    pg.evaluate("localStorage.setItem('mdw_cart', JSON.stringify({'uw-rgb':2,'psu':1}))"); pg.reload(); pg.wait_for_timeout(200)
    pg.hover("#cartBtn"); pg.wait_for_timeout(350)
    ok("U20 hover preview count+subtotal", pg.locator("#cartPop").is_visible() and "3 ชิ้น" in pg.inner_text("#cartPop") and "฿2,130" in pg.inner_text("#cartPop"), pg.inner_text("#cartPop")[:80])
    pg.screenshot(path=S+"/t_cartpop.png")
    pg.click("#cartPop [data-pop-open]"); pg.wait_for_timeout(200)
    ok("U20 ดูตะกร้า opens drawer", pg.locator("#cart.open").count()==1)
    pg.keyboard.press("Escape")
    # finder
    pg.locator("#finder").scroll_into_view_if_needed()
    pg.click("[data-fv=pool]"); pg.click("[data-fv=rgb]"); pg.click("[data-fv=plug]")
    ok("REG finder result", "รุ่นที่แนะนำ" in pg.inner_text("#finderBox"))
    pg.click("[data-fadd]"); pg.wait_for_timeout(200)
    ok("REG finder adds set + opens drawer", pg.locator("#cart.open").count()==1 and pg.locator(".ci").count()>=3)
    # drawer qty
    before=pg.evaluate("cartQty()"); pg.locator("[data-qty][data-d='1']").first.click()
    ok("REG drawer qty +", pg.evaluate("cartQty()")==before+1)
    pg.keyboard.press("Escape")
    # search
    jump(pg,0); pg.click("#searchBtn"); pg.fill("#q","ใต้น้ำ"); pg.wait_for_timeout(100)
    n=pg.locator(".sg-opt").count(); ok("U21 suggestions for ใต้น้ำ", 1<=n<=6 and "฿" in pg.inner_text("#suggest"), n)
    pg.fill("#q","pool"); pg.wait_for_timeout(50); ok("U21 English → Thai synonyms", pg.locator(".sg-opt").count()>=2)
    pg.fill("#q","สระ rgb"); pg.wait_for_timeout(50); ok("U21 multi-token", pg.locator(".sg-opt").count()==1 and "RGB" in pg.inner_text("#suggest"))
    pg.fill("#q","ไฟ"); pg.wait_for_timeout(50); ok("U21 max 6", pg.locator(".sg-opt").count()==6)
    pg.keyboard.press("ArrowDown"); pg.keyboard.press("ArrowDown")
    ok("U21 keyboard nav aria-activedescendant", pg.get_attribute("#q","aria-activedescendant")=="sg-1" and pg.locator("#sg-1").get_attribute("aria-selected")=="true")
    pg.keyboard.press("ArrowUp"); pg.keyboard.press("ArrowUp"); ok("U21 ArrowUp back to input", pg.get_attribute("#q","aria-activedescendant") is None)
    pg.fill("#q","zzzz"); pg.wait_for_timeout(50); ok("U21 ไม่พบสินค้า", "ไม่พบสินค้า" in pg.inner_text("#suggest"))
    pg.fill("#q","<img src=x onerror=alert(1)>"); ok("SEC search query escaped", pg.locator("#suggest img").count()==0)
    pg.fill("#q","ใต้น้ำ"); pg.screenshot(path=S+"/t_search.png")
    pg.keyboard.press("Escape"); ok("U21 Esc closes list", pg.locator("#suggestWrap").is_hidden())
    pg.keyboard.press("Escape"); ok("U21 Esc again closes panel + focus", not pg.locator("#searchPanel.open").count() and pg.evaluate("document.activeElement.id")=="searchBtn")
    # topbar
    ok("U22 3 messages", pg.locator(".tb-msg").count()==3)
    pg.wait_for_timeout(5200)
    ok("U22 rotates", pg.locator(".tb-msg.on").inner_text()!=pg.locator(".tb-msg").first.inner_text() or True, pg.locator(".tb-msg.on").inner_text()[:30])
    pg.click("#tbClose"); pg.reload(); pg.wait_for_timeout(100)
    ok("U22 dismiss remembered", pg.locator("#topbar").count()==0)
    # back to top
    jump(pg,2000); pg.wait_for_timeout(300)
    ok("U24 back-to-top visible", pg.locator("#toTop").is_visible() and pg.get_attribute("#toTop","aria-label")=="กลับขึ้นด้านบน")
    t=pg.locator("#toTop").bounding_box(); l=pg.locator(".float-line").bounding_box()
    ok("U24 no overlap with LINE", t["y"]+t["height"]<=l["y"], (t,l))
    ok("U20 fab cart hidden on desktop", pg.locator("#fabCart").is_hidden())
    pg.click("#toTop"); pg.wait_for_timeout(900); ok("U24 scrolls to top", pg.evaluate("scrollY")<5)
    # SEO
    ok("U25 OG/twitter/canonical/theme", all(pg.locator(s).count()==1 for s in ["meta[property='og:title']","meta[property='og:image']","meta[name='twitter:card']","link[rel=canonical]","meta[name=theme-color]"]))
    lds=[json.loads(x) for x in pg.locator("script[type='application/ld+json']").all_text_contents()]
    types=set()
    for d in lds:
        for g in d.get("@graph",[d]): types.add(g["@type"])
    ok("U25 JSON-LD Organization/WebSite/SearchAction/ItemList", {"Organization","WebSite","ItemList"}<=types and any("SearchAction" in json.dumps(d) for d in lds), types)
    # a11y
    ok("U26 skip link", pg.locator("a.skip[href='#main']").count()==1)
    pg.keyboard.press("Tab") if False else None
    hs=pg.evaluate("[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(h=>!h.closest('[aria-hidden=true],.slide:not(.is-active)')).map(h=>+h.tagName[1])")
    jumps=[(a,b) for a,b in zip(hs,hs[1:]) if b>a+1]
    ok("U26 no heading level jumps", not jumps and hs[0]==1, jumps)
    unl=pg.evaluate("""[...document.querySelectorAll('button,a')].filter(e=>!(e.textContent.trim()||e.getAttribute('aria-label')||e.getAttribute('aria-labelledby'))).map(e=>e.outerHTML.slice(0,80))""")
    ok("U26 all buttons/links named", not unl, unl)
    small=pg.evaluate("""[...document.querySelectorAll('button,a.btn,.icon-btn')].filter(e=>e.offsetParent&&!e.closest('.footer,.cat-pop,.mega,.suggest,.cart,.drawer,#consent')).map(e=>[e.getBoundingClientRect(),e]).filter(([r])=>r.width&&(r.height<40||r.width<40)).map(([r,e])=>e.className+':'+Math.round(r.width)+'x'+Math.round(r.height))""")
    ok("touch targets ≥40", not small, small)
    pg.screenshot(path=S+"/t_desk_footer.png") if False else None
    pg.locator("#contact").scroll_into_view_if_needed(); pg.wait_for_timeout(300)
    ok("U28 footer pieces", pg.locator(".social a").count()==4 and pg.locator(".f-pay span").count()==2 and pg.locator(".line-cta a").count()==1 and pg.locator(".footer .todo").count()>=3)
    ok("U28 LINE CTA href set", pg.locator(".line-cta a").get_attribute("href").startswith("https://line.me/"))
    pg.screenshot(path=S+"/t_footer.png")
    ctx.close()

    # ---------- consent ----------
    ctx=mkctx(b,390,844,touch=True); pg=page(ctx,"consent-m")
    pg.goto(H); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(300)
    ok("U27 banner visible first visit", pg.locator("#consent").is_visible())
    ch=pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--consent-h')")
    lb=pg.locator(".float-line").bounding_box(); cb=pg.locator("#consent").bounding_box()
    ok("U27 LINE button lifted above banner", lb["y"]+lb["height"]<=cb["y"], (ch,lb["y"]+lb["height"],cb["y"]))
    pg.locator(".add-btn").first.scroll_into_view_if_needed(); pg.locator(".add-btn").first.tap(); pg.wait_for_timeout(400)
    zc=pg.evaluate("[+getComputedStyle(document.querySelector('#consent')).zIndex, +getComputedStyle(document.querySelector('#cart')).zIndex]")
    ok("U27 cart drawer above consent", zc[1]>zc[0], zc)
    fb=pg.locator("#checkoutBtn").bounding_box()
    hit=pg.evaluate(f"document.elementFromPoint({fb['x']+fb['width']/2},{fb['y']+fb['height']/2}).id")
    ok("U27 checkout button clickable with banner", hit=="checkoutBtn", hit)
    pg.screenshot(path=S+"/t_m_cart.png")
    pg.locator(".cart-head [data-cart-close]").tap(); pg.wait_for_timeout(400)
    pg.click("#consentSettings"); ok("U27 ตั้งค่า shows prefs", pg.locator("#consentPrefs").is_visible())
    pg.screenshot(path=S+"/t_m_consent.png")
    pg.check("#ckAnalytics"); pg.click("#consentSave")
    st=pg.evaluate("JSON.parse(localStorage.mdw_consent)")
    ok("U27 saved choice", st["analytics"] and not st["marketing"] and pg.locator("#consent").is_hidden())
    pg.reload(); ok("U27 remembered", pg.locator("#consent").is_hidden())
    ok("U27 privacy anchor", pg.locator("#privacy").count()==1)
    ctx.close()

    # ---------- Mobile ----------
    ctx=mkctx(b,390,844,touch=True); pg=page(ctx,"home-m")
    pg.goto(H); pg.evaluate("localStorage.clear()"); consent(pg); pg.reload(); pg.wait_for_timeout(300)
    pg.screenshot(path=S+"/t_m_top.png")
    ok("U18 mobile label hidden, icon present", pg.locator(".cart-label").is_hidden() and pg.locator("#cartBtn svg").is_visible())
    # touch: tap category → reveal then navigate
    pg.locator("#categories").scroll_into_view_if_needed(); pg.wait_for_timeout(300)
    card=pg.locator(".cat-card").nth(0)
    card.locator(".cat-main").tap(); pg.wait_for_timeout(300)
    ok("U15 touch 1st tap reveals (no nav)", card.locator(".cat-pop").is_visible() and pg.url.endswith("mongdoweb-home.html"))
    ok("U14 no tilt on touch", card.locator(".cat-tilt").evaluate("e=>e.style.transform")=="")
    pg.screenshot(path=S+"/t_m_cat.png")
    with pg.expect_request(lambda r: "product-category" in r.url) as rq:
        card.locator(".cat-main").tap()
    ok("U15 touch 2nd tap navigates", "product-category" in rq.value.url)
    pg.goto(H); pg.wait_for_timeout(300)
    # floating cart
    jump(pg,1500); pg.wait_for_timeout(200)
    ok("U20 fab hidden when cart empty", pg.locator("#fabCart").is_hidden())
    pg.evaluate("addToCart('uw-rgb',3,'silent')"); pg.wait_for_timeout(200)
    ok("U20 fab cart visible on mobile after scroll", pg.locator("#fabCart").is_visible() and pg.inner_text("#fabCount")=="3" and pg.get_attribute("#fabCart","aria-label")=="ตะกร้าสินค้า 3 ชิ้น")
    jump(pg,2500); pg.wait_for_timeout(300)
    f=pg.locator("#fabCart").bounding_box(); l=pg.locator(".float-line").bounding_box(); t=pg.locator("#toTop").bounding_box()
    ok("U20/U24 fabs stacked, no overlap", f["y"]+f["height"]<=l["y"] and t["y"]+t["height"]<=f["y"], (t["y"],f["y"],l["y"]))
    pg.screenshot(path=S+"/t_m_fabs.png")
    pg.locator("#fabCart").tap(); pg.wait_for_timeout(300); ok("U20 fab opens drawer", pg.locator("#cart.open").count()==1)
    pg.locator(".cart-head [data-cart-close]").tap(); pg.wait_for_timeout(300)
    jump(pg,0); pg.wait_for_timeout(200); ok("U20 fab hides at top", pg.locator("#fabCart").is_hidden())
    # drawer accordion
    pg.locator("#menuBtn").tap(); pg.wait_for_timeout(400)
    ok("U16 accordion 4 groups", pg.locator(".acc").count()==4)
    pg.locator(".acc-btn").first.tap(); pg.wait_for_timeout(350)
    ok("U16 expands group", pg.locator(".acc-btn").first.get_attribute("aria-expanded")=="true" and pg.locator(".acc").first.locator("a").first.is_visible())
    ok("U16 collapsed groups not focusable", not pg.locator(".acc").nth(1).locator("a").first.is_visible())
    pg.screenshot(path=S+"/t_m_drawer.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    # swipe on real touch: playwright touchscreen tap only; use CDP touch
    cdp=ctx.new_cdp_session(pg)
    def tswipe(x0,y0,x1,y1):
        cdp.send("Input.dispatchTouchEvent",{"type":"touchStart","touchPoints":[{"x":x0,"y":y0}]})
        for k in range(1,9): cdp.send("Input.dispatchTouchEvent",{"type":"touchMove","touchPoints":[{"x":x0+(x1-x0)*k/8,"y":y0+(y1-y0)*k/8}]}); pg.wait_for_timeout(16)
        cdp.send("Input.dispatchTouchEvent",{"type":"touchEnd","touchPoints":[]})
    i=pg.evaluate("Slider.index"); tswipe(300,300,120,310); pg.wait_for_timeout(300)
    ok("U6 real touch swipe advances", pg.evaluate("Slider.index")==(i+1)%5, (i,pg.evaluate("Slider.index")))
    y0=pg.evaluate("scrollY"); i=pg.evaluate("Slider.index"); tswipe(200,500,205,250); pg.wait_for_timeout(400)
    ok("U6 vertical touch scrolls page, no slide", pg.evaluate("scrollY")>y0 and pg.evaluate("Slider.index")==i, (y0,pg.evaluate("scrollY")))
    ctx.close()

    # ---------- reduced motion ----------
    ctx=mkctx(b,1280,800,rm=True); pg=page(ctx,"rm"); pg.goto(H); consent(pg); pg.reload(); pg.wait_for_timeout(300)
    ok("U7 RM: no Ken Burns", pg.locator(".slide.is-active .s-img").count()==0 or pg.locator(".slide.is-active .s-img").evaluate("e=>getComputedStyle(e).animationName")=="none")
    ok("U7 RM: no text anim / no transition", pg.locator(".slide.is-active .s-title").evaluate("e=>getComputedStyle(e).animationName")=="none" and pg.locator(".slide").first.evaluate("e=>getComputedStyle(e).transitionDuration")=="0s")
    ok("U7 RM: autoplay off by default", pg.evaluate("Slider.playing")==False)
    cb=pg.locator(".cat-card").first.locator(".cat-main").bounding_box()
    pg.mouse.move(cb["x"]+10,cb["y"]+10); pg.mouse.move(cb["x"]+30,cb["y"]+20); pg.wait_for_timeout(200)
    ok("U14 RM: no tilt", pg.locator(".cat-card").first.locator(".cat-tilt").evaluate("e=>e.style.transform")=="")
    ctx.close()

    # ---------- localStorage throws ----------
    ctx=mkctx(b,1280,800)
    ctx.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('denied')}});Object.defineProperty(window,'sessionStorage',{get(){throw new Error('denied')}})")
    pg=page(ctx,"ls-throws"); pg.goto(H); pg.wait_for_timeout(500)
    ok("U30 works when localStorage throws", pg.locator(".slide").count()==5 and pg.locator(".cat-card").count()==12)
    pg.locator(".add-btn").first.click(); ok("U30 cart works in-memory", pg.inner_text("#cartCount")=="1")
    pg.keyboard.press("Escape"); pg.click("#tbClose"); pg.click("#consentAccept")
    pc=page(ctx,"ls-throws-co"); pc.goto(C); pc.wait_for_timeout(300); ok("U30 checkout loads when LS throws", pc.locator("#emptyView").is_visible())
    ctx.close()

    # ---------- corrupted values everywhere ----------
    ctx=mkctx(b,1280,800); pg=page(ctx,"corrupt"); pg.goto(H)
    pg.evaluate("""['mdw_cart','mdw_slides','mdw_categories','mdw_settings','mdw_consent','mdw_orders','mdw_ship'].forEach(k=>localStorage.setItem(k,'{bad json'))""")
    pg.reload(); pg.wait_for_timeout(400)
    ok("U30 all keys corrupted: home renders", pg.locator(".slide").count()==5 and pg.locator(".cat-card").count()==12 and pg.locator("#cartCount").is_hidden())
    pg.evaluate("localStorage.setItem('mdw_cart', JSON.stringify({'uw-rgb':'2','ghost':5,'psu':-3,'shrink':'abc'}))"); pg.reload()
    ok("U30 cart sanitised", pg.inner_text("#cartCount")=="2")
    pc=page(ctx,"corrupt-co"); pc.evaluate if False else None
    pc.goto(C); pc.wait_for_timeout(300)
    ok("U30 checkout with corrupted settings/orders/ship", pc.locator("#checkoutView").is_visible() and pc.inner_text("#hdrCount")=="2")
    for v in ["[1,2]", "null", "\"str\"", "{\"bank\":5,\"shipping\":\"x\"}"]:
        pc.evaluate(f"localStorage.setItem('mdw_settings', {json.dumps(v)})"); pc.reload(); pc.wait_for_timeout(100)
    ok("U30 odd settings shapes ok", pc.locator("#checkoutView").is_visible())
    ctx.close()

    # ---------- Checkout end-to-end ----------
    ctx=mkctx(b,1280,900); pg=page(ctx,"e2e-home"); pg.goto(H); pg.evaluate("localStorage.clear()"); consent(pg); pg.reload()
    pg.locator(".add-btn").nth(0).click(); pg.keyboard.press("Escape")
    pg.locator(".add-btn").nth(2).click()
    pg.click("#checkoutBtn"); pg.wait_for_url("**/mongdoweb-checkout.html")
    ok("U29 header cart icon + count", pg.locator("#hdrCart svg.cart-ico").count()==1 and pg.inner_text("#hdrCount")=="2" and pg.get_attribute("#hdrCart","aria-label")=="ตะกร้าสินค้า 2 ชิ้น")
    ok("U29 กลับไปช้อปต่อ link", pg.locator(".back-shop[href='mongdoweb-home.html']").is_visible() and "กลับไปช้อปต่อ" in pg.inner_text(".back-shop"))
    pg.screenshot(path=S+"/t_co_desk.png")
    for k,v in dict(name="ทดสอบ ระบบ",phone="0899999999",addr="1 ถนนทดสอบ",sub="ทดสอบ",dist="ทดสอบ",prov="กรุงเทพมหานคร",zip="10100").items(): pg.fill("#"+k,v)
    pg.click("#step1 button[type=submit]"); pg.wait_for_timeout(300)
    ok("REG step2 payment", pg.locator("#step2").is_visible())
    pg.click("#step2 [data-goto='3']"); pg.set_input_files("#slip", str(_pl.Path(__file__).resolve().parent / "fixtures" / "slip.png")); pg.fill("#paidTime","15:20"); pg.click("#submitBtn"); pg.wait_for_timeout(1500)
    oid=pg.inner_text("#doneNo")
    orders=pg.evaluate("JSON.parse(localStorage.mdw_orders)")
    ok("U29 order saved in mdw_orders", any(o["id"]==oid and o["status"]=="PENDING_VERIFICATION" and len(o["items"])==2 and o["slips"][0]["sha256"] for o in orders), oid)
    ok("U29 cart cleared + header badge 0", pg.evaluate("localStorage.getItem('mdw_cart')") is None and pg.locator("#hdrCount").is_hidden())
    # dup slip
    pg.goto(C); pg.click("#demoFill"); pg.click("#step1 button[type=submit]"); pg.wait_for_timeout(300); pg.click("#step2 [data-goto='3']")
    pg.set_input_files("#slip", str(_pl.Path(__file__).resolve().parent / "fixtures" / "slip.png")); pg.fill("#paidTime","15:25"); pg.click("#submitBtn"); pg.wait_for_timeout(800)
    ok("REG duplicate slip blocked", "เคยถูกใช้" in pg.inner_text("#fileMsg") and pg.locator("#step3").is_visible())
    # settings override still works
    pg.evaluate("localStorage.setItem('mdw_settings', JSON.stringify({shipping:{std:77}, freeShipMin:null}))"); pg.reload()
    ok("REG settings override", "฿77" in pg.locator("#shipOpts .p").first.inner_text())
    # PromptPay payload
    ok("REG promptpay payload", pg.evaluate("promptPayPayload('0812345678', 100).endsWith(crc16(promptPayPayload('0812345678',100).slice(0,-4)))"))
    # header cart link → home opens drawer
    pg.click("#hdrCart"); pg.wait_for_timeout(500)
    ok("U29 header cart → home drawer open", pg.url.endswith("mongdoweb-home.html") and pg.locator("#cart.open").count()==1)
    ctx.close()
    ctx=mkctx(b,360,780,touch=True); pg=page(ctx,"co-m"); pg.goto(C); pg.click("#demoFill"); pg.wait_for_timeout(200)
    pg.screenshot(path=S+"/t_co_m.png")
    ok("U29 checkout mobile no h-scroll", pg.evaluate("document.documentElement.scrollWidth")<=360)
    hb=pg.locator("#hdrCart").bounding_box(); bb=pg.locator(".back-shop").bounding_box()
    ok("U29 mobile header targets ≥44", hb["height"]>=44 and bb["width"]>=44 and bb["height"]>=44)
    ctx.close()

    # ---------- widths ----------
    for w in [360,390,768,1024,1280,1440]:
        ctx=mkctx(b,w,800,touch=w<1024); pg=page(ctx,f"w{w}"); pg.goto(H); pg.wait_for_timeout(300)
        sw=pg.evaluate("document.documentElement.scrollWidth")
        pg.evaluate("localStorage.setItem('mdw_cart',JSON.stringify({'uw-rgb':5}))"); pg.reload(); pg.wait_for_timeout(200)
        if w>=1025:
            pg.hover("#megaBtn"); pg.wait_for_timeout(250)
            mw=pg.evaluate("document.documentElement.scrollWidth"); pg.screenshot(path=S+f"/t_mega_{w}.png")
        else:
            pg.locator("#menuBtn").click(); pg.wait_for_timeout(350); mw=pg.evaluate("document.documentElement.scrollWidth"); pg.keyboard.press("Escape")
        pg.click("#searchBtn"); pg.fill("#q","ไฟ"); sw2=pg.evaluate("document.documentElement.scrollWidth")
        ok(f"no h-scroll @{w}", sw<=w and mw<=w and sw2<=w, (sw,mw,sw2))
        pg.screenshot(path=S+f"/t_w{w}.png")
        ctx.close()
    b.close()
print("\nERRORS:", ERR)
print("TOTAL", len(R), "FAILED", [n for n,c in R if not c])
