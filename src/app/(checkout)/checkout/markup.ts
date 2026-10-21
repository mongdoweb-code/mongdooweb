// HTML หน้าชำระเงิน ย้ายมาจาก prototype/mongdoweb-checkout.html แล้วเพิ่ม: เลือกจังหวัด 77 จังหวัด, ตรวจรหัสไปรษณีย์ตามจังหวัด,
// จำที่อยู่ (ต้องติ๊กเอง), ขอใบกำกับภาษี, ย่อรูปสลิปก่อนอัปโหลด, หน้าสั่งซื้อสำเร็จ — พฤติกรรมอยู่ใน public/js/checkout.js
import { PROVINCES } from "@/lib/thai-address";

const ICON_CART =
  '<svg class="cart-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h3l3 12h11l2-8H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>';

/** ช่องกรอก + ข้อความผิด (ผูก aria-describedby ให้โปรแกรมอ่านหน้าจออ่านข้อความผิด) */
const field = (id: string, label: string, input: string, msg: string, cls = "") =>
  `<div class="field${cls ? " " + cls : ""}"><label for="${id}">${label}</label>${input.replace("<input", `<input id="${id}" name="${id}" aria-describedby="err-${id}"`).replace("<select", `<select id="${id}" name="${id}" aria-describedby="err-${id}"`).replace("<textarea", `<textarea id="${id}" name="${id}" aria-describedby="err-${id}"`)}<span class="msg" id="err-${id}" aria-live="polite">${msg}</span></div>`;

const provinceOptions = ['<option value="">— เลือกจังหวัด —</option>', ...PROVINCES.map((p) => `<option value="${p}">${p}</option>`)].join("");

