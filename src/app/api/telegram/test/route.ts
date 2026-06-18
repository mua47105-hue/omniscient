// Telegram test endpoint — sends a test message to verify the bot token + chat ID.
// Supports inline testing (token + chatId in body) or using saved credentials.
import { NextRequest, NextResponse } from 'next/server';
import { sendTestMessage } from '@/lib/alerts/telegram';
import { getSetting } from '@/lib/config/settings';
import type { ApiResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // If token + chatId provided in body, test inline (before saving)
    if (body.token && body.chatId) {
      const res = await fetch(`https://api.telegram.org/bot${body.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: body.chatId,
          text: '✅ OMNISCIENT Telegram channel connected. You will receive trade signals here.',
        }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        let hint = '';
        try {
          const errJson = JSON.parse(errBody);
          if (errJson.description?.includes('chat not found')) {
            hint = ' — Open Telegram, search for your bot, and send /start to it first.';
          } else if (errJson.description) {
            hint = ` — ${errJson.description}`;
          }
        } catch { /* keep raw */ }
        throw new Error(`Telegram ${res.status}: ${errBody.slice(0, 200)}${hint}`);
      }
      return NextResponse.json<ApiResult<{ ok: boolean }>>({ success: true, data: { ok: true } });
    }

    // Use saved credentials
    const token = await getSetting<string>('telegram_bot_token', '');
    const chatId = await getSetting<string>('telegram_chat_id', '');
    if (!token || !chatId) {
      return NextResponse.json<ApiResult<never>>(
        { success: false, error: 'Telegram bot token or chat ID not configured. Save your credentials first.' },
        { status: 400 },
      );
    }

    // Send test message — use plain text (no parse_mode) to avoid formatting errors
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: '✅ OMNISCIENT Telegram channel connected. You will receive trade signals here.',
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      let hint = '';
      try {
        const errJson = JSON.parse(errBody);
        if (errJson.description?.includes('chat not found')) {
          hint = ' — Open Telegram, search for your bot, and send /start to it first.';
        } else if (errJson.description?.includes('Not Found')) {
          hint = ' — Bot token not found. Check for extra quotes/spaces.';
        } else if (errJson.description) {
          hint = ` — ${errJson.description}`;
        }
      } catch { /* keep raw */ }
      throw new Error(`Telegram ${res.status}: ${errBody.slice(0, 200)}${hint}`);
    }

    return NextResponse.json<ApiResult<{ ok: boolean }>>({ success: true, data: { ok: true } });
  } catch (e: any) {
    return NextResponse.json<ApiResult<never>>(
      { success: false, error: e.message },
      { status: 500 },
    );
  }
}
