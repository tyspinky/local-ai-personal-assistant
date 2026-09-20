import { NextRequest, NextResponse } from 'next/server';

import { loginOwner, setSessionCookie } from '@/lib/server/auth';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const password = typeof body.password === 'string' ? body.password : '';
    const deviceLabel =
      (typeof body.deviceLabel === 'string' ? body.deviceLabel : '').trim() ||
      'Approved device';

    const session = await loginOwner({ password, deviceLabel });
    await setSessionCookie(session.token, session.expiresAt);

    return NextResponse.json(
      { authenticated: true, setupRequired: false },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Could not log in.',
      },
      { status: 401 },
    );
  }
}
