# MongdoWeb (มองดูเว็บ) — project context for Claude Code

Thai-language e-commerce shop for LED lighting (underwater, pool, fountain, garden, building lights).
Live site today: WordPress/WooCommerce at mongdoweb.com (มองดูเว็บ.com). This folder is the
**approved HTML prototype + database design** for the rebuild. Next job: build the real app.

## Talk to the owner
- Always answer in **Thai**. Briefly explain what code does. Ask before building when requirements are incomplete.
- The owner is non-technical on infrastructure; prefer clear choices over jargon.

## Target stack (decided)
- Next.js (App Router) + TypeScript, **Prisma ORM 7** + PostgreSQL.
- Prisma 7 specifics (already applied in `prisma/`): generator `prisma-client` with `output`,
  `DATABASE_URL` lives in `prisma.config.ts` (not in the schema), client uses `@prisma/adapter-pg`,
  `.env` is NOT auto-loaded (`import "dotenv/config"`). Example `src/lib/prisma.ts` is in the comment at the end of `prisma.config.ts`.
- Admin at `/admin/login`, credentials auth (hashed passwords, httpOnly session cookie, server-side login throttling).
- **No payment gateway**: customers transfer money / scan PromptPay QR and upload a slip; admin verifies.
- Storage abstraction `STORAGE_DRIVER=local|s3` for slips, slide images, product images, logo (both implemented).
- Notifications via LINE Messaging API (LINE Notify is discontinued).

## What's in this folder
| Path | What it is |
|---|---|
| `prototype/mongdoweb-home.html` | Storefront homepage: 5-slide hero (admin-editable), mega-menu + 3D category cards with hover dropdown, product finder quiz, mini-cart drawer, search, PDPA banner, SEO meta/JSON-LD |
| `prototype/mongdoweb-checkout.html` | Checkout: address → bank transfer / PromptPay QR (EMVCo payload + CRC16, verified by decoding) → slip upload with SHA-256 duplicate check → order saved |
| `prototype/mongdoweb-admin.html` | Back office (login `admin` / `demo1234`, prototype only): orders + slip review with automatic checks, approve/reject/ship, CSV, 7-day chart, slides manager, categories manager, settings, activity log, idle timeout, **sales documents** (see below) |
| `prisma/schema.prisma` | Full data model (17 models) incl. slides, categories, customers, sales documents (QT → IV → RC), payments, doc numbering, audit logs. Validated with Prisma's validator |
| `prisma.config.ts` | Prisma 7 config (place at project root) |
| `docs/SHARED_CONTRACT.md`, `docs/shared-data.js` | Data contract between storefront and admin (slides, categories) + default content (5 slides with Unsplash photos and Thai sales copy, 12 categories) |
| `docs/CHECKLIST_60.md` | The 60 requirements of round 1 (U1–U30 storefront, A1–A30 admin) — all passed independent re-check |
| `docs/SPEC_SALES_DOCS.md` | Spec for the sales-documents module (ใบเสนอราคา → ใบแจ้งหนี้ → ใบเสร็จรับเงิน + ใบปะหน้า) |
| `docs/reference/` | Logo cropped from the owner's invoice. The owner's real receipt/invoice samples are **not committed** (they contain real customer data) — never copy those customers into code, seeds or tests. |
| `tests/` | Python Playwright regression suites (run against `prototype/`) |

