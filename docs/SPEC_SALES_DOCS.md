# Sales documents module — spec (Quotation → Invoice → Receipt + Shipping label)

Owner request (Thai): "ช่วยทำต้นแบบระบบใบเสนอราคา กับ ใบแจ้งหนี้สินค้า และใบปะหน้าส่งของ จาก Back office อย่างมืออาชีพ ใช้ข้อมูลจากตัวอย่างไฟล์ที่ส่งไปประกอบ"
Owner decisions: VAT toggleable in settings (default OFF, like the samples) · full chain of 4 documents (ใบเสนอราคา → ใบแจ้งหนี้ → ใบเสร็จรับเงิน + ใบปะหน้า), converting without retyping · lives inside the existing back office `mongdoweb-admin.html` as new menus.

Reference samples (owner's real documents, images):
- Receipt: `/root/.claude/uploads/4324cb96-cf06-5a2e-b613-d46c19efc5d4/6ab62cbd-image.png`
- Invoice: `/root/.claude/uploads/4324cb96-cf06-5a2e-b613-d46c19efc5d4/ec854e74-image.png`
- Shop logo cropped from the invoice (113×89 PNG, transparent bg): `/tmp/claude-0/-home-claude/4324cb96-cf06-5a2e-b613-d46c19efc5d4/scratchpad/docs/logo.png` → embed as base64 default logo (settings lets the owner upload a sharper one).

## Facts taken from the samples (use exactly)
- Shop: **ร้านมองดูเว็บ** · 88/2 หมู่ที่ 8 ตำบลบางกรวย อำเภอบางกรวย จังหวัดนนทบุรี 11130 · โทร 080-884-9597 · ไอดีไลน์ @mongdoweb
- Doc number pattern: `N2605-00002` = PREFIX + YY (AD, 2 digits) + MM + `-` + 5-digit running number, reset each month. Make prefixes per type configurable; defaults QT (ใบเสนอราคา), IV (ใบแจ้งหนี้), RC (ใบเสร็จรับเงิน). Keep the "N" style possible.
- Dates on the samples are AD d/m/yyyy (5/5/2026). Default display = AD d/m/yyyy; setting allows พ.ศ. (5/5/2569).
- Receipt header shows: เลขที่, วันที่, วันที่พิมพ์ + time, การชำระเงิน (e.g. เงินสด), หน้า 1 / 1, customer box with รหัสลูกค้า (4 digits, e.g. 0495), ชื่อลูกค้า, ที่อยู่ with "(สำนักงานใหญ่)" branch, เลขประจำตัวผู้เสียภาษี, โทร.
- Line columns: ลำดับ · รหัสสินค้า · รายการสินค้า · รายละเอียด/หน่วย (อัน, กล่อง) · ราคาขาย/บาท · จำนวน · ราคารวม/บาท. Shipping appears as a normal line: code `Shipping`, "ค่าส่งสินค้า", unit กล่อง.
- Totals: ราคารวมสินค้า, ส่วนลด, ราคารวมสุทธิ. Signature lines: ผู้รับเงิน, ผู้รับสินค้า. Footer: "*** ขอบคุณที่ใช้บริการ ***".
- Invoice sample adds: logo, barcode of the document number, "จาก" (shop address block) / "ส่งเบิกไปที่" (bill-to), order date, วิธีชำระเงิน (โอนเงินผ่านธนาคาร), shipping cost with carrier ("100 ฿ โดย EMS"), and "หมายเหตุลูกค้า" carrying company + tax ID.
- Real product codes to seed the product list (shop's own data, OK to use):
  - `DL1-ww` โคมไฟฝังฝ้า ไฟดาวไลท์ Downlight 1w (วอร์มไวท์) · หน่วย อัน · 190.00
  - `GDL-F24WH-1-2-1-1` ไฟส่องต้นไม้ ไฟส่องสวนหย่อม ไฟส่องสนามหญ้า 24W แสงวอร์มไวท์ · หน่วย ชุด · 2,150.00
  - `Shipping` ค่าส่งสินค้า · หน่วย กล่อง · 60.00 (service line, no stock)
  - plus the 9 CATALOG items already used by home/checkout (give them SKUs like `UW-RGB-10`, `UW-WH-10`, `PL-RGB-12`, `FT-RING`, `PL-WH-12`, `GL-WH`, `GL-RGB`, `PSU-12V`, `ACC-SHRINK`) with the same names/prices.
- **Privacy:** the sample customers (companies, people, emails, phones, tax IDs) are REAL customers. Do NOT copy any of them into the file. Seed 4–5 fictional customers with the same shapes: 2 companies with 13-digit tax IDs that pass the Thai checksum + branch "สำนักงานใหญ่" / "สาขาที่ 00001", 2 individuals, one in Nakhon Ratchasima style address, one Bangkok. Use obviously fictional names (e.g. "บริษัท ตัวอย่างแสงไทย จำกัด").

## Data (localStorage, try/catch everywhere, same robustness rules as the rest of admin)
- `mdw_customers`: `[{id, code:'0001'.., kind:'company'|'person', name, taxId, branch, contact, phone, email, address:{line, sub, dist, prov, zip}, shipTo:null|{name, phone, address}, note, createdAt, updatedAt}]`
- `mdw_products_doc`: `[{sku, name, unit, price, kind:'goods'|'service', active}]` — editable list (simple page or modal), seeded as above.
- `mdw_docs`: `[{id, type:'QT'|'IV'|'RC', no, status, date, validUntil (QT) | dueDate (IV), customer: <snapshot of customer at issue>, customerId, items:[{sku, name, detail, unit, qty, price, discount}], billDiscount, vat:{mode:'none'|'exclusive'|'inclusive', rate:7}, totals:{subtotal, discount, afterDiscount, vat, grand} (always recomputed, never trusted), paymentMethod, paymentTerms, shipping:{carrier, note}, note (shown on doc), internalNote, refs:{quoteId, invoiceId, receiptIds:[], orderId}, payments:[{id, date, amount, method, ref, receiptId}], createdAt, createdBy, events:[{at, by, type, note}]}]`
- `mdw_doc_seq`: `{ 'QT-2610': 3, 'IV-2610': 1, ... }` — allocate numbers ONLY when a doc is issued (draft has no number, shows "ฉบับร่าง"); never reuse a number; voided docs keep their number.
- Settings additions in `mdw_settings.docs` (keep all existing settings fields intact): company legal name, address, phone, line, email, taxId, branch, logo (data URL), vatEnabled (default false), vatMode default 'exclusive', prefixes {QT, IV, RC}, dateEra 'AD'|'BE', quoteValidDays 30, invoiceDueDays 7, default terms per type (QT: ยืนราคา 30 วัน, ส่งของภายใน 2–3 วันหลังชำระเงิน, รับประกัน 1 ปี; IV: ชำระภายในวันที่ครบกำหนด, โอนแล้วแจ้งสลิปทาง LINE; RC: none), bank/PromptPay reused from existing settings, showSignatureLines.
- Money: compute in satang integers internally, round half-up per line, display 2 decimals with thousands separators (sample: 1,580.00).

## Workflow
1. ใบเสนอราคา: draft → ออกเอกสาร (gets QT number, status รอตอบรับ) → ลูกค้าตอบรับ / ไม่ตอบรับ / หมดอายุ (auto from validUntil). Actions: แก้ไข (draft only; an issued QT is edited via "สร้างฉบับแก้ไข" = new revision number suffix `-R1` or simply a new QT referencing the old — pick one, be consistent), ทำสำเนา, พิมพ์/บันทึก PDF, **แปลงเป็นใบแจ้งหนี้** (copies customer/items/terms, links refs, marks QT ตอบรับแล้ว).
2. ใบแจ้งหนี้ (ใบแจ้งหนี้/ใบวางบิล): statuses ค้างชำระ / ชำระบางส่วน / ชำระแล้ว / เกินกำหนด (computed from dueDate) / ยกเลิก. Shows payment box: bank account + PromptPay QR WITH the outstanding amount (reuse the EMVCo payload + CRC16 code from checkout; QR drawn with the same cdnjs qrcodejs as checkout, hidden gracefully if it can't load). **บันทึกรับชำระ** (date, amount ≤ outstanding, method, ref) → automatically issues a ใบเสร็จรับเงิน for that payment (partial payments → multiple receipts).
3. ใบเสร็จรับเงิน: layout close to the owner's receipt sample. When VAT is enabled, title becomes "ใบเสร็จรับเงิน/ใบกำกับภาษี" and must show seller tax ID + branch and buyer tax ID + branch (Thai full tax invoice fields). Void with reason (ยกเลิก) instead of delete; voided prints a large "ยกเลิก" watermark.
4. Also: from an existing web order (mdw_orders, status PAID/SHIPPED) → "ออกใบเสร็จ" / "ออกใบแจ้งหนี้" in the order drawer, creating the customer from the order if not existing (match by phone).
5. ใบปะหน้าส่งของ: from an invoice/receipt or web order. Sizes: **A6 100×150 mm** (thermal label printer) and **A4 with 4 labels**. Content: sender block (shop), "ผู้รับ" big and bold (name, phone, full address), postal code in large boxes, doc/order no + Code128 barcode, carrier, number of boxes ("กล่องที่ 1/2" — choose count before printing, prints one label per box), optional COD amount, handling marks (ระวังแตก / ห้ามโยน / ตั้งขึ้น — lights are fragile), optional item summary (toggle, off by default for privacy). Upgrade the existing A21 order label to use this same component instead of keeping two different labels.

## Document design (print = the product)
- A4 portrait, real mm sizing in print CSS, 12–15 mm margins, Noto Sans Thai (fallback Sarabun/Tahoma), crisp black text, one restrained accent (shop orange #F26B38 for the title rule / table header line; must still look right printed in black & white).
- Header: logo + shop block left; document title (large) + เลขที่/วันที่/ครบกำหนด or ยืนราคาถึง/อ้างอิง + barcode right. Label ต้นฉบับ / สำเนา (print option "ต้นฉบับ + สำเนา" prints both).
- Customer box + document info box like the receipt sample (rounded boxes are fine — the sample uses them).
- Items table with header row repeated on every page; **JS pagination** into separate A4 sheets (rows per page computed so totals/signatures fit on the last page), "หน้า x / y" on each sheet, "ยอดยกไป/ยอดยกมา" optional is not required.
- Totals block right: รวมเป็นเงิน, ส่วนลด, ยอดหลังหักส่วนลด, (VAT 7% / ราคาก่อนภาษี when VAT on), **ยอดรวมสุทธิ**; left of it the amount in Thai words "(หนึ่งพันห้าร้อยแปดสิบบาทถ้วน)" — implement and unit-test bahtText (satang, 21/11/101/1,000,001, zero, ล้าน repetition).
- Notes/terms, payment info (IV: bank + QR), signature lines with "วันที่ ____" (QT: ผู้เสนอราคา / ผู้อนุมัติสั่งซื้อ; IV: ผู้วางบิล / ผู้รับวางบิล; RC: ผู้รับเงิน / ผู้รับสินค้า as sample), footer "*** ขอบคุณที่ใช้บริการ ***".
- Browser print = "บันทึกเป็น PDF": set `document.title` to the doc number before printing so the PDF file is named e.g. `QT2610-00001.pdf`.

## Back-office UI
- Sidebar: new group "เอกสารขาย" → ใบเสนอราคา · ใบแจ้งหนี้ · ใบเสร็จรับเงิน · ลูกค้า (and product list reachable from the editor or settings). Keep existing pages untouched.
- List pages: KPIs (ใบเสนอราคารอตอบรับ, ยอดค้างชำระ, เกินกำหนด count+amount, รับชำระเดือนนี้), status tabs, search (no., customer, tax ID, phone), date range, pagination, CSV export, row actions.
- Editor: full-screen; left form, right **live A4 preview** (scaled to fit) updating as you type; customer autocomplete + "เพิ่มลูกค้าใหม่" inline; product autocomplete by SKU/name with free-text lines allowed; qty/price/discount per line with instant totals; reorder lines (drag + up/down), delete line, add shipping line quickly; validation in Thai (customer required, ≥1 line, qty>0, price≥0, tax ID checksum when entered, VAT invoice requires buyer tax ID when company); draft autosave like slides (G1); unsaved-changes guard.
- Customers page: list/search/add/edit, tax ID checksum, document history per customer with outstanding balance.
- Audit: every issue/convert/payment/void writes the doc's events AND `mdw_admin_log`.
- Mobile 390px: lists as cards, editor stacked (preview collapsible), no horizontal scroll.

## Quality bar
- No console errors; corrupted storage tolerated; all user text escaped; nothing in the print output that looks like app chrome (buttons, sidebars) — print CSS hides everything except the sheets.
- Test with Python Playwright: full chain QT → IV → partial payment → RC#1 → second payment → RC#2 → IV paid; VAT off vs exclusive vs inclusive totals; numbering per month, never reused, void keeps number; bahtText unit cases; pagination with 40 lines (multiple sheets, header repeated, totals only on last); print-media screenshots / `page.pdf()` of every doc type + labels A6 and A4×4, and LOOK at them (Read tool) against the owner's samples; web order → receipt; label from order; regression: run the existing suites in `/tmp/claude-0/-home-claude/4324cb96-cf06-5a2e-b613-d46c19efc5d4/scratchpad/lotA/` (test_all.py, test_round2.py, test_e2e_flow.py) — all must still pass.
