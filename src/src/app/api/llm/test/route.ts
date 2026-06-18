// LLM provider test endpoint — sends a simple "Say OK" prompt to verify
// the provider+model+key configuration works. Supports autoFallback to
// test the fallback chain.
import { NextRequest, NextResponse } from 'next/server';
import { complete, completeWithAutoFallback } from '@/lib/llm/router';
import type { ApiResult, LlmCompletionResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { provider, model, autoFallback } = body as {
      provider: string;
      model?: string;
      autoFallback?: boolean;
    };

    if (!provider) {
      return NextResponse.json<ApiResult<never>>(
        { success: false, error: 'provider is required' },
        { status: 400 }
      );
    }

    const messages = [
      { role: 'user' as const, content: 'Say OK' },
    ];

    let result: LlmCompletionResponse & {
      usedProvider?: string;
      usedModel?: string;
      fallbackUsed?: boolean;
      fallbackFrom?: string;
    };

    if (autoFallback) {
      result = await completeWithAutoFallback({
        provider,
        model: model ?? '',
        messages,
        temperature: 0,
        maxTokens: 5,
      });
    } else {
      result = await complete({
        provider,
        model: model ?? '',
        messages,
        temperature: 0,
        maxTokens: 5,
      });
    }

    return NextResponse.json<ApiResult<typeof result>>({
      success: true,
      data: result,
    });
  } catch (e: any) {
    return NextResponse.json<ApiResult<never>>(
      { success: false, error: e.message },
      { status: 500 }
    );
  }
}
