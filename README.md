---
title: OMNISCIENT
emoji: 📊
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# OMNISCIENT — Global Market Intelligence System

24/7 AI-powered global market intelligence. Crypto, forex, commodities, indices, stocks, IPOs/ICOs, macro economy — multi-LLM deep analysis with Telegram alerts.

## Deploy to Vercel (Recommended — Free)

1. Push this code to a GitHub repo
2. Go to https://vercel.com/new → Import the repo
3. Vercel auto-detects Next.js → Click **Deploy**
4. Add environment variable `DATABASE_URL` in Vercel settings (your Supabase connection string)
5. Done! Live at `https://omniscient.vercel.app`

## Quick Start (Local Dev)

```bash
bun install
bun run db:push
bun run db:generate
bun run src/lib/db/seed.ts
bun run src/lib/db/seed-markets.ts
bun run dev
```

## Default Password

The app is password-protected. Default password: `omniscient`
Change it in Settings → Security after first login.

## Features

- **22 pages**: Overview, Crypto, Markets, Heat Map, Correlation, Screener, Signals, Derivatives, Multi-TF, Alerts, Portfolio, Risk Calc, Backtest, Strategy Builder, Analytics, News, Macro, Econ Calendar, IPO/ICO, Notifications, Reports, Settings
- **11 LLM providers** with auto-fallback + multi-key rotation
- **Password lock** — protects your dashboard
- **Apple Liquid Glass UI** with Inter + JetBrains Mono fonts
- **Supabase cloud sync**
- **Telegram alerts**
- **RSS news feeds** (CoinDesk, Cointelegraph, Decrypt)
- **Binance WebSocket** real-time prices
- **Optimized system prompts** for each analysis module

## Tech Stack

- Next.js 16 (App Router, standalone output)
- TypeScript 5
- Tailwind CSS 4 + shadcn/ui
- Prisma ORM (SQLite dev / Supabase Postgres prod)
- @tanstack/react-query
- framer-motion + recharts

## License

MIT
