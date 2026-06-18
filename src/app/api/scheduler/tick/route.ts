// Scheduler tick endpoint — called by the always-on mini-service scheduler.
// Checks which jobs are due and runs them.
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getKlines, getTicker24h, getOrderBook, getFundingRate } from '@/lib/market/binance';
import { computeIndicators } from '@/lib/market/indicators';
import { computeConsensus, shouldAlert } from '@/lib/analysis/consensus';
import { gradeExpiredSignals } from '@/lib/analysis/grading';
import { checkPriceAlerts } from '@/lib/analysis/price-alerts';
import { resolveModel, completeWithAutoFallback } from '@/lib/llm/router';
import { SCHEDULER_TICK_SYSTEM } from '@/lib/llm/prompts';
import { sendSignalAlert } from '@/lib/alerts/telegram';
import { getSetting, setSetting, SETTING_KEYS } from '@/lib/config/settings';
import type { ApiResult } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isDue(job: { cronExpr: string; lastRunAt: Date | null }): boolean {
  // simplified: parse "*/N * * * *" as every N minutes
  const m = job.cronExpr.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*/);
  if (m) {
    const every = parseInt(m[1]);
    if (job.lastRunAt) {
      return Date.now() - job.lastRunAt.getTime() > every * 60 * 1000 - 5000;
    }
    return true;
  }
  // hourly "0 * * * *"
  if (job.cronExpr === '0 * * * *') {
    if (job.lastRunAt) {
      return Date.now() - job.lastRunAt.getTime() > 60 * 60 * 1000 - 5000;
    }
    return true;
  }
  return false;
}

