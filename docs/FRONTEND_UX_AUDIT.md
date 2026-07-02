# Osprey — Frontend & Product Design Audit

**Author:** Lead Product Designer
**Date:** 2026-07-02
**Scope:** `apps/web` — React 18 + Vite + React Router 6 + Zustand + TanStack Query (installed, unused) + canvas charts, dark-only theme.
**Verdict:** The product is *functionally dense and visually competent*, but it is carrying a set of foundational frontend defects that make it feel like a prototype, not a top-tier DeFi app. The single most damaging class of issues is **navigation & state lifecycle** — this is what you're feeling when "I have to manually reload." That's not in your head; it's real and it has concrete causes listed in P0 below.

This document is organized by priority so you can triage:

- **P0 — Broken / feels broken.** Ship-blockers. The reload bug lives here.
- **P1 — Credibility gaps.** Things a serious DeFi user will notice and distrust.
- **P2 — Design-system & consistency debt.** Slows every future change.
- **P3 — Polish & delight.** Competitive edge.

---

## P0 — Navigation, State & the "must reload" bug

This is your reported issue. There isn't one bug — there are **four overlapping causes**, and they compound.

### P0-1. Hard page reloads via `window.location.href` inside a SPA
Two places bypass the router and do a **full browser reload**, which throws away every in-memory Zustand store (positions, trades, scanner data, regime, wallet connection):