## Sales documents module (in the admin prototype, spec: `docs/SPEC_SALES_DOCS.md`)
- Chain: ใบเสนอราคา (QT) → แปลงเป็นใบแจ้งหนี้ (IV) → บันทึกรับชำระ → ใบเสร็จรับเงิน (RC) auto-issued per payment (partial payments = several receipts) · web orders → IV/RC · ใบปะหน้า A6 100×150 mm or A4×4 from orders/docs (one label per box, barcode, COD, handling marks).
- Numbers: PREFIX+YYMM-NNNNN (e.g. `QT2610-00001`), monthly reset, assigned only on issue, never reused, void keeps the number. Revisions of an issued QT = new QT referencing the old one (old one voided "มีฉบับแก้ไข").
- VAT is a setting (default OFF like the owner's current documents): exclusive or inclusive 7%; with VAT on, the receipt prints as "ใบเสร็จรับเงิน / ใบกำกับภาษี" with seller and buyer tax ID + branch. Thai tax IDs are checksum-validated.
- Print: real A4 in mm, JS pagination (header repeated, totals on last sheet, หน้า x/y), Thai amount in words (bahtText, 23 test cases), Code128 barcode, PromptPay QR with outstanding amount on invoices, PDF named after the doc number.
- In Next.js: render the same HTML/CSS server-side (or with a headless browser) for PDFs; keep numbering in the DB transaction (`DocSequence`).

## How the prototype is wired (map this to API routes)
Pages talk only through `localStorage` — each key becomes a table + API in Next.js:
| localStorage key | Becomes |
|---|---|
| `mdw_cart` | client cart state (Context/Zustand), validated server-side at order time |
| `mdw_orders` | `Order`, `OrderItem`, `PaymentSlip`, `OrderEvent` · `POST /api/orders`, `POST /api/orders/:id/slip` |
| `mdw_settings` | `ShopSetting` (single row `id="shop"`) |
| `mdw_slides` (+ `_draft`, `_prev`) | `HeroSlide` + `ContentVersion` (rollback) |
| `mdw_categories` (+ `_draft`, `_prev`) | `Category` (`group`, `popular`, `isActive`) + `ContentVersion` |
| `mdw_admin_log` | `AdminLog` |
| `mdw_customers`, `mdw_docs`, `mdw_doc_seq`, `mdw_products_doc` | `Customer`, `SalesDocument`(+Item/Payment/Event), `DocSequence`, `Product` (sales-documents module) |

Rules that must move to the server (the prototype only simulates them):
- Recompute every total from items; money as **satang integers**; never trust client totals.
- Compute slip SHA-256 on the server; flag (don't silently block) duplicates for admin review.
- Allocate document numbers inside a transaction on `DocSequence` (PREFIX+YYMM-NNNNN, monthly reset, never reused; void keeps the number).
- Whitelist hrefs (`#`, `/`, `http(s)://`, `tel:`, `mailto:`) and images (`https://`, uploaded keys) for admin-edited content; escape all text.
- Login throttling, idle session expiry and audit logging on the server.

## Repo status
- Step 1 done: Next.js 16 (App Router, `cacheComponents` on) + Prisma 7.10 scaffolded, `prisma/migrations/*_init`, idempotent `prisma/seed.ts` (`npm run db:seed`, reads `docs/shared-data.js`). New English category slugs; old Thai URLs kept in `legacySlug` (ไฟส่องตึก left null until the owner confirms).
- Step 2 done (port as-is): `src/app/(shop)/layout.tsx` injects the prototype header/footer markup (`_markup/shell.ts`) + `shop.css`; behaviour lives in `public/js/shell.js` (cart, mega menu, search, drawer, consent) and `public/js/home.js` (slider, category cards, finder). Server passes DB data as `<script id="mdw-data">` / `mdw-slides` JSON in the prototype's shapes (`src/lib/storefront.ts`, `"use cache"` + tag `storefront` — admin mutations must `updateTag("storefront")`). Shop links are plain `<a>` (full page loads) because those scripts only init on load; switch to `<Link>` when componentizing. New pages (no prototype): products, category with filters, product detail, search, track (server action, IP throttle in memory), privacy/warranty drafts, checkout placeholder (step 3).
- Step 3 done: `/checkout` (route group `(checkout)`, prototype CSS/HTML, `public/js/checkout.js`) → `POST /api/orders` (server recomputes totals in satang, order no. `MDW-YYMMDD-NNNN` Bangkok date, status `AWAITING_SLIP`; going back edits the same order if phone matches) → `POST /api/orders/:orderNo/slip` (phone must match, magic-byte image check, 5 MB, server SHA-256, duplicates flagged not blocked, storage driver `local` in `UPLOAD_DIR`). Phones stored as digits only (`formatPhone` for display). `/track` lets customers re-upload after REJECTED.
- Admin (`src/app/admin`, prototype CSS in `admin.css`): `src/proxy.ts` redirects when no cookie; `requireAdmin()` (src/lib/auth.ts) in every page/action/route — DB sessions (`AdminSession`, cookie holds random token, DB stores sha256), 30-min idle + 12 h max, `LoginThrottle` 5 fails/user or 20/IP → 15-min lock, `AdminLog` for auth events. Orders page is server-rendered with filters in the URL (`?tab=&q=&range=&page=&open=&mode=reject`); actions in `order-actions.ts` use `updateMany` guarded by expected status. LINE notifications not wired yet (step 6).
- Step 4 + 5 done: shop info from the owner (phone 080-884-9597, LINE @mongdoweb, KBANK 4982105000 / SCB 0852358798) in `ShopSetting` (bank accounts + shipping tiers by order value are JSON; `src/lib/settings.ts`); `npm run import:woo` imports 179 real products + images from `data/woocommerce/*.csv` (variations become separate products, non-LED categories hidden from the home menu); old Thai URLs 301 via `src/proxy.ts` → `/api/legacy-product` and `/product-category/[...path]`. Admin: products, categories (+rollback), slides (+upload, focal point, schedule, rollback), settings, activity log (`/admin/log`).
- Sales documents (spec `docs/SPEC_SALES_DOCS.md`): `/admin/docs/{QUOTATION|INVOICE|RECEIPT}` list/view/`[id]/edit` (`new/edit` creates), `/admin/customers`, actions in `docs/actions.ts`. Pure calc/render in `src/lib/doc-calc.ts` + `doc-render.ts` (shared by server and the live editor preview; client pagination in `_components/DocSheets.tsx`); DB logic in `src/lib/docs.ts` (`allocDocNo` = atomic `INSERT … ON CONFLICT DO UPDATE next+1` on `DocSequence`). Payment on an IV creates `DocPayment` + an issued RC in one transaction (full = copy lines, partial = one "งวดที่ n" line, inclusive VAT); voiding an RC sets `DocPayment.voided` and lowers the IV's paid amount. Print pages `/admin/print/doc/:id` (`?both=1&auto=1`) and `/admin/print/labels` (`?orders=…|status=PAID|doc=…&size=A6|A4&boxes&cod&marks&items`). Web order drawer: issue RC / draft IV + labels. `npm run test:unit` = bahtText 23 cases + VAT/taxId/PromptPay.
- Step 6 (part) LINE: shop-only notifications via Messaging API (`src/lib/line.ts`, env `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET`, never in DB). Slip upload → `after()` pushes a text to every enabled `LineRecipient` (order no., amount vs slip, duplicate/diff warnings, queue size, admin link). Webhook `/api/line/webhook` (HMAC signature check) registers a group when the OA joins it, or a user who types "ลงทะเบียนแจ้งเตือน" — always disabled until an OWNER enables it at `/admin/line` (status, quota, test message, setup guide). `LINE_API_BASE` exists only for tests against a mock server. Customer-facing LINE messages: not built (owner chose shop-only).
- Deploy-ready (Railway, guide `docs/DEPLOY.md`): `railway.json` (build `scripts/railway-build.sh` = migrate deploy with `DATABASE_PUBLIC_URL` → `scripts/seed-if-empty.ts` → `scripts/import-if-empty.ts` (Woo import on first build, S3 only) → next build; start `npm start`; health check `/api/health`). Storage: `STORAGE_DRIVER=local` on a volume (`UPLOAD_DIR=/data/uploads`) or `s3` (`S3_*` env, S3/R2/Railway Bucket, implemented in `src/lib/storage.ts`). `prisma`, `tsx`, `csv-parse`, `typescript`, `@types/*` are in `dependencies` so builds with `NODE_ENV=production` (dev deps skipped) still work. Run 1 replica (in-memory rate limits).
- Live on Railway (project "Mongdoweb.com", env production, Singapore): service `mongdoweb-next` (branch `claude/trusting-mendel-riuxyn`, https://mongdoweb-next-production.up.railway.app), `Postgres` (TCP proxy on, build uses `DATABASE_PUBLIC_URL` built from PG* + RAILWAY_TCP_PROXY_* refs), bucket `mdw-files` (`STORAGE_DRIVER=s3`). The older services `mongdoweb.com` + `MySQL` in that project belong to another repo — leave them alone. Custom domain `www.mongdooweb.com` added (SITE_URL set); DNS is at Ruk-Com (ns th123/vth123.ruk-com.in.th, www currently A 210.246.200.123 = old site) — owner must set CNAME `www` → `anb00dqy.up.railway.app` + TXT `_railway-verify.www` from the Railway domain settings.
- Owner still to confirm: PromptPay ID (empty → no QR), bank account holder names (empty), shipping tier thresholds (placeholder: <1,000 ฿60 · <3,000 ฿100 · <5,000 ฿150 · <10,000 ฿250 · <20,000 ฿360 · ≥20,000 free), seller tax ID, a strong admin password.
- Next.js 16 differs from older versions — read `node_modules/next/dist/docs/` before using an API (see `AGENTS.md`).
- Checks: `npm run typecheck && npm run lint && npm run test:unit && npm run build`.

## Suggested build order
1. Scaffold Next.js + Prisma 7, migrate the schema, seed from `docs/shared-data.js` and the prototype catalogs.
2. Storefront pages (port HTML/CSS as-is first, then componentize) + product detail, category with filters, order tracking, privacy/warranty pages.
3. Orders API + slip upload (storage driver) + admin order review.
4. Admin: slides/categories managers with real image upload, settings, activity log, sales documents.
5. WooCommerce import + 301 redirects from the old Thai URLs (`legacySlug`).
6. LINE Messaging API notifications, deploy, real-money testing, soft launch.

## Still placeholders (owner must supply)
PromptPay ID, bank account holder names, shipping tier thresholds (owner gave only the fees 60/100/150/250/360),
seller tax ID, privacy policy / warranty text (drafts), go-ahead to deploy on Railway (recommended; account mongdoweb-code already has a "Mongdoweb.com" project) + DNS switch, enabling Messaging API on LINE OA @mongdoweb (token + secret into `.env`).

## Running the prototype tests
```bash
pip install playwright pillow zxing-cpp && python -m playwright install chromium
cd tests && python home_test_all.py && python home_test_qa.py \
  && python admin_test_all.py && python admin_test_round2.py && python admin_test_e2e_flow.py \
  && python admin_test_docs.py
```
`admin_test_docs.py` decodes the printed barcodes/QR with zxing-cpp and uses `tests/vendor/qrcode.min.js` (MIT) so it works offline.
Screenshots land in `tests/out/`. External images/fonts (Unsplash, Google Fonts, cdnjs QR library) may be blocked in sandboxes — that's expected; the pages have fallbacks.
