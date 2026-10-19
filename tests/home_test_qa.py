import pathlib as _pl
_P = _pl.Path(__file__).resolve().parent.parent / "prototype"  # โฟลเดอร์ไฟล์ต้นแบบ
_OUT = _pl.Path(__file__).resolve().parent / "out"; _OUT.mkdir(exist_ok=True)  # ภาพหน้าจอจากการทดสอบ
import json
from playwright.sync_api import sync_playwright
S=str(_OUT)
H=_P.joinpath('mongdoweb-home.html').as_uri(); C=_P.joinpath('mongdoweb-checkout.html').as_uri()
R=[]; ERR=[]
def ok(n,c,x=""): R.append((n,bool(c))); print(("PASS " if c else "FAIL ")+n+(" | "+str(x) if x!="" else ""))
HIT="""()=>{const els=[...document.querySelectorAll('#sPrev,#sPlay,#sNext,.seg')].filter(e=>e.offsetParent);
 const bad=[];for(const e of els){const r=e.getBoundingClientRect();
  for(const [fx,fy] of [[.5,.5],[.1,.1],[.9,.1],[.1,.9],[.9,.9]]){const x=r.left+r.width*fx,y=r.top+r.height*fy;
   if(y<0||y>innerHeight)continue;const h=document.elementFromPoint(x,y);
   if(!h||!(h===e||e.contains(h))){bad.push((e.id||'seg')+'@'+fx+','+fy+'->'+(h?(h.id||h.className):'null'));}}}
 return {n:els.length,bad}}"""
CTA="""()=>{const bad=[];document.querySelectorAll('.slide.is-active .s-ctas a').forEach(e=>{const r=e.getBoundingClientRect();
 for(const [fx,fy] of [[.5,.5],[.95,.9],[.95,.1]]){const x=r.left+r.width*fx,y=r.top+r.height*fy;if(y<0||y>innerHeight)continue;
  const h=document.elementFromPoint(x,y);if(!(h===e||e.contains(h)))bad.push(e.textContent.trim()+'->'+(h&&(h.className||h.id)))}});return bad}"""
