# Osprey — Frontend Update Plan

**Author:** Frontend Engineering (DeFi)
**Date:** 2026-07-07
**Scope:** `apps/web` — React 18 + Vite + React Router 6 + Zustand + TanStack Query. Dark-only, canvas charts.
**Status:** Planning → build. This is the execution spec for the visual + IA overhaul. It supersedes the *polish* sections of `FRONTEND_UX_AUDIT.md`; the P0 state/lifecycle fixes in that audit are assumed done or tracked separately.

---

## 0. TL;DR — what we are actually changing

Four problems, in priority order:

1. **Fonts flash the generic system font and only "fix" after a cache-clear + reload.** Root cause identified (CDN + `display=swap`). We self-host. §1.
2. **The palette is teal-on-everything.** We are moving to a **charcoal-and-white monochrome foundation** with teal demoted to a single, disciplined accent, plus a proper gradient language. §2.
3. **There is no landing page.** The app dumps a cold visitor straight into a dense funding table with no context, no value prop, no "connect." We build one. §4 + §5.1.
4. **Objects (buttons, cards, inputs, badges) are close but imprecise** — inconsistent radii, weak hierarchy, ad-hoc inline styles. We tighten them into a real object system and stop styling inline. §3.

Everything else is page-by-page application of the above (§5) plus motion (§6) and cross-cutting states (§7).

**Design north star:** *Hyperliquid-grade restraint.* Near-black canvas, near-white data, one accent, gradients you feel but don't notice, numbers that look machined. Nothing decorative that a trader wouldn't thank us for.

---

## 1. Fonts — kill the FOUT (your "clear cache and reload" bug)

### 1.1 Why it happens

[`index.html:9-12`](../apps/web/index.html#L9-L12) loads all three families from the Google Fonts CDN:

```html
<link href="https://fonts.googleapis.com/css2?family=Syne:...&family=Inter:...&family=JetBrains+Mono:...&display=swap" rel="stylesheet">
```

Two compounding failures:

- **`display=swap`** tells the browser: *paint the fallback immediately, swap when the webfont arrives.* On a cold/slow load (or when the CDN request is queued behind the JS bundle) you literally watch Arial/system-ui render first, then jump to Syne/Inter. That is the "generic HTML stuff."
- **Third-party origin + render-blocking stylesheet.** The `css2` request must resolve, *then* the actual `.woff2` files fetch from `fonts.gstatic.com`. Two round-trips to a domain we don't control, before correct text can paint. After the first successful load they're in the browser's HTTP cache — which is why it "works after a reload" and breaks again when the cache is cleared or a CDN edge is cold.

### 1.2 The fix — self-host, preload, and stabilize the fallback

**Step 1 — Vendor the fonts locally.** Download the `.woff2` subsets we use and drop them in `apps/web/public/fonts/`:

```
public/fonts/
  Syne-SemiBold.woff2        (600)
  Syne-Bold.woff2            (700)
  Syne-ExtraBold.woff2       (800)
  Inter-Regular.woff2        (400)
  Inter-Medium.woff2         (500)
  Inter-SemiBold.woff2       (600)
  JetBrainsMono-Regular.woff2 (400)
  JetBrainsMono-Medium.woff2  (500)
  JetBrainsMono-SemiBold.woff2 (600)
```

Prefer variable fonts if the weight range is contiguous (Inter and JetBrains Mono ship variable `.woff2`) — one file per family, smaller total.

**Step 2 — Declare them with `@font-face` in a new `apps/web/src/styles/fonts.css`**, imported first in `global.css` (before `tokens.css`). Use `font-display: swap` **only after** we've fixed metrics (below), or `optional` for body text if we want zero layout shift and accept the fallback on the very first paint:

```css
@font-face {
  font-family: 'Inter';
  src: url('/fonts/Inter-Regular.woff2') format('woff2');
  font-weight: 400; font-style: normal;
  font-display: swap;
}
/* …one block per weight/family… */
```

**Step 3 — Preload the two fonts that paint above the fold** (Inter body + Syne display) in `index.html` `<head>`, and delete the Google `<link>`s + preconnects:

```html
<link rel="preload" href="/fonts/Inter-Regular.woff2"  as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/Syne-Bold.woff2"      as="font" type="font/woff2" crossorigin>
```

**Step 4 — Metric-matched fallbacks to eliminate the visible swap/reflow.** Define fallback faces with `size-adjust`/`ascent-override` so the system font that paints for the first ~50ms is the *same size* as the real font — the swap becomes imperceptible instead of a visible jump:

```css
@font-face {
  font-family: 'Inter Fallback';
  src: local('Segoe UI'), local('Roboto'), local('Helvetica Neue');
  size-adjust: 107%;         /* tune so 'x-height' matches Inter */
  ascent-override: 90%;
  descent-override: 22%;
  line-gap-override: 0%;
}
```

Then in `tokens.css`:

```css
--font-body:    'Inter', 'Inter Fallback', system-ui, sans-serif;
--font-display: 'Syne', 'Inter Fallback', system-ui, sans-serif;
--font-mono:    'JetBrains Mono', ui-monospace, 'SF Mono', monospace;
```

**Result:** first paint uses a fallback that's *dimensionally identical*, the real font arrives from our own origin (usually before first contentful paint because it's preloaded), and there is no cache-dependent flash. No reload required, ever.

