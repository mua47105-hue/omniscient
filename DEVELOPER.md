# OMNISCIENT — Developer Guide

Complete technical documentation for developers extending or maintaining this project.

## Architecture Overview

Next.js 16 (App Router) monolith with server-side API routes, Prisma ORM for database access, and a client-side React dashboard. No microservices — all logic runs in Next.js server components and API routes.

```
Browser → Next.js (Vercel) → API Routes → Prisma → Database (SQLite/Supabase)
                                      ↘ External APIs (Binance, Yahoo, LLMs, RSS)
```

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router, Turbopack) | 16.1.x |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS v4 + shadcn/ui (New York) | 4.x |
| Database | Prisma ORM (SQLite dev / PostgreSQL prod) | 6.11.1 |
| State | @tanstack/react-query (server), React state (client) | 5.x |
| Animations | framer-motion | 12.x |
| Charts | recharts | 2.x |
| Icons | lucide-react | 0.525.x |
| Fonts | Inter (sans) + JetBrains Mono (mono) via next/font/google | — |
| Auth | Custom middleware + cookie (APP_PASSWORD env var) | — |

## Project Structure

```
src/
├── app/                          # Next.js App Router
│   ├── (routes)/page.tsx         # 23 page routes (server wrappers)
│   ├── api/                      # 40+ API routes (server-side)
│   │   ├── auth/login/           # Password authentication
│   │   ├── crypto/               # Binance data endpoints
│   │   ├── markets/              # Yahoo + fallback endpoints
│   │   ├── llm/                  # LLM provider management
│   │   ├── scheduler/tick/       # Cron job execution
│   │   ├── news/                 # RSS + web search + LLM sentiment
│   │   ├── ipo-ico/              # LLM-extracted IPO/ICO data
│   │   ├── supabase/             # Supabase connection + sync
│   │   ├── setup/                # One-time database seeder
│   │   └── ...                   # signals, portfolio, screener, etc.
│   ├── globals.css               # Tailwind v4 config + theme variables
│   └── layout.tsx                # Root layout (fonts, providers, AppShell)
│
├── components/
│   ├── ui/                       # shadcn/ui components (55+ files)
│   ├── layout/                   # AppShell, Sidebar, Header, Footer, MobileNav
│   ├── dashboard/                # Overview, StatCard, LiveTickerBar, CommandPalette
│   ├── crypto/                   # CryptoOverview, CryptoAsset detail
│   ├── markets/                  # MarketsClient, HeatMap, AssetDetail
│   ├── signals/                  # SignalsFeedClient
│   ├── settings/                 # ProvidersManager, AlertsManager, SecurityClient, etc.
│   ├── auth/                     # LockClient (password screen)
│   └── ...                       # 89 component files total
│
├── lib/
│   ├── db.ts                     # Prisma client singleton (schema-hash aware)
│   ├── types.ts                  # Shared TypeScript types
│   ├── config/settings.ts        # KV settings store (getSetting/setSetting)
│   ├── llm/
│   │   ├── router.ts             # Multi-provider LLM router with auto-fallback
│   │   └── prompts.ts            # Optimized system prompts per module
│   ├── market/
│   │   ├── binance.ts            # Binance REST + WebSocket client (with caching)
│   │   ├── macro.ts              # Yahoo Finance + fallbacks (er-api, Alpha Vantage, PAXG)
│   │   └── indicators.ts         # Technical indicators (RSI, MACD, EMA, Bollinger, VWAP, ATR)
│   ├── analysis/
│   │   ├── consensus.ts          # 7-layer weighted consensus engine
│   │   ├── grading.ts            # Signal outcome grading (self-learning loop)
│   │   ├── backtest.ts           # Historical strategy backtesting engine
│   │   ├── screener.ts           # 14-filter market scanner
│   │   ├── correlation.ts        # Pearson correlation matrix
│   │   ├── multi-timeframe.ts    # Multi-timeframe confluence scoring
│   │   ├── derivatives.ts        # Funding rate / OI interpretation
│   │   ├── price-alerts.ts       # Price alert checking engine
│   │   └── strategy-builder.ts   # Screener→backtest mapping
│   ├── alerts/telegram.ts        # Telegram bot message dispatcher
│   ├── supabase/
│   │   ├── client.ts             # Supabase client factory
│   │   ├── sync.ts               # SQLite → Supabase data sync
│   │   └── schema-sql.ts         # PostgreSQL DDL for Supabase tables
│   ├── risk/calculations.ts      # Position sizing + liquidation math
│   └── db/seed*.ts               # Database seed scripts
│
├── hooks/
│   ├── useLiveTicker.ts          # Binance WebSocket live price hook
│   ├── use-mobile.ts             # Responsive breakpoint hook
│   └── use-toast.ts              # Toast notification hook
│
├── middleware.ts                 # Auth gate (redirects to /lock if no cookie)
└── prisma/
    └── schema.prisma             # 16 Prisma models (SQLite/PostgreSQL compatible)
```