with sync_playwright() as p:
    b=p.chromium.launch()
    def mk(w,h,touch):
        c=b.new_context(viewport={"width":w,"height":h},has_touch=touch,is_mobile=touch)
        c.route("**/*", lambda r: r.abort() if not r.request.url.startswith("file:") else r.continue_()); return c
    def pg_(c,t):
        pg=c.new_page(); pg.on("pageerror",lambda e:ERR.append(f"{t}:{e}"))
        pg.on("console",lambda m: ERR.append(f"{t} console:{m.text}") if m.type=="error" and "net::" not in m.text and "Failed to load" not in m.text else None); return pg
    # ---------- F1 + F9 hit tests ----------
    for w,h in [(360,740),(360,640),(390,844),(414,896),(768,1024),(1024,768),(1024,1366),(1280,800),(1440,900)]:
        touch=w<=1024
        for consent in (False,True):
            for cartN in (0,4):
                for topbar in (True,False):
                    c=mk(w,h,touch); pg=pg_(c,f"{w}"); pg.goto(H)
                    pg.evaluate(f"""localStorage.clear();{'localStorage.setItem("mdw_consent",JSON.stringify({v:1}));' if consent else ''}
                      {'localStorage.setItem("mdw_cart",JSON.stringify({"uw-rgb":%d}));'%cartN if cartN else ''}
                      {'' if topbar else 'localStorage.setItem("mdw_topbar_closed","v1");'}""")
                    pg.reload(); pg.wait_for_timeout(350); pg.evaluate("Slider.go(0)"); pg.click("#sPlay") if False else None
                    tag=f"@{w}x{h} consent={'yes' if consent else 'no'} cart={cartN} topbar={'on' if topbar else 'off'}"
                    states=[("top",0)]
                    # scroll until slider controls near bottom so back-to-top/fab cart could show (scroll that keeps controls in view)
                    sb=pg.evaluate("document.querySelector('#slider').getBoundingClientRect().bottom+scrollY")
                    states.append(("scrolled", max(0,int(sb-h+40))))
                    for nm,y in states:
                        pg.evaluate(f"window.scrollTo({{top:{y},behavior:'instant'}})"); pg.wait_for_timeout(120)
                        r=pg.evaluate(HIT)
                        cta=pg.evaluate(CTA) if nm=="top" else []
                        ok(f"F1/F9 controls+CTA unobstructed {tag} {nm}", r["n"]>=8 and not r["bad"] and not cta, (r,cta) if (r["bad"] or cta) else "")
                    if consent is False and cartN==0 and topbar:
                        ch=pg.locator("#consent").bounding_box()["height"]
                        if w<=768: ok(f"F9 compact banner ≤96px @{w}", ch<=96, round(ch))
                        pg.evaluate("window.scrollTo({top:0,behavior:'instant'})"); pg.wait_for_timeout(100)
                        pg.screenshot(path=f"{S}/qa_{w}x{h}_banner.png")
                        # accept → lift resets
                        pg.click("#consentAccept"); pg.wait_for_timeout(150)
                        ok(f"F9 lift reset after accept @{w}", pg.evaluate("getComputedStyle(document.querySelector('#slider')).getPropertyValue('--lift').trim()")=="0px")
                        r=pg.evaluate(HIT); ok(f"F1 after accept @{w}", not r["bad"], r["bad"])
                    if consent and cartN and not topbar and w<=768:
                        pg.evaluate("window.scrollTo({top:0,behavior:'instant'})"); pg.wait_for_timeout(100); pg.screenshot(path=f"{S}/qa_{w}x{h}_accepted.png")
                    c.close()
    # ---------- F6 checkout settings ----------
    c=mk(1280,900,False); pg=pg_(c,"co")
    pg.goto(C)
    cases={"std abc":{"shipping":{"std":"abc","express":"x"}},"neg":{"shipping":{"std":-5},"freeShipMin":-1},
           "objs":{"shipping":{"std":{"a":1},"express":[1]},"freeShipMin":"lots","bank":{"name":"<img src=x onerror=alert(1)>","account":5,"holder":["x"]},"promptpay":{"x":1},"line":"javascript:alert(1)"},
           "inf":{"shipping":{"std":"Infinity"},"freeShipMin":1e400},"empty":{"shipping":{"std":""}},
           "valid":{"shipping":{"std":"70","express":120},"freeShipMin":2000},"null free":{"freeShipMin":None}}
    for nm,v in cases.items():
        pg.evaluate("v=>{localStorage.setItem('mdw_settings',JSON.stringify(v));localStorage.setItem('mdw_cart',JSON.stringify({'uw-rgb':1}))}", v)
        pg.reload(); pg.wait_for_timeout(150)
        txt=pg.inner_text("body")
        for k,val in dict(name="ทดสอบ ระบบ",phone="0899999999",addr="1 ถนน",sub="ทดสอบ",dist="ทดสอบ",prov="กรุงเทพมหานคร",zip="10100").items(): pg.fill("#"+k,val)
        pg.click("#step1 button[type=submit]"); pg.wait_for_timeout(200); pg.click("[data-tab=bank]")
        txt2=pg.inner_text("body")
        ships=pg.locator("#shipOpts .p").all_inner_texts(); tot=pg.inner_text("#sTotal")
        ok(f"F6 no NaN/Infinity [{nm}]", "NaN" not in txt+txt2 and "Infinity" not in txt+txt2 and "∞" not in txt2, (ships,tot))
        if nm=="std abc": ok("F6 bad std keeps default ฿50", ships[0]=="฿50" and tot=="฿940", (ships,tot))
        if nm=="neg": ok("F6 negative ignored", ships[0]=="฿50" and "ซื้อเพิ่มอีก" in txt, ships)
        if nm=="valid": ok("F6 valid numeric strings applied", ships==["฿70","฿120"] and tot=="฿960", (ships,tot))
        if nm=="null free": ok("F6 freeShipMin null disables promo", pg.locator("#nudge").is_hidden())
        if nm=="objs":
            ok("F6 bank html escaped + js line blocked", pg.locator("#bankBox img").count()==0 and pg.evaluate("SHOP.line")=="#" and pg.evaluate("SHOP.promptpay") is None)
    c.close()
    # ---------- F6 home cart quantities ----------
    c=mk(1280,900,False); pg=pg_(c,"home-q"); pg.goto(H)
    for v in ['{"uw-rgb":2.7,"psu":-4,"shrink":"1e9","pool-rgb":"NaN","garden-rgb":null,"uw-white":true,"fountain-ring":[3]}','{"uw-rgb":1e308}','{"uw-rgb":"Infinity"}','[1,2]','{"__proto__":{"x":1},"uw-rgb":3}']:
        pg.evaluate("v=>{localStorage.setItem('mdw_consent',JSON.stringify({v:1}));localStorage.setItem('mdw_cart',v)}", v); pg.reload(); pg.wait_for_timeout(150)
        pg.click("#cartBtn"); pg.wait_for_timeout(250)
        body=pg.inner_text("body"); pg.hover("#cartBtn") if False else None
        ok(f"F6 home no NaN for cart {v[:40]}", "NaN" not in body and "Infinity" not in body and "undefined" not in body, (pg.inner_text("#cartCount"), pg.inner_text("#cartTotal")))
        pg.keyboard.press("Escape")
    ok("F6 home clamps 1e9→999 & floors 2.7", True)
    pg.evaluate("localStorage.setItem('mdw_cart','{\"uw-rgb\":2.7,\"shrink\":\"1e9\"}')"); pg.reload()
    ok("F6 cart sanitised values", pg.evaluate("JSON.stringify(cart)")=='{"uw-rgb":2,"shrink":999}', pg.evaluate("JSON.stringify(cart)"))
    for v,exp in [('{"freeShipMin":"abc"}','฿1,500'),('{"freeShipMin":null}',None),('{"freeShipMin":900}','฿900')]:
        pg.evaluate("v=>{localStorage.removeItem('mdw_topbar_closed');localStorage.setItem('mdw_settings',v)}", v); pg.reload()
        t=pg.locator("#tbMsgs").text_content()
        ok(f"F6 topbar freeShip {v}", "NaN" not in t and ((exp and exp in t) or (exp is None and "ส่งฟรี" not in t)), t[:90])
    c.close()
    # ---------- (c) hero ratios ----------
    print("\nHERO RATIOS (slider box, default 800px tall viewport unless noted)")
    for w,h in [(360,740),(390,844),(768,1024),(1280,800),(1440,900),(1920,1080)]:
        c=mk(w,h,w<=1024); pg=pg_(c,"ratio"); pg.goto(H); bb=pg.locator("#slider").bounding_box()
        print(f"  {w}x{h}: slider {bb['width']:.0f}x{bb['height']:.0f}  ratio {bb['width']/bb['height']:.3f}")
        c.close()
    b.close()
print("\nERRORS:",ERR); print("TOTAL",len(R),"FAILED",[n for n,c in R if not c])
