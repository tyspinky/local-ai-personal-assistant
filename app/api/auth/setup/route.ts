import { NextRequest, NextResponse } from 'next/server';

import { createOwner, setSessionCookie } from '@/lib/server/auth';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const displayName =
      (typeof body.displayName === 'string'
        ? body.displayName
        : 'Owner'
      ).trim() || 'Owner';
    const password = typeof body.password === 'string' ? body.password : '';
    const deviceLabel =
      (typeof body.deviceLabel === 'string' ? body.deviceLabel : '').trim() ||
      'Primary MacBook';

    if (password.length < 12) {
      return NextResponse.json(
        { error: 'Use an owner password with at least 12 characters.' },
        { status: 400 },
      );
    }

    const session = await createOwner({ displayName, password, deviceLabel });
    await setSessionCookie(session.token, session.expiresAt);

    return NextResponse.json(
      { authenticated: true, setupRequired: false },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Could not create owner.',
      },
      { status: 400 },
    );
  }
}