- [Sidebar.tsx:101](../apps/web/src/components/layout/Sidebar.tsx#L101) — collapsed/tablet wallet dot: `onClick={() => { window.location.href = '/settings'; }}`
- [ErrorBoundary.tsx:36](../apps/web/src/components/shared/ErrorBoundary.tsx#L36) — "Reload App" button.

**Effect:** On tablet width, clicking the wallet dot nukes the whole app and re-fetches everything from Hyperliquid. That *is* a "why did the whole thing reload" moment.
**Fix:** Use `useNavigate()` / `<Link>` everywhere. The ErrorBoundary can `navigate('/')` + `resetErrorBoundary()` without a document reload.

### P0-2. No scroll restoration / scroll-to-top on route change
The scroll container is `<main style={{ overflow: 'auto' }}>` in [AppShell.tsx:94](../apps/web/src/components/layout/AppShell.tsx#L94). React Router does **not** reset it. So:

- Scroll halfway down the Scanner → click a pair → **PairDetail opens already scrolled halfway down.** It reads as "the page didn't load."
- Hit browser Back → you're dumped at an arbitrary scroll offset with no memory of where you were.

**Fix:** Add a `<ScrollToTop>` effect (reset `main.scrollTop = 0` on `pathname` change) and, ideally, React Router's `<ScrollRestoration>` so Back returns you to your prior position. This alone will remove ~half of the "it's broken, let me reload" instinct.

### P0-3. TanStack Query is installed and wrapped but **never used** — so nothing is cached across navigation
[App.tsx:12-15](../apps/web/src/App.tsx#L12-L15) creates a `QueryClient` and provider, but there is not a single `useQuery` in the codebase. Every data read is a manual `fetch` in a `useEffect`:

- [PairDetail.tsx:135-151](../apps/web/src/pages/PairDetail.tsx#L135-L151) re-fetches funding history **and** candles from the HL API on **every mount** — i.e. every single time you open a pair or navigate back to one. No cache, no dedup, no background refresh. You get the "Loading…" flash every time.
- Scanner refetches on mount + polls, independent of everything else.

**Effect:** Going back and forth between pages re-hits the network and re-renders from an empty state → flicker, spinners, and the feeling that you need to reload to "get it to settle."
**Fix:** Actually use Query. Move `fetchFundingRates`, `fetchFundingHistory`, `fetchCandles`, `fetchAccountState` into `useQuery` with sane `staleTime` (e.g. 30s for rates, 5m for candles). You get caching, background refetch, request dedup, and instant back-navigation for free — and you delete a lot of manual `useEffect`/`useRef` plumbing.

### P0-4. Service worker can serve a mismatched app shell → blank/stale page until hard reload
[public/sw.js](../apps/web/public/sw.js) uses `skipWaiting()` + `clients.claim()` (lines 28, 41) so a new SW takes control of an **already-open tab** mid-session, while assets are **cache-first** (line 78) and the navigation fallback returns a possibly-old `caches.match('/index.html')` (line 65). Classic failure mode: the cached `index.html` references content-hashed JS that the new cache has purged → white screen → user reloads.

**Effect:** Intermittent "I had to reload to make it work," especially after a deploy.
**Fix options:**
- Don't `skipWaiting` automatically; show a non-blocking "New version available — refresh" toast and let the user opt in.
- Or adopt `vite-plugin-pwa` (Workbox) which handles precache manifest + versioned cleanup correctly instead of the hand-rolled SW.
- At minimum: network-first (or stale-while-revalidate) for the built JS/CSS, not cache-first-forever.

### P0-5. All meaningful app state is in-memory only
Only `wallet address`, `notif prefs`, and `webhook` hit `localStorage` (in [Settings.tsx](../apps/web/src/pages/Settings.tsx)). Positions, trades, equity curve, harvest log, scanner data — all evaporate on any reload or crash. Combined with P0-1/P0-4 (which *cause* reloads), the user watches their portfolio disappear.
**Fix:** Wrap the durable stores (`positionStore`, `equityCurveStore`, `harvestStore` config/log) in Zustand's `persist` middleware. This is a one-line-per-store change and it's the difference between "toy" and "product."

> **If you do nothing else in P0, do P0-2 (scroll reset) and P0-3 (use Query).** Together they eliminate the felt "must reload" behavior.

---

## P1 — Credibility gaps a DeFi user will notice

### P1-1. Wallet connection is buried in Settings
For a trading app, **connect wallet is the #1 conversion action** and it lives only inside `/settings`. The TopBar `LiveDot` ([TopBar.tsx:114](../apps/web/src/components/layout/TopBar.tsx#L114)) *displays* "Not Connected" but isn't clickable and doesn't connect. The sidebar footer routes to Settings but doesn't connect either.
**Fix:** Put a real **Connect Wallet** button in the TopBar (primary, top-right — where every DeFi user looks). It should open the connect flow directly, not a settings deep-link. Show address + balance chip when connected.

### P1-2. Dead / no-op controls erode trust
- [Portfolio.tsx:278-280](../apps/web/src/pages/Portfolio.tsx#L278-L280) — the `RefreshCw` button on each open position has **no `onClick`.** It looks actionable, does nothing.
- Scanner column headers for Price, 24h, Rate(8h), Net APY, Persist, 7d render a faded sort chevron ([Scanner.tsx:51](../apps/web/src/pages/Scanner.tsx#L51)) implying they're sortable — but they have **no `sortKey`,** so clicking does nothing. Either wire them up or drop the affordance.

### P1-3. Destructive action with no confirmation
[Portfolio.tsx:154-161](../apps/web/src/pages/Portfolio.tsx#L154-L161) — **"Clear All"** wipes every position and trade instantly on one click (just a toast after). Meanwhile closing a *single* position has a proper inline confirm. The more destructive action has *less* friction. Add a confirm (modal or the same inline pattern) and ideally an Undo toast.

### P1-4. Charts are non-interactive and unlabeled
The funding-history and price canvases in [PairDetail.tsx:40-117](../apps/web/src/pages/PairDetail.tsx#L40-L117) and the equity curve in [Portfolio.tsx:11-72](../apps/web/src/pages/Portfolio.tsx#L11-L72) have **no axes, no gridlines, no hover tooltips, no value labels, no time labels.** For a data product where users evaluate funding rates, a chart you can't read a value off of is decorative, not analytical. Consider a real chart lib (Recharts/visx/lightweight-charts) or at minimum add Y-axis ticks + a crosshair tooltip.

### P1-5. Search hijacks navigation on every keystroke
[TopBar.tsx:186](../apps/web/src/components/layout/TopBar.tsx#L186) — typing in search calls `navigate('/')` on each character if the value is non-empty. If you're on Portfolio reading a trade and type a letter into search, you're yanked to the Scanner mid-keystroke. Debounce, and only navigate on submit/explicit intent.

### P1-6. Color-only + emoji-only signaling
Signal state (ENTER/WAIT/EXIT), P&L, regime, and heat are communicated **primarily by red/green and by emoji** (🔥🌤🧊, ✅⚠️⏳🚫). Problems: (a) red/green is the single worst choice for the ~8% of users with color-vision deficiency, and (b) emoji-as-data-primitive reads as consumer-app, not institutional DeFi. Add a text label / icon shape alongside color, and consider replacing emoji with the Lucide icon set you already use everywhere else.

### P1-7. Stale-data honesty is inconsistent
The Scanner has a nice staleness indicator ([TopBar.tsx:98-109](../apps/web/src/components/layout/TopBar.tsx#L98-L109)), but Portfolio/Analytics/PairDetail have no "as of" timestamp or staleness signal at all. In a live-funds product, every number should carry a freshness cue.

---

## P2 — Design-system & consistency debt

This is the stuff that isn't visible to users on day one but taxes every future change and guarantees drift.

### P2-1. ~100% inline styles; the design tokens are barely used
You have a real token file ([tokens.css](../apps/web/src/styles/tokens.css)) and Tailwind configured — yet nearly every component is a wall of inline `style={{…}}` objects with **hardcoded pixel values** (font sizes 9/10/11/12/13/14/15/16/18/20/22/24 appear literally hundreds of times; colors sometimes tokens, sometimes raw `rgba(...)`). Consequences:
- No single source of truth for type scale, spacing, radius, or color.
- Impossible to theme, impossible to enforce, guaranteed inconsistency.
- Every card re-implements the same padding/border/typography by hand.

**Fix (incremental):** Establish a small set of primitives — `<Card>`, `<Stat>`, `<Badge>`, `<Button>` (you already have `.btn` CSS — extend that pattern), `<Table>`, `<PageHeader>` — backed by tokens. Migrate page by page. You'll delete thousands of lines.

### P2-2. No type scale / spacing scale enforcement
Define `--fs-xs … --fs-2xl` and `--sp-*` (some `--sp-*` exist) and **use them**. Right now spacing mixes `var(--sp-4)` and raw `10px`/`14px`/`9px 12px` in the same component.

### P2-3. Two duplicated `NAV` arrays
[AppShell.tsx:14-20](../apps/web/src/components/layout/AppShell.tsx#L14-L20) and [Sidebar.tsx:7-13](../apps/web/src/components/layout/Sidebar.tsx#L7-L13) define the same nav list twice (mobile vs sidebar). They will drift. Extract one `nav.config.ts`.

### P2-4. Imperative DOM manipulation inside React
[Harvest.tsx:518](../apps/web/src/pages/Harvest.tsx#L518) toggles a config panel via `document.getElementById('config-body')?.classList.toggle('hidden')` — reaching outside React to mutate the DOM, while an identical `Accordion` component with proper `useState` exists a few lines up. Use the component.

### P2-5. Dead code / unused imports
- `_Activity` imported unused in [AppShell.tsx:3](../apps/web/src/components/layout/AppShell.tsx#L3).
- `useWallet.ts` / `walletConnect.ts` / `signing.ts` exist under `src/api` and `src/hooks` — confirm they're wired; the actual connect flow is hand-rolled inline in Settings with `window.ethereum`, suggesting drift.
- Repeated CSV-export logic exists in **both** Portfolio and Settings — extract one `exportTradesCSV(trades)`.

### P2-6. Tables aren't responsive, they just scroll
`.table-wrap` forces `min-width: 720–860px` and horizontal scroll on mobile ([global.css:150-156](../apps/web/src/styles/global.css#L150-L156)). On a phone, an 11-column funding table you scrape sideways is not a mobile experience. Consider a card/stacked layout below `768px` for the Scanner and Portfolio tables (you already branch to a card layout on the Harvest page — do the same here).

---

## P3 — Polish & delight

- **Loading states are bare text.** "Loading rates…", "Loading…" everywhere. Add skeleton rows/cards (you have the layout; a shimmer is cheap and reads as "fast").
- **Empty states are text-only.** First-run Portfolio/Analytics/Harvest are plain paragraphs. A light illustration + one clear CTA per empty state raises perceived quality a lot.
- **Focus states / keyboard access.** `.input` sets `outline: none` and there are no `:focus-visible` styles. Clickable `<tr>` and `<div onClick>` (Scanner rows, sidebar wallet bar, Analytics rows) aren't keyboard-reachable and have no `role`/`tabIndex`/`onKeyDown`. This is both an a11y failure and a power-user gap (traders keyboard-navigate).
- **Icon-only buttons lack labels.** The per-position refresh/close icons, the mobile refresh — add `aria-label`/`title`.
- **PWA install toast fires after 3s unconditionally** ([AppShell.tsx:54-58](../apps/web/src/components/layout/AppShell.tsx#L54-L58)) *and* there's a fixed install banner — double prompting. Pick one, and delay/gate it behind engagement.
- **Brand tone mismatch.** Emoji-forward regime/signal styling vs. the otherwise sharp "Space Grotesk / mono / teal-on-near-black" institutional aesthetic. Decide the brand voice and make it consistent (I'd lean institutional and drop the emoji).
- **Number density.** Rates like `0.0042%` and `bps/hr` mixing with `%/hr` in different places — standardize the funding-rate unit across the app (pick bps/hr *or* %/hr and label once).
- **No light theme / no theme switch.** Fine to stay dark-only for launch, but the tokens are structured well enough that a theme layer is cheap if you ever want it.
- **Motion.** Only a `fadeIn` on page mount. Route transitions are instant/janky given the scroll issue. Once P0-2 lands, a subtle cross-fade between routes would elevate perceived quality.

---

## Suggested execution order

| Order | Item | Effort | Payoff |
|------:|------|:------:|--------|
| 1 | P0-2 scroll reset + `<ScrollRestoration>` | S | Kills the felt "reload" bug |
| 2 | P0-1 remove `window.location.href` reloads | S | Stops state wipes |
| 3 | P0-3 move fetches into TanStack Query | M | Instant back-nav, no flicker, less code |
| 4 | P0-5 persist durable stores | S | Data survives reload/crash |
| 5 | P0-4 fix service-worker update strategy | M | No post-deploy white screens |
| 6 | P1-1 wallet connect in TopBar | S | Conversion |
| 7 | P1-2 / P1-3 dead controls + destructive confirm | S | Trust |
| 8 | P2-1 design-system primitives (incremental) | L | Every future change gets faster |
| 9 | P1-4 real charts | M | Analytical credibility |
| 10 | P3 a11y + skeletons + empty states | M | Perceived quality |

---

## One-paragraph summary for the team

Osprey's frontend is feature-complete and visually on-brand, but it behaves like a prototype in three ways that a serious DeFi user will punish: **navigation doesn't preserve or reset scroll and occasionally hard-reloads the whole SPA (wiping in-memory state), data isn't cached across pages despite TanStack Query being installed, and nothing durable is persisted.** Those three are the entire "I have to manually reload" complaint and they're all small-to-medium fixes. Underneath, the app is built almost entirely from hardcoded inline styles despite having a good token system, so it will keep drifting until we extract a handful of primitives. Fix the P0 navigation/state cluster first — it's the highest ratio of user-perceived quality to engineering effort in the whole project.