## Database Schema (16 Models)

| Model | Purpose |
|-------|---------|
| `LlmProvider` | LLM provider config (name, baseUrl, apiKey, models) |
| `LlmModel` | Individual model under a provider |
| `ModuleModelConfig` | Maps analysis module → provider+model |
| `Asset` | Tracked assets (crypto, forex, stocks, indices, commodities) |
| `Watchlist` | Named asset groups |
| `Signal` | Generated trade signals (direction, conviction, layers) |
| `SignalOutcome` | Graded signal results (correct/wrong/partial) |
| `Alert` | Telegram delivery log |
| `PriceAlert` | User-defined threshold alerts |
| `NewsItem` | Cached news articles with sentiment |
| `IpoIcoItem` | Upcoming IPO/ICO data |
| `Report` | Daily/weekly/monthly reports |
| `PortfolioHolding` | User portfolio positions |
| `ScheduleJob` | Cron job config + status |
| `Setting` | Global KV store (API keys, config, thresholds) |
| `DataSnapshot` | Raw data snapshots for grading |

JSON fields stored as `String` (TEXT) — parsed in code. Keeps schema identical across SQLite and PostgreSQL.

## LLM Router Architecture

```
completeWithAutoFallback(request)
  ├── Try requested provider (with multi-key rotation)
  │   ├── parseKeys(apiKey) → ["key1", "key2", ...]
  │   ├── Try key1 → 429? → markKeyRateLimited(key1) → try key2
  │   └── All keys exhausted? → throw
  └── Fallback chain (sorted by PRIORITY)
      ├── Pollinations (1) — free, no key, always available
      ├── Mistral (2) — reliable, ~700ms
      ├── NVIDIA NIM (3) — fast with llama-3.3-70b
      ├── OpenRouter (4) — paid llama-3.3-70b
      ├── Cerebras (5) — ultra-fast when configured
      ├── AIMLAPI (6) — 400+ models
      ├── SiliconFlow (7) — open-source models
      ├── Hugging Face (8) — free tier
      ├── xAI Grok (9) — free $25 credit
      ├── Gemini (10) — often 429/geo-blocked
      └── Groq (11) — 403 Cloudflare block from datacenter IPs
```

**Multi-key rotation**: Provider's `apiKey` field accepts newline-separated keys. Router splits, rotates, and cooldowns rate-limited keys (60s).

**Provider detection**:
- `isGemNative()` — Gemini uses native API format (not OpenAI-compatible)
- `isOR()` — OpenRouter needs `HTTP-Referer` + `X-Title` headers
- All others use standard OpenAI-compatible `/chat/completions`

## Data Pipeline

```
External APIs → lib/market/* → API routes → React components
                                    ↓
                            lib/analysis/* → Signals → DB → Telegram

Binance (crypto):
  REST: ticker24h, klines, depth, fundingRate, openInterest
  WebSocket: combined ticker stream (10 symbols)
  Caching: 10s (tickers), 30s (klines), 5s (orderbook)
  418 fallback: batch → per-symbol parallel requests

Yahoo Finance (forex/stocks/indices/commodities):
  Primary: query2.finance.yahoo.com (via node:https)
  Fallbacks: open.er-api.com (forex), Binance PAXG (gold), Alpha Vantage (stocks)
  Caching: 5 min

LLM analysis:
  Scheduler tick → for each asset:
    1. Fetch klines + orderbook + funding (parallel)
    2. computeIndicators(klines) → RSI, MACD, EMA, Bollinger, VWAP, ATR
    3. LLM prompt with indicators → score, direction, rationale
    4. computeConsensus(layers) → weighted signal
    5. Save Signal to DB
    6. If conviction > threshold → send Telegram alert
    7. Auto-sync to Supabase
```

## Authentication

Custom middleware-based password lock:
1. `middleware.ts` intercepts all page routes (not API routes)
2. Checks `omniscient-auth` cookie
3. No cookie → redirect to `/lock`
4. `/lock` page → POST `/api/auth/login` with password
5. Login checks `process.env.APP_PASSWORD || 'omniscient'`
6. Correct → sets httpOnly cookie (30 day expiry)
7. `AppShell` renders WITHOUT sidebar/header on `/lock` route