> Acceptance test: hard-reload with an empty cache and DevTools throttled to Slow 3G. There must be **no visible font swap and no text reflow**. That's the bar.

---

## 2. Color & surface system — charcoal, white, gradients

This is the "why not just black and white" direction. We keep teal as Osprey/Hyperliquid heritage, but it stops being wallpaper and becomes a **scalpel**: CTAs, the active/live signal, and focus. Everything else is built from a **charcoal ramp** and an **ink/white ramp**, connected by gradients.

### 2.1 New token ramps (replaces the flat vars in `tokens.css`)

**Charcoal ramp — canvas → elevated surfaces (near-black, cool-neutral):**

```css
--c-950: #07080B;   /* page background — the true black */
--c-900: #0B0D12;   /* app shell / behind cards */
--c-850: #101319;   /* card surface */
--c-800: #161A22;   /* elevated card / hover */
--c-750: #1D222C;   /* overlay / modal */
--c-700: #262C38;   /* hairline borders, dividers */
--c-600: #333A48;   /* strong border / disabled fills */
```

**Ink/white ramp — text and lines (very-white → muted):**

```css
--w-000: #FFFFFF;   /* hero numbers, key values — the "very very white" */
--w-050: #F3F5F9;   /* primary text */
--w-100: #D7DBE6;   /* secondary text */
--w-200: #A2A8B8;   /* tertiary / captions */
--w-300: #6B7180;   /* muted / placeholder */
--w-400: #464C5A;   /* disabled */
```

**Single accent (teal) + semantics only:**

```css
--accent:        #43E8D8;   /* the one accent — CTA, active, live */
--accent-strong: #5FF0E0;   /* hover */
--accent-dim:    rgba(67,232,216,0.12);
--pos:           #2FD79B;   /* P&L up — slightly desaturated vs old #00d4a0 */
--neg:           #FF5A72;   /* P&L down */
--warn:          #F5C542;   /* funding heat / caution */
```

Keep the funding-heat ramp (`cold/warm/hot/fire`) — that's data, not decoration, it earns its color.

### 2.2 Gradient language (this is the part that makes it feel premium, not flat)

Three named gradients, used consistently:

```css
/* 1. Top-lit surface — the "it's a physical panel" cue. On every card. */
--grad-surface: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 40%), var(--c-850);

/* 2. Ambient charcoal glow — hero / page backdrops. Barely-there depth. */
--grad-ambient: radial-gradient(1200px 600px at 50% -10%, rgba(67,232,216,0.06), transparent 60%), var(--c-950);

/* 3. Accent — primary CTA only. Directional teal. */
--grad-accent: linear-gradient(135deg, #43E8D8 0%, #2FC9BE 100%);

/* 4. Hairline gradient border — for the one or two "hero" cards */
--grad-border: linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.03));
```

