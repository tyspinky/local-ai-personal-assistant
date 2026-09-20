import { NextResponse } from 'next/server';

import { clearSessionCookie } from '@/lib/server/auth';

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json(
    { authenticated: false },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
