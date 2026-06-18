import { NextRequest, NextResponse } from 'next/server';
import { getSetting, setSetting, getAllSettings, SETTING_KEYS } from '@/lib/config/settings';
import type { ApiResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const settings = await getAllSettings();
  return NextResponse.json<ApiResult<typeof settings>>({ success: true, data: settings });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // body can be a single {key,value} or a map of {key:value}
    if (body.key && 'value' in body) {
      await setSetting(body.key, body.value);
    } else {
      for (const [k, v] of Object.entries(body)) {
        await setSetting(k, v);
      }
    }
    return NextResponse.json<ApiResult<{ ok: boolean }>>({ success: true, data: { ok: true } });
  } catch (e: any) {
    return NextResponse.json<ApiResult<never>>({ success: false, error: e.message }, { status: 500 });
  }
}
