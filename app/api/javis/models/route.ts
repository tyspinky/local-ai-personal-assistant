import { NextRequest, NextResponse } from 'next/server';

import { requireOwner } from '@/lib/server/auth';
import { audit, listState } from '@/lib/server/javis-db';
import { listOllamaModels } from '@/lib/server/ollama';

function json(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function GET() {
  try {
    const auth = await requireOwner();
    if (!auth.ok) return json({ error: auth.message }, { status: auth.status });
    const db = auth.db;
    const state = await listState(db);
    const models = await listOllamaModels();

    return json({
      provider: 'ollama',
      selectedModel: state.settings.local_model ?? 'qwen3:8b',
      models,
    });
  } catch (error) {
    return json(
      {
        provider: 'ollama',
        selectedModel: 'qwen3:8b',
        models: [],
        error:
          error instanceof Error
            ? error.message
            : 'Could not reach the local model server.',
      },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwner();
    if (!auth.ok) return json({ error: auth.message }, { status: auth.status });
    const db = auth.db;
    const body = (await request.json()) as Record<string, unknown>;
    const value = (typeof body.model === 'string' ? body.model : '').trim();

    if (!value) {
      return json({ error: 'Model name is required.' }, { status: 400 });
    }

    await db
      .prepare(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('local_model', ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key)
         DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(value)
      .run();
    await audit(db, 'setting.local_model', 'setting', 'local_model', {
      value,
    });

    return json({
      provider: 'ollama',
      selectedModel: value,
      models: await listOllamaModels(),
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not save the local model.',
      },
      { status: 503 },
    );
  }
}
