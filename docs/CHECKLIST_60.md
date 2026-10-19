# Round 1 — 60 required items (what was ordered)

## Owner's original request (Thai, verbatim intent)
1. Homepage: add 5 slides to attract customers, using images from the internet with professional sales copy; slides (text AND images) must be editable from the admin back office.
2. Homepage: make product categories more dimensional; hovering the mouse shows a dropdown list.
3. Cart icon: make it clear, sharp and easy to understand.
4. Work in two lots of 30 items each (customer side, admin side), detailed, professional, nothing missed.
5. AI recheck for anything missed, then add whatever is needed so it is complete and really usable.

## Lot U — customer side (mongdoweb-home.html, mongdoweb-checkout.html)
U1 Hero slider from `mdw_slides` (fallback DEFAULT_SLIDES), active + startAt/endAt + order; empty → DEFAULT_SLIDES[0]
U2 Slide rendering: img cover + focal object-position, overlay strength, eyebrow/title (h1 only first)/subtitle/cta1/cta2, align left/center, legible text
U3 Strong Thai typographic hierarchy, max text width ~620px
U4 Autoplay 6s, pause on hover / focus within / hidden tab, visible pause/play
U5 Prev/next arrows + pagination with autoplay progress bar
U6 Touch swipe (threshold, doesn't hijack vertical scroll) + ←/→ keys
U7 Ken Burns + staggered text + crossfade; off under reduced motion
U8 Perf: first image eager + fetchpriority high, others lazy, Unsplash srcset/sizes, preconnect, no CLS
U9 Carousel ARIA (region/roledescription, slide "x จาก n", inert on hidden, polite live region only when paused)
U10 Live update on `storage` event; photo credit
U11 Header mega-dropdown "หมวดสินค้า" grouped by CATEGORY_GROUPS with icons, links to BASE+slug
U12 Hover intent (120/250ms) + safe bridge; full keyboard support; touch tap toggles
U13 Mega panel promo column (finder link + best seller)
U14 Category cards dimensional: layered depth, lift, pointer 3D tilt (≤6°), glow; off on touch/reduced motion
U15 Hover/focus on a category card reveals dropdown of `popular` items; touch: first tap reveals
U16 Mobile drawer categories as grouped accordion
U17 Categories from `mdw_categories` (visible/order), live update; counts use real visible count
U18 New crisp cart icon (basket, handle, two wheels), 26px, stroke 2, label "ตะกร้า" on desktop, ≥44px hit area
U19 Badge hidden at 0, "99+", bump, aria-label with count
U20 Desktop hover mini-cart preview; mobile floating cart after scroll (not overlapping LINE)
U21 Header instant search suggestions (keyboard, empty state, max 6, price)
U22 Rotating dismissible announcement bar (remembered)
U23 "✓ เพิ่มแล้ว" confirmation state on add-to-cart
U24 Back-to-top button (no collision with LINE)
U25 SEO: OG/Twitter, canonical, theme-color, JSON-LD Organization/WebSite+SearchAction/ItemList
U26 Skip link, :focus-visible, heading order, aria-labels on icon buttons
U27 PDPA consent banner, remembered, not covering drawer/checkout buttons
U28 Footer: social/LINE, payment chips, LINE CTA, TODO placeholders
U29 Checkout: new cart icon, "กลับไปช้อปต่อ", full checkout still works and saves order
U30 Robustness: no console errors, corrupted/throwing storage fallback, untrusted text escaped, href/image whitelist

## Lot A — admin side (mongdoweb-admin.html)
A1 Sidebar page "สไลด์หน้าแรก"
A2 Slide list: thumbnail (focal), title, eyebrow, active toggle, schedule badge, order
A3 Reorder: drag (mouse + touch) + accessible up/down
A4 Edit all Slide fields incl. cta2 toggle, align, overlay range, alt, credit, start/end (end > start)
A5 Image upload (type, ≤8MB, canvas resize ≤1920, WebP/JPEG, ~≤350KB, data URL) or https URL; warnings for small/portrait
A6 Focal point picker with desktop 16:7 and mobile 4:5 crop previews
A7 Live preview matching homepage hero, desktop/mobile toggle
A8 Validation + counters (40/60/140) + href whitelist + image required, Thai messages
A9 Add (max 8) / duplicate / delete (confirm); protect last active slide
A10 Draft vs publish bar; publish writes `mdw_slides`; "ดูหน้าแรก"
A11 Unsaved-changes guard (page switch + beforeunload) for slides, categories, settings
A12 Reset slides to defaults
A13 Storage budget meter + quota handling
A14 Keyboard & a11y: labels, focus management, Esc
A15 Page "หมวดหมู่สินค้า" table
A16 Edit category: th/en, group, icon picker, slug, popular tags (max 4, ≤20 chars), visible
A17 Reorder + draft/publish writes `mdw_categories` + reset
A18 Preview of homepage dropdown + grouped mega menu
A19 Pagination (20/page, selector) + date-range filter combined with tabs/search
A20 Bulk select + export CSV / print slips for selected; no bulk approve (tooltip)
A21 Printable packing slip / shipping label (print CSS)
A22 Internal admin note per order (timestamp, admin, events)
A23 Copy address, copy order no., click-to-call
A24 New-order alert on storage event: toast + beep (toggle) + title counter
A25 7-day sales SVG bar chart (PAID+SHIPPED), tooltip, accessible summary
A26 Idle timeout 30 min + 60 s countdown dialog + auto logout
A27 Login throttling: 5 attempts → 60 s lock, persisted, remaining attempts shown
A28 Activity log page (orders + content + settings + login), `mdw_admin_log` capped 500
A29 Settings: sound toggle + sender block (`sender`, `soundOn`) without breaking checkout fields
A30 Robustness: no console errors, corrupted storage, mobile layouts, empty states