export const CHECKOUT_BODY = `<a href="#content" class="skip">ข้ามไปยังเนื้อหาหลัก</a>

<header class="header">
  <div class="container">
    <a href="/" class="logo" aria-label="มองดูเว็บ หน้าแรก"><div class="logo-mark"><span></span></div><div>มองดูเว็บ<small>MONGDOWEB LED</small></div></a>
    <div class="h-right">
      <div class="secure">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="5" y="11" width="14" height="10"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
        <span>ข้อมูลของคุณได้รับการปกป้อง</span>
      </div>
      <a href="/" class="back-shop" aria-label="กลับไปช้อปต่อ">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg><span>กลับไปช้อปต่อ</span>
      </a>
      <a href="/#cart" class="cart-btn" id="hdrCart" aria-label="ตะกร้าสินค้า ว่าง">${ICON_CART}
        <span class="cart-label" aria-hidden="true">ตะกร้า</span>
        <span class="cart-count" id="hdrCount" aria-hidden="true" hidden>0</span>
      </a>
    </div>
  </div>
</header>
<div id="content" tabindex="-1"></div>

<!-- ===== ตะกร้าว่าง ===== -->
<main class="container" id="emptyView" hidden>
  <div class="done">
    <h1>ยังไม่มีสินค้าในตะกร้า</h1>
    <p class="ordno">เลือกสินค้าจากหน้าแรกก่อน แล้วกลับมาที่หน้านี้</p>
    <div class="btns">
      <a href="/" class="btn btn-primary">กลับไปเลือกสินค้า</a>
      <a href="/track" class="btn btn-outline">ติดตามคำสั่งซื้อ / แนบสลิป</a>
    </div>
  </div>
</main>

<!-- ===== Checkout ===== -->
<main class="container" id="checkoutView" hidden>
  <ol class="stepper" id="stepper">
    <li><b>01</b><span>ข้อมูลจัดส่ง</span></li>
    <li><b>02</b><span>ชำระเงิน</span></li>
    <li><b>03</b><span>แนบสลิป</span></li>
  </ol>
  <div class="co-notice" id="coNotice" role="status" aria-live="polite" hidden></div>

  <div class="layout">
    <div>
      <!-- STEP 1: ข้อมูลจัดส่ง -->
      <form class="card" id="step1" novalidate>
        <h2>ข้อมูลจัดส่ง</h2>
        <p class="sub">กรอกข้อมูลให้ครบ เพื่อให้พัสดุถึงมือคุณถูกต้อง</p>
        <div class="saved-addr" id="savedAddr" hidden>
          <span>ใช้ที่อยู่ที่จำไว้ในเครื่องนี้</span>
          <button type="button" class="link" id="forgetAddr">ลบข้อมูลที่จำไว้</button>
        </div>

        <div class="grid2">
          ${field("name", "ชื่อ-นามสกุลผู้รับ", '<input autocomplete="name" required>', "กรุณากรอกชื่อ-นามสกุลผู้รับ")}
          ${field("phone", "เบอร์โทรศัพท์ <i>(มือถือหรือเบอร์บ้าน)</i>", '<input inputmode="tel" autocomplete="tel" placeholder="08X-XXX-XXXX" required>', "เบอร์โทรไม่ถูกต้อง")}
        </div>
        ${field("email", "อีเมล <i>(ไม่บังคับ — สำหรับรับใบยืนยันคำสั่งซื้อ)</i>", '<input type="email" autocomplete="email">', "รูปแบบอีเมลไม่ถูกต้อง")}
        ${field("addr", "ที่อยู่ <i>(บ้านเลขที่ หมู่บ้าน ถนน ซอย)</i>", '<input autocomplete="street-address" required>', "กรุณากรอกบ้านเลขที่ และถนน/ซอย")}
        <div class="grid2">
          ${field("sub", "แขวง / ตำบล", '<input required>', "กรุณากรอกแขวง/ตำบล")}
          ${field("dist", "เขต / อำเภอ", '<input required>', "กรุณากรอกเขต/อำเภอ")}
        </div>
        <div class="grid2">
          ${field("prov", "จังหวัด", `<select autocomplete="address-level1" required>${provinceOptions}</select>`, "กรุณาเลือกจังหวัดจากรายการ")}
          ${field("zip", "รหัสไปรษณีย์", '<input inputmode="numeric" maxlength="5" autocomplete="postal-code" required>', "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก")}
        </div>
        ${field("note", "หมายเหตุถึงร้าน <i>(ไม่บังคับ)</i>", '<textarea placeholder="เช่น ฝากไว้ที่ป้อมยาม, โทรก่อนส่ง"></textarea>', "")}

        <label class="check" for="wantTax"><input type="checkbox" id="wantTax" aria-controls="taxBox"><span><b>ต้องการใบกำกับภาษี / ใบเสร็จในนามบริษัท</b><small>ร้านจะออกเอกสารตามข้อมูลนี้เมื่อตรวจสลิปแล้ว</small></span></label>
        <fieldset class="tax-box" id="taxBox" hidden>
          <legend class="sr-only">ข้อมูลสำหรับออกใบกำกับภาษี</legend>
          <div class="seg" role="radiogroup" aria-label="ประเภทผู้ซื้อ">
            <label><input type="radio" name="tiKind" value="COMPANY" checked> นิติบุคคล / บริษัท</label>
            <label><input type="radio" name="tiKind" value="PERSON"> บุคคลธรรมดา</label>
          </div>
          ${field("tiName", '<span id="tiNameLbl">ชื่อบริษัท / นิติบุคคล</span>', '<input autocomplete="organization">', "กรุณากรอกชื่อสำหรับออกใบกำกับภาษี")}
          <div class="grid2">
            ${field("tiTaxId", "เลขประจำตัวผู้เสียภาษี (13 หลัก)", '<input inputmode="numeric" maxlength="17" placeholder="0-0000-00000-00-0">', "เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง (13 หลัก)")}
            ${field("tiBranch", "สาขา", '<input value="สำนักงานใหญ่" placeholder="สำนักงานใหญ่ หรือรหัสสาขา 5 หลัก">', "กรุณาระบุสาขา", "ti-branch")}
          </div>
          <label class="check" for="tiSame"><input type="checkbox" id="tiSame" checked aria-controls="tiAddrWrap"><span>ใช้ที่อยู่เดียวกับที่อยู่จัดส่ง</span></label>
          <div id="tiAddrWrap" hidden>
            ${field("tiAddr", "ที่อยู่สำหรับออกใบกำกับภาษี", '<textarea rows="3"></textarea>', "กรุณากรอกที่อยู่สำหรับออกใบกำกับภาษี")}
          </div>
        </fieldset>

        <h3>วิธีจัดส่ง</h3>
        <div class="ship-opts" id="shipOpts"></div>

        <label class="check remember" for="remember"><input type="checkbox" id="remember"><span><b>จำชื่อและที่อยู่นี้ไว้ในเครื่องนี้</b><small>สำหรับการสั่งซื้อครั้งถัดไป · เก็บเฉพาะในเบราว์เซอร์นี้ และลบได้ทุกเมื่อ</small></span></label>

        <div class="actions">
          <a href="/#cart" class="link">← กลับไปแก้ตะกร้า</a>
          <button class="btn btn-primary" type="submit">ไปขั้นตอนชำระเงิน →</button>
        </div>
      </form>

      <!-- STEP 2: ชำระเงิน -->
      <section class="card" id="step2" hidden aria-labelledby="payTitle">
        <h2 id="payTitle">ชำระเงิน</h2>
        <p class="sub">โอนเงินตามยอดด้านล่าง แล้วแนบสลิปในขั้นตอนถัดไป · จดเลขที่คำสั่งซื้อไว้ใช้ติดตามสถานะ</p>
        <div class="pay-amount">
          <div><span>ยอดที่ต้องชำระ</span><b id="payAmount">฿0</b>
            <button type="button" class="copy" data-copy-amount>คัดลอกยอด</button></div>
          <div class="ord"><span>เลขที่คำสั่งซื้อ</span><b id="orderNo">-</b></div>
        </div>

        <div class="tabs" role="tablist">
          <button type="button" class="tab on" data-tab="qr" role="tab" aria-selected="true">QR PromptPay</button>
          <button type="button" class="tab" data-tab="bank" role="tab" aria-selected="false">โอนเข้าบัญชีธนาคาร</button>
        </div>

        <div class="pane on" id="pane-qr">
          <div class="qr-wrap">
            <div class="qr" id="qrBox"></div>
            <ol class="howto">
              <li>เปิดแอปธนาคารบนมือถือ เลือก "สแกนจ่าย"</li>
              <li>สแกน QR นี้ ยอดเงินจะขึ้นให้อัตโนมัติ</li>
              <li>ตรวจชื่อบัญชีผู้รับให้ตรงกับ <b id="qrName"></b></li>
              <li>บันทึกสลิปไว้ เพื่อแนบในขั้นตอนถัดไป</li>
            </ol>
          </div>
        </div>

        <div class="pane" id="pane-bank">
          <div class="bank" id="bankBox"></div>
          <p class="note">โปรดโอนยอดให้ตรงกับยอดคำสั่งซื้อ เพื่อให้ตรวจสอบได้รวดเร็ว</p>
        </div>

        <div class="actions">
          <button type="button" class="link" data-goto="1">← แก้ไขข้อมูลจัดส่ง</button>
          <div class="act-right">
            <button type="button" class="btn btn-outline" id="payLater">โอนทีหลัง</button>
            <button type="button" class="btn btn-primary" data-goto="3">โอนแล้ว ไปแนบสลิป →</button>
          </div>
        </div>
      </section>

      <!-- STEP 3: แนบสลิป -->
      <form class="card" id="step3" hidden novalidate>
        <h2>แนบสลิปการโอน</h2>
        <p class="sub">อัปโหลดภาพสลิป ทีมงานจะตรวจสอบและยืนยันคำสั่งซื้อให้</p>

        <label class="drop" id="drop">
          <input type="file" id="slip" accept="image/jpeg,image/png,image/webp" aria-describedby="fileMsg">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/></svg>
          <b>คลิกเพื่อเลือกไฟล์ หรือลากภาพสลิปมาวาง</b>
          <small>รองรับ JPG, PNG, WEBP · รูปจากมือถือขนาดใหญ่ระบบย่อให้อัตโนมัติ</small>
        </label>
        <div class="preview" id="preview">
          <img id="previewImg" alt="ตัวอย่างสลิปที่จะส่ง">
          <div><b id="previewName"></b><small id="previewSize"></small><br><button type="button" class="link" id="slipRemove">เปลี่ยนไฟล์</button></div>
        </div>
        <div class="file-msg" id="fileMsg" role="alert"></div>

        <h3>รายละเอียดการโอน</h3>
        <div class="grid2">
          ${field("paidAt", "วันที่โอน", '<input type="date">', "กรุณาระบุวันที่โอน")}
          ${field("paidTime", "เวลาที่โอน", '<input type="time">', "กรุณาระบุเวลาที่โอน")}
        </div>
        ${field("paidAmt", "ยอดที่โอน (บาท)", '<input inputmode="decimal">', "กรุณากรอกยอดที่โอน")}

        <div class="upload-progress" id="upProg" hidden>
          <div class="up-label"><span id="upLabel">กำลังส่งสลิป…</span><b id="upPct">0%</b></div>
          <div class="up-bar" role="progressbar" aria-labelledby="upLabel" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="upBar"><i></i></div>
        </div>

        <div class="actions">
          <button type="button" class="link" data-goto="2">← กลับไปดูวิธีโอน</button>
          <button class="btn btn-primary" type="submit" id="submitBtn">ยืนยันคำสั่งซื้อ</button>
        </div>
      </form>
    </div>

    <!-- สรุปคำสั่งซื้อ -->
    <aside class="summary" aria-label="สรุปคำสั่งซื้อ">
      <details id="sumDetails" open>
        <summary><h2>สรุปคำสั่งซื้อ</h2><span class="tot-mini" id="totMini"></span></summary>
        <div class="sum-body">
          <div id="sumItems"></div>
          <div class="rows">
            <div><span>ค่าสินค้า</span><b id="sSub"></b></div>
            <div><span>ค่าจัดส่ง</span><b id="sShip"></b></div>
            <div class="grand"><span>ยอดชำระทั้งหมด</span><b id="sTotal"></b></div>
          </div>
          <div class="nudge" id="nudge"></div>
          <div class="ship-to" id="shipTo"></div>
        </div>
      </details>
    </aside>
  </div>
</main>

<!-- ===== สั่งซื้อสำเร็จ ===== -->
<main class="container" id="doneView" hidden>
  <div class="done success" id="doneCard">
    <div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg></div>
    <h1 id="doneTitle" tabindex="-1">ได้รับคำสั่งซื้อแล้ว ขอบคุณครับ</h1>
    <div class="done-ids">
      <div><span>เลขที่คำสั่งซื้อ</span><b id="doneNo"></b><button type="button" class="copy" data-copy-order>คัดลอก</button></div>
      <div><span>ยอดชำระ</span><b id="doneAmt"></b><button type="button" class="copy" data-copy-amount>คัดลอกยอด</button></div>
    </div>
    <div class="status" id="doneStatus">สถานะ: รอตรวจสอบสลิป</div>

    <section class="done-sec" aria-labelledby="dsSum">
      <h2 id="dsSum">สรุปคำสั่งซื้อ</h2>
      <div id="doneItems"></div>
      <div class="rows" id="doneRows"></div>
      <div class="done-addr" id="doneAddr"></div>
    </section>

    <section class="done-sec" aria-labelledby="dsPay" id="donePay">
      <h2 id="dsPay">ช่องทางชำระเงิน</h2>
      <p class="note" id="donePayNote"></p>
      <div class="bank" id="doneBanks"></div>
    </section>

    <section class="done-sec" aria-labelledby="dsNext">
      <h2 id="dsNext">ขั้นตอนถัดไป</h2>
      <ul class="timeline" id="doneTimeline"></ul>
    </section>

    <div class="btns no-print">
      <a href="/track" class="btn btn-primary" id="doneTrack">ติดตามคำสั่งซื้อ</a>
      <button type="button" class="btn btn-outline" id="doneUpload" hidden>แนบสลิปตอนนี้</button>
      <button type="button" class="btn btn-outline" id="doneImage">บันทึกเป็นรูป</button>
      <button type="button" class="btn btn-outline" id="donePrint">พิมพ์</button>
    </div>
    <div class="btns no-print" style="margin-top:10px">
      <a href="#" class="btn btn-line" id="doneLine">สอบถามทาง LINE</a>
      <a href="/" class="btn btn-ghost">กลับหน้าแรก</a>
    </div>
  </div>
</main>

<div class="toast" id="toast" role="status" aria-live="polite"></div>`;
