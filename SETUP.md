# 🦅 Osprey — Setup Guide

Everything you need to go from zero to a running dev environment, push to GitHub, and deploy to production.

---

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | ≥ 20 | `node -v` |
| npm | ≥ 10 | `npm -v` |
| Git | any | `git --version` |

---

## 1. Clone & install

```bash
# Clone your fork (replace URL with your own repo)
git clone https://github.com/YOUR_USERNAME/osprey.git
cd osprey

# Install all dependencies
npm install

# Copy environment variables
cp .env.example .env.local
```

`.env.local` works out of the box for demo mode — no edits needed to start.

---

## 2. Run the dev server

```bash
npm run dev
```

Open **http://localhost:5173** in your browser. The app loads in demo mode with live Hyperliquid
rate data (falls back to realistic mock data if the API is unreachable).

Hot Module Replacement is enabled — edits to any `.tsx` or `.ts` file reload instantly.

---

## 3. GitHub Codespaces (zero-install cloud dev)

If you're working in a Codespace, everything is pre-configured via `.devcontainer/devcontainer.json`.

After the Codespace boots:

```bash
# Dependencies are installed automatically by postCreateCommand.
# Just start the server:
npm run dev
```

Codespaces will prompt you to open the forwarded port 5173 in a browser tab.
Click **Open in Browser**.

---

## 4. All available scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start dev server at localhost:5173 |
| `npm run build` | TypeScript check + production Vite build → `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run all 37 tests once (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests + generate coverage report in `coverage/` |
| `npm run typecheck` | Full TypeScript check with no emit |
| `npm run lint` | ESLint over all `.ts` / `.tsx` files |

---

## 5. Git workflow

### First push to a new GitHub repo

```bash
# 1. Create a new empty repo on GitHub (no README, no .gitignore)
#    https://github.com/new

# 2. Add the remote origin
git remote add origin https://github.com/YOUR_USERNAME/osprey.git

# 3. Stage all files
git add .

# 4. Initial commit
git commit -m "feat: initial Osprey build"

# 5. Push and set upstream
git push -u origin main
```

### Day-to-day workflow

```bash
# Pull latest before starting work
git pull origin main

# Create a feature branch
git checkout -b feat/my-feature

# ... make changes ...

# Stage changed files
git add .

# Commit with a descriptive message
git commit -m "feat: add regime shift desktop notifications"

# Push the branch
git push origin feat/my-feature

# Open a Pull Request on GitHub → merge into main
```

### Commit message conventions

| Prefix | Use for |
|---|---|
| `feat:` | new feature |
| `fix:` | bug fix |
| `refactor:` | restructuring without behaviour change |
| `test:` | adding or updating tests |
| `docs:` | documentation only |
| `chore:` | build, deps, config changes |

### Useful git shortcuts

```bash
# See what's changed
git status
git diff

# Undo last commit (keep changes staged)
git reset --soft HEAD~1

# Discard all local changes (destructive)
git checkout .

# View commit log
git log --oneline -10

# Pull and rebase (cleaner history than merge)
git pull --rebase origin main
```

### CI runs automatically on every push

The GitHub Actions workflow at `.github/workflows/ci.yml` runs on every push and PR:
- `tsc --noEmit` — TypeScript type check
- `vite build` — full production build

To also run tests in CI, add this step to the workflow:

```yaml
- run: npm test
```

---

## 6. Deploy to Vercel (recommended — free, zero spin-down)

### One-time CLI deploy

```bash
# Install Vercel CLI globally
npm install -g vercel

# Login
vercel login

# First deploy (follow the prompts — framework is auto-detected as Vite)
vercel

# Promote to production
vercel --prod
```

The `vercel.json` in the repo already handles SPA routing rewrites.

### Auto-deploy on every git push (recommended)

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repo
3. Accept the auto-detected Vite settings
4. Every push to `main` deploys automatically
5. Every PR gets its own preview URL

### Environment variables on Vercel

In **Vercel Dashboard → Project → Settings → Environment Variables**:

| Key | Value |
|---|---|
| `VITE_HL_REST_URL` | `https://api.hyperliquid.xyz` |
| `VITE_HL_WS_URL` | `wss://api.hyperliquid.xyz/ws` |
| `VITE_ENABLE_REAL_TRADING` | `true` |

---

## 7. Deploy to Cloudflare Pages (alternative)

Connect your GitHub repo in the Cloudflare dashboard:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |

Add `public/_redirects` for SPA routing:

```
/*  /index.html  200
```

---

## 8. Deploy to GitHub Pages (simplest, no custom domain on free tier)

```bash
npm install -D gh-pages
```

Add to `package.json` scripts:
```json
"deploy": "gh-pages -d dist"
```

Add `base` to `vite.config.ts`:
```ts
base: '/osprey/',
```

Then:
```bash
npm run build && npm run deploy
```

---

## 9. Real trading mode

1. Switch mode to **Real** in the sidebar or Settings page
2. Click **Connect MetaMask**
3. Approve the connection in MetaMask
4. Osprey signs all orders locally in MetaMask — your private key never leaves your browser

> ⚠️  Never commit a private key. Osprey is designed so it never needs custody of your keys —
> all signing happens in MetaMask on your machine.

---

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| White screen on load | Open browser console (F12). Most common cause: missing `node_modules` → run `npm install` |
| `Cannot find module` | Run `npm install` — a dependency is missing |
| Rates not loading | HL API may be unreachable — app auto-falls back to mock data |
| TypeScript errors | Run `npm run typecheck` for full error list with line numbers |
| Port 5173 in use | `npm run dev -- --port 5174` |
| Tests not found | Ensure files match `**/*.{test,spec}.{ts,tsx}` and aren't inside `node_modules` |
| Codespace port not opening | Go to Ports tab in VS Code terminal panel → right-click 5173 → Open in Browser |