async function runCryptoScan(sendAlerts: boolean) {
  const assets = await db.asset.findMany({ where: { assetClass: 'crypto', isActive: true } });
  const thresholds = await getSetting(SETTING_KEYS.alertThresholds, {});
  const defaultThreshold = await getSetting(SETTING_KEYS.defaultThreshold, { minConviction: 60, directions: ['long', 'short'] });
  const llmCfg = await resolveModel('crypto_technical', 'deep_reasoning');
  const results: any[] = [];

  for (const asset of assets) {
    try {
      const [klines, orderbook, funding, ticker] = await Promise.all([
        getKlines(asset.symbol, '4h', 200),
        getOrderBook(asset.symbol, 50),
        getFundingRate(asset.symbol).catch(() => null),
        getTicker24h(asset.symbol),
      ]);
      const indicators = computeIndicators(klines);

      let llmAnalysis: any;
      let llmLayer: any;
      if (llmCfg) {
        try {
          const prompt = `Analyze ${asset.symbol} (${asset.name}). Price $${ticker.price}, 24h ${ticker.changePct.toFixed(2)}%. RSI ${indicators.rsi.toFixed(0)}, MACD ${indicators.macd.histogram.toFixed(2)}, trend ${indicators.trend}. Order book imbalance ${(orderbook.imbalance * 100).toFixed(1)}%. Funding ${funding ? (funding.rate * 100).toFixed(4) + '%' : 'N/A'}. Respond JSON: {"score":<-100..100>,"rationale":"<2 sentences>","confidence":<0..100>}`;
          const result = await completeWithAutoFallback({
            provider: llmCfg.providerName,
            model: llmCfg.modelId,
            messages: [
              { role: 'system', content: llmCfg.systemPrompt || SCHEDULER_TICK_SYSTEM },
              { role: 'user', content: prompt },
            ],
            temperature: llmCfg.temperature,
            jsonMode: true,
            maxTokens: 300,
          });
          const parsed = JSON.parse(result.content);
          llmAnalysis = { score: parsed.score, rationale: parsed.rationale, model: `${result.usedProvider ?? llmCfg.providerName}/${result.usedModel ?? llmCfg.modelId}` };
          llmLayer = { layer: 'technical', score: parsed.score, confidence: parsed.confidence ?? 70, detail: parsed.rationale.slice(0, 120), model: llmAnalysis.model };
        } catch { /* tiered: skip LLM on failure */ }
      }

      const consensus = computeConsensus(
        { asset: asset.symbol, timeframe: '4h', price: ticker.price, technical: indicators, orderbook, fundingRate: funding?.rate, llmAnalysis },
        llmLayer
      );

      const created = await db.signal.create({
        data: {
          assetId: asset.id,
          direction: consensus.direction,
          conviction: consensus.conviction,
          timeframe: '4h',
          layersSummary: JSON.stringify(consensus.layers),
          modelsUsed: JSON.stringify(consensus.modelsUsed),
          entryPrice: consensus.entryPrice,
          stopLoss: consensus.stopLoss,
          takeProfit: consensus.takeProfit,
          rationale: consensus.rationale,
          status: 'open',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      let alerted = false;
      if (sendAlerts) {
        const assetThreshold = (thresholds as any)[asset.symbol] ?? defaultThreshold;
        if (shouldAlert(consensus, assetThreshold)) {
          alerted = await sendSignalAlert(consensus);
        }
      }
      results.push({ symbol: asset.symbol, direction: consensus.direction, conviction: consensus.conviction, alerted, signalId: created.id });
    } catch (e: any) {
      results.push({ symbol: asset.symbol, error: e.message });
    }
  }
  return results;
}

export async function POST(req: NextRequest) {
  try {
    const forceModule = req.nextUrl.searchParams.get('module');
    const sendAlerts = req.nextUrl.searchParams.get('alerts') === '1';
    await setSetting(SETTING_KEYS.lastSchedulerTick, new Date().toISOString());

    // Self-learning loop: grade any expired open signals BEFORE running new
    // scans so today's tick closes yesterday's calls. Wrapped in try/catch so
    // a grading failure (e.g. exchange outage) never blocks the scheduler.
    let gradingSummary: { graded: number; skipped: number } | null = null;
    try {
      gradingSummary = await gradeExpiredSignals();
    } catch {
      /* grading is best-effort — do not block the tick */
    }

    // Price-alert threshold check — runs BEFORE crypto scans so user-defined
    // alerts on any asset (crypto/forex/stock/index/commodity) fire as soon as
    // prices move. Best-effort: a Yahoo outage or single-asset failure must not
    // block the rest of the tick. Shares the same engine as the
    // /api/price-alerts/check endpoint and the "Check Now" button.
    let priceAlertSummary: { checked: number; triggered: number } | null = null;
    try {
      priceAlertSummary = await checkPriceAlerts();
    } catch {
      /* price alerts are best-effort — do not block the tick */
    }

    const jobs = await db.scheduleJob.findMany({ where: { enabled: true } });
    const due = jobs.filter((j) => forceModule ? j.moduleKey === forceModule : isDue(j));
    if (due.length === 0) {
      return NextResponse.json<ApiResult<{ ran: any[]; skipped: true; grading: typeof gradingSummary; priceAlerts: typeof priceAlertSummary }>>({ success: true, data: { ran: [], skipped: true, grading: gradingSummary, priceAlerts: priceAlertSummary } });
    }

    const ran: any[] = [];
    for (const job of due) {
      try {
        let result: any;
        if (job.moduleKey === 'crypto_technical') {
          result = { module: job.moduleKey, assets: await runCryptoScan(sendAlerts) };
        } else {
          result = { module: job.moduleKey, note: 'module not yet implemented in tick' };
        }
        await db.scheduleJob.update({
          where: { id: job.id },
          data: { lastRunAt: new Date(), lastStatus: 'success', lastError: null },
        });
        ran.push(result);
      } catch (e: any) {
        await db.scheduleJob.update({
          where: { id: job.id },
          data: { lastRunAt: new Date(), lastStatus: 'error', lastError: e.message.slice(0, 500) },
        });
        ran.push({ module: job.moduleKey, error: e.message });
      }
    }

    // Best-effort Supabase sync — push new data to cloud if configured.
    // Wrapped in try/catch so sync failures never block the scheduler.
    let syncSummary: { totalSynced: number; totalErrors: number } | null = null;
    try {
      const { syncToSupabase } = await import('@/lib/supabase/sync');
      const syncResult = await syncToSupabase();
      syncSummary = { totalSynced: syncResult.totalSynced, totalErrors: syncResult.totalErrors };
      console.log(`[supabase-sync] Auto-synced ${syncResult.totalSynced} rows in ${syncResult.durationMs}ms`);
    } catch {
      /* Supabase not configured or sync failed — don't block the tick */
    }

    return NextResponse.json<ApiResult<{ ran: typeof ran; skipped: false; grading: typeof gradingSummary; priceAlerts: typeof priceAlertSummary; sync: typeof syncSummary }>>({ success: true, data: { ran, skipped: false, grading: gradingSummary, priceAlerts: priceAlertSummary, sync: syncSummary } });
  } catch (e: any) {
    return NextResponse.json<ApiResult<never>>({ success: false, error: e.message }, { status: 500 });
  }
}

export async function GET() {
  const jobs = await db.scheduleJob.findMany({ orderBy: { moduleKey: 'asc' } });
  const lastTick = await getSetting(SETTING_KEYS.lastSchedulerTick, null);
  return NextResponse.json<ApiResult<{ jobs: typeof jobs; lastTick: any }>>({ success: true, data: { jobs, lastTick } });
}
