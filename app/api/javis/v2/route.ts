import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server/auth';
import { audit } from '@/lib/server/javis-db';
import { defaultVoiceSettings, localEndpoint } from '@/lib/voice/providers';
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET() {
  const auth = await requireOwner();
  if (!auth.ok) return json({ error: auth.message }, auth.status);
  const [voice, reviews, summaries, devices] = await Promise.all([
    auth.db
      .prepare("SELECT value FROM app_settings WHERE key='voice_v2'")
      .first<{ value: string }>(),
    auth.db
      .prepare(
        "SELECT * FROM memory_reviews WHERE status='pending' ORDER BY id DESC LIMIT 50",
      )
      .all(),
    auth.db
      .prepare('SELECT * FROM memory_summaries ORDER BY id DESC LIMIT 20')
      .all(),
    auth.db
      .prepare(
        'SELECT d.label, d.device_id, s.expires_at, s.last_seen_at FROM auth_sessions s JOIN approved_devices d ON d.device_id=s.device_id WHERE s.expires_at>CURRENT_TIMESTAMP AND d.approved=1',
      )
      .all(),
  ]);
  return json({
    voice: voice ? JSON.parse(voice.value) : defaultVoiceSettings,
    reviews: reviews.results,
    summaries: summaries.results,
    devices: devices.results.map((d) => ({
      ...d,
      current: d.device_id === auth.deviceId,
      device_id: undefined,
    })),
  });
}
export async function POST(request: NextRequest) {
  const auth = await requireOwner();
  if (!auth.ok) return json({ error: auth.message }, auth.status);
  const db = auth.db;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.type === 'voice.settings') {
      const s = body.settings as Record<string, unknown>;
      if (
        !s ||
        !['browser', 'kokoro', 'piper'].includes(String(s.provider)) ||
        typeof s.voice !== 'string' ||
        s.voice.length > 200 ||
        typeof s.autoSpeak !== 'boolean' ||
        typeof s.browserRecognition !== 'boolean'
      )
        return json({ error: 'Invalid voice settings' }, 400);
      for (const key of ['speed', 'pitch', 'volume'])
        if (
          typeof s[key] !== 'number' ||
          !Number.isFinite(s[key]) ||
          s[key] < (key === 'volume' ? 0 : 0.5) ||
          s[key] > (key === 'volume' ? 1 : 2)
        )
          return json({ error: 'Invalid voice range' }, 400);
      const settings = {
        provider: s.provider,
        endpoint: localEndpoint(String(s.endpoint)),
        voice: s.voice,
        speed: s.speed,
        pitch: s.pitch,
        volume: s.volume,
        autoSpeak: s.autoSpeak,
        browserRecognition: s.browserRecognition,
      };
      await db
        .prepare(
          "INSERT INTO app_settings(key,value) VALUES('voice_v2',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP",
        )
        .bind(JSON.stringify(settings))
        .run();
      await audit(db, 'voice.settings', 'setting', 'voice_v2', {
        provider: s.provider,
      });
    } else if (body.type === 'voice.event') {
      if (!['listen', 'interrupt', 'command'].includes(String(body.action)))
        return json({ error: 'Invalid voice event' }, 400);
      await db
        .prepare('INSERT INTO voice_events(action) VALUES(?)')
        .bind(String(body.action))
        .run();
      await audit(db, 'voice.' + body.action, 'voice', null, {});
    } else if (body.type === 'memory.update') {
      const id = Number(body.id);
      const value = (typeof body.value === 'string' ? body.value : '').trim();
      const scope = typeof body.scope === 'string' ? body.scope : 'global';
      if (
        !Number.isInteger(id) ||
        !value ||
        value.length > 12000 ||
        !['global', 'business', 'project'].includes(scope)
      )
        return json({ error: 'Invalid memory' }, 400);
      const projectId = scope === 'project' ? Number(body.projectId) : null;
      if (
        projectId !== null &&
        !(await db
          .prepare('SELECT id FROM project_folders WHERE id=?')
          .bind(projectId)
          .first())
      )
        return json({ error: 'Select an existing project' }, 400);
      await db.batch([
        db
          .prepare(
            'UPDATE memories SET value=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
          )
          .bind(value, id),
        db
          .prepare(
            'INSERT INTO memory_metadata(memory_id,scope,project_id,pinned,archived) VALUES(?,?,?,?,?) ON CONFLICT(memory_id) DO UPDATE SET scope=excluded.scope,project_id=excluded.project_id,pinned=excluded.pinned,archived=excluded.archived',
          )
          .bind(
            id,
            scope,
            projectId,
            body.pinned ? 1 : 0,
            body.archived ? 1 : 0,
          ),
      ]);
      await audit(db, 'memory.update', 'memory', String(id), { scope });
    } else if (body.type === 'memory.delete') {
      await db.batch([
        db
          .prepare('DELETE FROM memory_metadata WHERE memory_id=?')
          .bind(Number(body.id)),
        db.prepare('DELETE FROM memories WHERE id=?').bind(Number(body.id)),
      ]);
      await audit(db, 'memory.delete', 'memory', String(body.id), {});
    } else if (body.type === 'memory.review') {
      const row = await db
        .prepare("SELECT * FROM memory_reviews WHERE id=? AND status='pending'")
        .bind(Number(body.id))
        .first<{ value: string; scope: string; project_id: number | null }>();
      if (!row) return json({ error: 'Review is no longer pending' }, 404);
      if (body.approve === true) {
        await db.batch([
          db
            .prepare(
              "INSERT INTO memories(label,value) SELECT 'Reviewed memory',value FROM memory_reviews WHERE id=? AND status='pending'",
            )
            .bind(Number(body.id)),
          db
            .prepare(
              "INSERT INTO memory_metadata(memory_id,scope,project_id) SELECT last_insert_rowid(),scope,project_id FROM memory_reviews WHERE id=? AND status='pending'",
            )
            .bind(Number(body.id)),
          db
            .prepare("UPDATE memory_reviews SET status='approved' WHERE id=?")
            .bind(Number(body.id)),
        ]);
      } else
        await db
          .prepare(
            "UPDATE memory_reviews SET status='dismissed' WHERE id=? AND status='pending'",
          )
          .bind(Number(body.id))
          .run();
      await audit(db, 'memory.review', 'memory', String(body.id), {
        approved: body.approve === true,
      });
    } else return json({ error: 'Unknown V2 action' }, 400);
    return json({ ok: true });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'V2 action failed' },
      400,
    );
  }
}