**Rules of use:**
- `--grad-surface` on cards; the highlight must be ≤4% white or it looks cheap.
- `--grad-ambient` only on full-page backdrops (landing hero, empty states, PairDetail header). One per viewport, max.
- Gradient *text* is banned except the landing wordmark. Numbers are solid `--w-000`.
- No color→color gradients except the teal CTA. We are monochrome with one accent — honor it.

### 2.3 Elevation via light, not shadow

Dark UIs read depth from **border-lightness and top-highlight**, not big drop shadows. Replace the heavy `--shadow-card: 0 2px 16px rgba(0,0,0,0.6)` with:

```css
--shadow-card:  0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.7);
--shadow-pop:   0 1px 0 rgba(255,255,255,0.04) inset, 0 24px 60px -20px rgba(0,0,0,0.85);
--ring-focus:   0 0 0 2px var(--c-900), 0 0 0 4px var(--accent);
```

---

## 3. Object system — buttons, cards, inputs, badges

Today objects are `.btn`/`.glass-card`/`.stat-card` classes *plus* a lot of inline `style={{…}}` (Scanner alone has ~30 inline style blocks). The rule going forward: **objects come from `components/ui`, not inline styles.** ([[osprey-web-ui-primitives]] already exists — extend it, don't fork it.)

### 3.1 Buttons — precise spec

| Variant | Fill | Text | Border | Hover | Use |
|---|---|---|---|---|---|
| `primary` | `--grad-accent` | `#07080B` | none | `--accent-strong` + lift 1px | The single most important action on a screen |
| `secondary` | `--c-800` | `--w-050` | `1px --c-700` | bg `--c-750`, border `--c-600` | Common actions |
| `ghost` | transparent | `--w-100` | `1px --c-700` | bg `rgba(255,255,255,0.04)` | Tertiary |
| `danger` | `rgba(255,90,114,0.10)` | `--neg` | `1px rgba(255,90,114,0.25)` | bg `rgba(255,90,114,0.18)` | Close position, disconnect |

Precision details that make buttons feel machined, not web-generic:
- **Radius:** unify on `--r-md: 10px`. No mixed radii on sibling controls.
- **Height:** `sm: 30px`, `md: 36px`, `lg: 44px` (landing CTA). Fixed heights, vertical-centered.
- **Font:** `--font-body`, 13px, weight 600, letter-spacing `0.01em`. Never display font in buttons.
- **Transition:** `transform 120ms, background 120ms, box-shadow 120ms`. Primary hover: `translateY(-1px)`; active: `translateY(0)` — a real press.
- **Icon buttons:** square, same height as text buttons, icon at 16px, centered.
- **Loading state:** built-in spinner + disabled, width locked (no reflow). Add to `Button.tsx`.
- **Focus:** `--ring-focus` (keyboard only, via `:focus-visible`).

Extend [`Button.tsx`](../apps/web/src/components/ui/Button.tsx) to add `secondary` + `lg` + `loading` + `iconOnly`. Migrate the raw `.btn` call-sites (Scanner retry, filter chips, modals) to `<Button>`.

### 3.2 Cards

One `Card` primitive, three elevations: `flat` (just border), `raised` (`--grad-surface` + `--shadow-card`), `pop` (modals/menus, `--shadow-pop`). Radius `--r-lg: 14px`. Border `1px solid --c-700`; the one or two hero cards get the `--grad-border` treatment via a `::before` mask. Hover only on interactive cards (`raised` → border lightens to `--c-600`).

### 3.3 Inputs & selects

- Height matches buttons (`36px`). Fill `--c-850`, border `--c-700`, focus border `--accent` + `--accent-dim` ring.
- Placeholder `--w-300`. Value text `--w-050`, mono where numeric.
- Custom `select` chevron (current native arrow breaks the aesthetic).
- Segmented control component for the Scanner category tabs and Analytics timeframe — right now those are hand-rolled chip rows.

### 3.4 Numbers — the DeFi tell

Numbers are the product. Make them look engineered:
- All numeric values: `--font-mono`, `font-variant-numeric: tabular-nums`, `letter-spacing: -0.01em`. Tabular nums stop the column jitter when values tick.
- Sign convention: `+`/`−` prefix, `--pos`/`--neg`, consistent decimal count per column.
- Large stat values in `--w-000` (pure white) at 22–28px; labels in `--w-300` uppercase 10px `0.1em`.
- Live-updating values get a 1-frame flash (green/red tint fade) on change — see §6.

---

## 4. Information architecture — landing, and getting Developers off the dashboard

### 4.1 The split

Right now `/` **is** the dashboard. A cold visitor with no wallet lands in a 11-column funding table. We split the product into two zones:

- **Marketing zone** (public, no wallet): `/` = **Landing**. Also `/docs` (Developers moves here).
- **App zone** (the dashboard): moves under `/app`. `/app` = Scanner, `/app/pair/:symbol`, `/app/portfolio`, `/app/analytics`, `/app/harvest`, `/app/settings`.

Routing change in [`App.tsx`](../apps/web/src/App.tsx#L42-L51): add a public `Landing` route at `/`, nest the current `AppShell` tree under `/app`. "Launch App" / "Connect Wallet" on the landing routes to `/app`.

### 4.2 Developers leaves the trading nav

You're right — a docs/integrations page does not belong in the primary trading nav. Remove it from [`nav.ts`](../apps/web/src/components/layout/nav.ts#L19-L26). It becomes:
- A top-level **`/docs`** page linked from the landing footer + top nav.
- A small "API / Webhooks" link in Settings for the in-app case.

New dashboard nav (`nav.ts`) — the flow is *discover → act → monitor → analyze → configure*:

```
Scanner · Harvest · Portfolio · Analytics · Settings
```

Five items. Cleaner mobile bottom bar, no odd-one-out.

---

## 5. Page-by-page plan

### 5.1 Landing (NEW) — `/`

The most important new surface. A trader must understand *what Osprey is* and *why it's safe money* within one viewport. Sections, top to bottom:

1. **Top nav (transparent → solid on scroll):** wordmark left; `Docs`, `Scanner`, and a `Launch App` primary button right. Sticky, `backdrop-filter: blur(12px)` over `--c-950` at scroll.
2. **Hero.** `--grad-ambient` backdrop. Headline in Syne, ≤7 words ("Harvest funding. Stay delta-neutral."). Sub in Inter `--w-200`. Two CTAs: `Launch App` (primary), `View live rates` (ghost → `/app`). One "very white" hero stat strip pulled from live data — e.g. *top annualized funding right now*, *pairs tracked*, *avg net APY* — proves it's live, not a mockup.
3. **The one-glance product shot.** A real, slightly-angled `Card` showing a cropped Scanner row or a PairDetail funding chart. Use the actual component, dimmed/masked, not a screenshot.
4. **How it works — 3 steps.** Scan → Arm engine → Harvest. Icon + one line each. Monochrome cards, teal number badges.
5. **Why it's credible.** Delta-neutral explainer (long spot / short perp), fee-aware Net APY, non-custodial ("your keys, your Hyperliquid account"). This is the trust section — DeFi users bounce without it.
6. **Live rates teaser.** A read-only 5-row slice of the Scanner with a "See all N pairs →" link. Reuses scanner data; sells the product with the product.
7. **Footer.** Docs, API, GitHub, disclaimers, "not financial advice," Hyperliquid attribution.

Design: monochrome, generous whitespace (landing can breathe far more than the dense app), one teal accent per section max, `--grad-ambient` only in the hero. Fully responsive; hero stat strip wraps to 2×2 on mobile.

### 5.2 Scanner — `/app`

Keep the density (traders want it) but upgrade precision:
- Convert the ~30 inline-styled blocks to `ui` primitives; table cells use a shared `<Cell>`/`<NumCell>` with tabular-nums.
- Category tabs → `Segmented` control (§3.3).
- Sticky table header on scroll; zebra-free, hairline `--c-700` row dividers; hover row `--c-850`.
- Rate badges stay (funding-heat is earned color) but align to the new ramp.
- **Empty/loading:** skeleton rows (§7), not a centered "Loading rates…" string.
- Column header sort affordance: the current 0.3-opacity chevron is noise — show sort chevron only on hover or when active.
- Add a lightweight top filter bar: search by symbol, min-OI / min-APY quick filters. Right-aligned "last updated · live" pill with the teal live dot.

### 5.3 PairDetail — `/app/pair/:symbol`

- Header uses `--grad-ambient`; symbol in Syne `--w-000`, category chip, live price mono, 24h change signed.
- Stat row → `Stat` primitives, pure-white values.
- Funding history + candles: unify chart styling on the new palette (teal line, `--c-700` grid, `--w-300` axis labels, no heavy fills — a faint teal area gradient to zero is fine). Ensure charts read in both a wide and a narrow container.
- Primary action rail: `Arm Engine` (primary), `Add to watchlist` (ghost). Uses the real `ArmEngineModal`.
- Cache via Query so back-nav is instant (audit P0-3) — no "Loading…" flash on revisit.

### 5.4 Portfolio — `/app/portfolio`

- Top: equity summary hero card (`--grad-border` treatment) — total value, net P&L signed, live-flash on update, sparkline of the equity curve.
- Positions table: per-row P&L, funding collected, delta status (a small "neutral / drifting" indicator — this is the product's whole thesis, surface it). Close-position → `danger` button + confirm.
- Empty state (no positions): a real empty state with an illustration-lite card and a "Scan for opportunities →" CTA to `/app`, not a blank table.

### 5.5 Analytics — `/app/analytics`

- Timeframe selector → `Segmented`.
- Charts on the unified palette; one accent series, everything else `--w-200`/`--c-700`.
- KPI tiles use `Stat` (pure-white numbers, tabular). Keep it scannable — this is the "am I making money" page.

### 5.6 Harvest — `/app/harvest`

- The engine/automation view. State must be unmistakable: a prominent **status card** — `Idle` (muted), `Armed` (teal, live dot, `--grad-border`), `Error` (neg). The live pulse animation (§6) belongs here and nowhere loud.
- Harvest log as a clean, mono, timestamped feed; newest on top; row-enter animation.
- Controls (`Arm` / `Disarm`) as primary/danger with confirm + loading states.

### 5.7 Settings — `/app/settings`

- Grouped `Card` sections: Wallet (connect/disconnect, address, network), Fees (the maker/taker inputs that feed Net APY — label them clearly, they change every number in the app), Notifications, **API & Webhooks** (the in-app slice of Developers), Danger zone.
- Wallet connect is the highest-value action here — give it a proper `primary` treatment and a connected/disconnected visual state, not a text link.

### 5.8 Developers → Docs — `/docs`

Move [`Developers.tsx`](../apps/web/src/pages/Developers.tsx) out of the app shell into a public docs page reachable from the landing. Reformat as documentation (endpoints, webhook payloads, examples) on the same design system. In-app, expose only the "API keys / webhook URL" bits under Settings.

---

## 6. Motion & micro-interactions

Restrained, functional, 120–220ms. Motion communicates state, never decorates.

- **Page transitions:** keep the existing `fade-in`, tighten to 200ms, `translateY(6px→0)`. Respect `prefers-reduced-motion` (already handled in `global.css` — keep it).
- **Value tick flash:** when a live number changes, flash `--pos`/`--neg` background tint at 12% opacity, fade to transparent over 500ms. The single most "alive" touch for a funding app.
- **Live dot:** 6px teal dot with a soft pulsing halo (`box-shadow` keyframe), only on genuinely-live indicators (Scanner "live", Harvest "armed"). One or two per screen.
- **Button press:** `translateY(-1px)` hover → `0` active. Physical.
- **Row/log enter:** new harvest-log / position rows slide+fade in (respecting reduced-motion).
- **Skeletons shimmer** (§7), not spinners, for content loads.
- **Ban:** bouncy easings, spinners-as-primary-loading, anything that moves on idle except the two live dots.

---

## 7. Cross-cutting states (the credibility layer)

Every data surface needs all four states designed, not just the happy path:

- **Loading:** skeleton components matching the real layout (rows, cards, chart placeholder with shimmer). Add `<Skeleton>` to `ui`.
- **Empty:** purposeful — one line of what's missing + one CTA to fix it. Never a bare "No data."
- **Error:** the Scanner error banner pattern ([Scanner.tsx:131-151](../apps/web/src/pages/Scanner.tsx#L131-L151)) is good — promote it to a shared `<ErrorBanner>` and reuse on every fetch surface.
- **Offline/stale:** when showing last-known data after a failed refresh, say so (the Scanner already does — standardize the "showing last successful data" pill).

**Responsive:** keep the existing grid helpers and mobile bottom bar; audit every new surface (landing hero, portfolio hero) down to 360px. Tables scroll inside `.table-wrap` — never let the page scroll sideways.

**Accessibility:** keep `:focus-visible` rings (upgrade to `--ring-focus`), keep reduced-motion. Ensure teal-on-charcoal and white-on-charcoal hit WCAG AA for text (the new `--w-050`/`--w-100` on `--c-850` pass; verify `--w-200` for captions). Every icon-only button gets `aria-label`.

---

## 8. Build order

Ship in phases so nothing is half-migrated in `main`:

**Phase 1 — Foundation (invisible but unblocks everything).**
1. Self-host fonts + preload + metric fallbacks (§1). *Ship alone, verify the FOUT is gone.*
2. Rewrite `tokens.css` to the new ramps + gradients + shadows (§2). Keep old var *names* aliased to new values so nothing breaks mid-migration.

**Phase 2 — Object system (§3).**
3. Extend `Button`, `Card`, `Input`, add `Segmented`, `Skeleton`, `ErrorBanner`, `Stat` refinements to `ui`.
4. Migrate app pages off inline styles onto the primitives, page by page.

**Phase 3 — IA (§4).**
5. Route split (`/` landing, `/app/*` dashboard), remove Developers from nav, add `/docs`.

**Phase 4 — Landing (§5.1).**
6. Build the landing page against live data.

**Phase 5 — Page polish (§5.2–5.8) + motion (§6) + states (§7).**
7. Sweep each dashboard page.

**Definition of done for the whole update:**
- Empty-cache Slow-3G hard reload → no font flash, no reflow.
- No page uses more than one `--grad-ambient`; no color→color gradient except the CTA.
- Zero raw `.btn`/inline-styled controls left in the migrated pages — everything from `ui`.
- Cold visitor at `/` sees the landing, understands the product, and can reach `/app` in one click.
- Every fetch surface has loading/empty/error/stale states.
- Lighthouse a11y ≥ 95; CLS ≈ 0.

---

### Appendix — quick reference: old token → new token

| Old (`tokens.css`) | New | Note |
|---|---|---|
| `--bg-page #0a0b0f` | `--c-950 #07080B` | true black canvas |
| `--bg-surface #0f1117` | `--c-850 #101319` | card surface |
| `--bg-elevated #161820` | `--c-800 #161A22` | hover/elevated |
| `--glass-border rgba(255,255,255,.07)` | `--c-700 #262C38` | solid hairline |
| `--hl-teal #43e8d8` | `--accent #43E8D8` | now used sparingly |
| `--text-primary #e8eaf0` | `--w-050 #F3F5F9` | primary text |
| `--text-secondary #7a7f96` | `--w-200 #A2A8B8` | secondary |
| `--text-muted #44475a` | `--w-300 #6B7180` | muted |
| — | `--w-000 #FFFFFF` | **new** — hero numbers |
| `--accent-green #00d4a0` | `--pos #2FD79B` | slightly desaturated |
| `--accent-red #ff4f6e` | `--neg #FF5A72` | — |
