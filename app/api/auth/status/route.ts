import { NextResponse } from 'next/server';

import { getAuthStatus } from '@/lib/server/auth';

export async function GET() {
  try {
    return NextResponse.json(await getAuthStatus(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not read auth status.',
      },
      { status: 500 },
    );
  }
}
