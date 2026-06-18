// POST /api/supabase/test — tests the Supabase connection.
// Accepts { url?, anonKey? } for inline testing, or uses saved credentials.
import { NextRequest, NextResponse } from 'next/server';
import { testSupabaseConnection } from '@/lib/supabase/client';
import type { ApiResult } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { url, anonKey } = body as { url?: string; anonKey?: string };
    const result = await testSupabaseConnection(url, anonKey);
    return NextResponse.json<ApiResult<typeof result>>({ success: true, data: result });
  } catch (e: any) {
    return NextResponse.json<ApiResult<never>>(
      { success: false, error: e.message },
      { status: 500 },
    );
  }
}
