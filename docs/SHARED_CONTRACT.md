# MongdoWeb — Shared contract for Round 1 (60 items)

All three pages are standalone HTML files in `/home/claude/` and talk to each other ONLY through
`localStorage` (prototype stand-in for the future Next.js API). Both lots MUST use exactly these
keys and shapes, and MUST embed the default data below verbatim (copy `shared-data.js` content
into each page's <script>; do not load it as an external file — pages must stay single-file).

## Existing keys (do not change shape)
- `mdw_cart`      : `{ [productId]: qty }`
- `mdw_orders`    : Order[] (see mongdoweb-checkout.html / mongdoweb-admin.html)
- `mdw_settings`  : shop settings written by admin, read by checkout
- `mdw_ship`      : last shipping address (checkout)
- `mdw_seeded`    : '1' after admin demo seed

## NEW key: `mdw_slides`  (written by ADMIN, read by HOME)
```ts
type Slide = {
  id: string;                 // 's1'... or 's_' + Date.now()
  active: boolean;
  order: number;              // ascending
  image: string;              // https URL (Unsplash) OR data:image/... (uploaded, compressed by admin)
  focal: { x: number; y: number }; // 0–100 (%), used as CSS object-position for cropping
  alt: string;                // image alt text (Thai)
  eyebrow: string;            // small label above title, <= 40 chars
  title: string;              // headline, <= 60 chars recommended (required)
  subtitle: string;           // <= 140 chars recommended
  cta1: { label: string; href: string };          // required
  cta2: { label: string; href: string } | null;   // optional secondary button
  align: 'left' | 'center';
  overlay: number;            // 0–90, darkness % of the gradient overlay
  startAt: string | null;     // ISO date-time; slide shown only if now >= startAt
  endAt: string | null;       // ISO date-time; slide shown only if now <= endAt
  credit: string;             // photo credit, e.g. "Photo: Marissa Rodriguez / Unsplash" ('' for own photos)
};
```
HOME rule: `slides = (mdw_slides ?? DEFAULT_SLIDES).filter(active && within schedule).sort(order)`.
If the result is empty → show DEFAULT_SLIDES[0] only (never an empty hero).
HOME listens to the `storage` event for `mdw_slides` / `mdw_categories` and re-renders live.

Unsplash image URLs: append sizing params when rendering, e.g.
`base + '?auto=format&fit=crop&w=1920&q=75'` and a srcset with w=828, 1280, 1920.
Only add params when the URL starts with `https://images.unsplash.com/`.

## NEW key: `mdw_categories`  (written by ADMIN, read by HOME)
```ts
type Category = {
  id: string;           // stable key, e.g. 'underwater'
  th: string; en: string;
  icon: string;         // key into ICONS map that home.html already has (water, pool, fountain, uplight, garden, down, strip, stage, wash, spot, wall, deco)
  group: 'water' | 'outdoor' | 'building' | 'deco';
  slug: string;         // URL-encoded path segment after BASE (same as current home.html CATEGORIES.slug)
  popular: string[];    // up to 4 short labels shown in the hover dropdown, e.g. 'แสงขาว'
  visible: boolean;
  order: number;
};
```
Group labels (Thai): water = "งานน้ำ", outdoor = "สวนและภายนอก", building = "อาคารและภายใน", deco = "อุปกรณ์และตกแต่ง".
HOME rule: `cats = (mdw_categories ?? DEFAULT_CATEGORIES).filter(visible).sort(order)`.

## Design tokens (must match existing pages)
--c-white #FFFFFF, --c-cream #F2F0EB, --c-orange #F26B38, --c-orange-dk #D9562A, --c-black #141414,
--c-ink #1C1C1C, --c-muted #6B6862, --c-line #E3E0D8, --c-cream-dk #E8E5DD. Font: Noto Sans Thai.
Square corners (no rounded buttons) except pills/badges. All UI text in Thai.

## Sandbox note
This sandbox CANNOT reach images.unsplash.com, fonts.googleapis.com or cdnjs. In tests, images
will fail to load — that is expected. Code must degrade gracefully (fallback background colour per
slide, no broken-image icon, no layout shift). Do not treat failed external loads as bugs, but DO
verify the fallback path looks acceptable.