## Deployment

### Vercel (recommended)
- Connect GitHub repo → auto-deploy on push
- Vercel auto-detects Next.js
- `scripts/swap-provider.cjs` runs before `prisma generate` in build:
  - If `DATABASE_URL` or `POSTGRES_PRISMA_URL` starts with `postgresql://` → sets Prisma provider to `postgresql`
  - If `file:` → keeps `sqlite`
- Environment variables needed:
  - `APP_PASSWORD` (default: `omniscient`)
  - `DATABASE_URL` or use Vercel's Supabase integration (auto-sets `POSTGRES_PRISMA_URL`)
- After first deploy: visit `/api/setup` to seed database

### Local Development
```bash
bun install
bun run db:push        # Create SQLite tables
bun run db:generate    # Generate Prisma client
bun run src/lib/db/seed.ts          # Seed providers + watchlists
bun run src/lib/db/seed-markets.ts  # Seed 46 assets
bun run dev            # Start dev server on :3000
```

## Key Design Decisions

1. **Prisma provider swapping** — schema.prisma uses `provider = "sqlite"` by default. The `swap-provider.cjs` script changes it to `postgresql` at build time when a PostgreSQL DATABASE_URL is detected. Avoids maintaining two schema files.

2. **Inline styles for glass morphism** — `backdrop-filter` and `box-shadow` are set via React inline `style` props on the Card component because Tailwind v4's CSS compiler strips `backdrop-filter` from class-based rules.

3. **JSON as String in DB** — All JSON fields (layersSummary, modelsUsed, meta, details, etc.) stored as `String` (TEXT). Parsed via `JSON.parse()` in code. Keeps schema identical across SQLite and PostgreSQL without Prisma `Json` type issues.

4. **node:https for external APIs** — Binance, Yahoo, and LLM providers are called via Node's native `https` module instead of `fetch()`. This bypasses Next.js's patched fetch (which breaks with some providers due to Cloudflare bot detection).

5. **LlmProvider.apiKey multi-key** — The apiKey field accepts newline-separated keys. The router splits them, rotates through available keys, and applies 60s cooldowns on rate-limited keys. No schema change needed — just split by `\n`.

## Adding a New Page

1. Create `src/app/my-page/page.tsx`:
```tsx
import { MyPageClient } from '@/components/my-page/MyPageClient';
export const dynamic = 'force-dynamic';
export default function Page() { return <MyPageClient />; }
```

2. Create `src/components/my-page/MyPageClient.tsx` (`'use client'`)

3. Add to `src/components/layout/Sidebar.tsx` NAV_GROUPS + `MobileNav.tsx`

4. Add API route at `src/app/api/my-page/route.ts` if needed

## Adding a New LLM Provider

1. Add to seed script (`src/lib/db/seed.ts`) or via Settings → Providers UI
2. Set `baseUrl` to the OpenAI-compatible endpoint
3. Set `apiKey` (or `PASTE_YOUR_KEY` as placeholder)
4. Add model entries with `modelId`, `displayName`, `contextWindow`
5. If provider needs special headers (like OpenRouter), add detection in `router.ts`:
   ```ts
   function isMyProvider(baseUrl: string) { return baseUrl.includes('myprovider.com'); }
   ```
6. Add to PRIORITY map in `completeWithAutoFallback()`

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | Yes (prod) | `file:./db/custom.db` | Prisma database connection |
| `APP_PASSWORD` | No | `omniscient` | Lock screen password |
| `POSTGRES_PRISMA_URL` | Auto (Vercel) | — | Set by Vercel Supabase integration |

API keys (stored in DB via Settings UI, not env vars):
- LLM provider keys (Gemini, Groq, NVIDIA NIM, Mistral, OpenRouter, etc.)
- Telegram bot token + chat ID
- Finnhub, Alpha Vantage API keys
- Supabase URL + anon key

## Scripts

| Script | Purpose |
|--------|---------|
| `bun run dev` | Start dev server (port 3000) |
| `bun run build` | Build for production (swap-provider → prisma generate → next build) |
| `bun run start` | Start production server |
| `bun run lint` | Run ESLint |
| `bun run db:push` | Push schema to database |
| `bun run db:generate` | Generate Prisma client |
| `GET /api/setup` | Seed database (one-time, on Vercel) |
