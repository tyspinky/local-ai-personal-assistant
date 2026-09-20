import { NextRequest, NextResponse } from 'next/server';

import { requireOwner } from '@/lib/server/auth';
import { audit, listState } from '@/lib/server/javis-db';

function json(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function toolIdFromName(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `custom-${slug || 'tool'}-${suffix}`;
}

export async function GET() {
  try {
    const auth = await requireOwner();
    if (!auth.ok) return json({ error: auth.message }, { status: auth.status });
    const db = auth.db;
    return json(await listState(db));
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : 'Unknown backend error',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwner();
    if (!auth.ok) return json({ error: auth.message }, { status: auth.status });
    const db = auth.db;
    const body = (await request.json()) as Record<string, unknown>;

    if (body.type === 'task.create') {
      const title = (typeof body.title === 'string' ? body.title : '').trim();
      if (!title)
        return json({ error: 'Task title is required.' }, { status: 400 });
      const result = await db
        .prepare('INSERT INTO tasks (title, lane, done) VALUES (?, ?, 0)')
        .bind(title, 'Today')
        .run();
      await audit(db, 'task.create', 'task', String(result.meta.last_row_id), {
        title,
      });
      return json(await listState(db), { status: 201 });
    }

    if (body.type === 'task.toggle') {
      const id = Number(body.id);
      const done = body.done === true ? 1 : 0;
      await db
        .prepare(
          `UPDATE tasks
           SET done = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(done, id)
        .run();
      await audit(db, 'task.toggle', 'task', String(id), {
        done: Boolean(done),
      });
      return json(await listState(db));
    }

    if (body.type === 'memory.create') {
      const value = (typeof body.value === 'string' ? body.value : '').trim();
      if (!value)
        return json({ error: 'Memory value is required.' }, { status: 400 });
      const result = await db
        .prepare('INSERT INTO memories (label, value) VALUES (?, ?)')
        .bind('New memory', value)
        .run();
      await audit(
        db,
        'memory.create',
        'memory',
        String(result.meta.last_row_id),
        {
          value,
        },
      );
      return json(await listState(db), { status: 201 });
    }

    if (
      body.type === 'knowledge.create' ||
      body.type === 'conversation.capture'
    ) {
      const noteBody = (typeof body.body === 'string' ? body.body : '').trim();
      if (!noteBody)
        return json({ error: 'Note body is required.' }, { status: 400 });
      const title =
        (typeof body.title === 'string' ? body.title : '').trim() ||
        noteBody.split('\n')[0].slice(0, 42);
      const tag =
        body.type === 'conversation.capture' ? 'Conversation' : 'Note';
      const result = await db
        .prepare(
          'INSERT INTO knowledge_notes (title, body, tag) VALUES (?, ?, ?)',
        )
        .bind(title || 'Untitled note', noteBody, tag)
        .run();
      await audit(
        db,
        body.type === 'conversation.capture'
          ? 'conversation.capture'
          : 'knowledge.create',
        'knowledge_note',
        String(result.meta.last_row_id),
        { title, tag },
      );
      return json(await listState(db), { status: 201 });
    }

    if (body.type === 'draft.create') {
      const draftBody = (typeof body.body === 'string' ? body.body : '').trim();
      if (!draftBody)
        return json({ error: 'Draft body is required.' }, { status: 400 });
      const subject = draftBody.split('\n')[0].slice(0, 36) || 'New draft';
      const result = await db
        .prepare(
          `INSERT INTO email_drafts (recipient, subject, body, status)
           VALUES (?, ?, ?, ?)`,
        )
        .bind('Manual review', subject, draftBody, 'Needs review')
        .run();
      await audit(
        db,
        'draft.create',
        'email_draft',
        String(result.meta.last_row_id),
        {
          subject,
        },
      );
      return json(await listState(db), { status: 201 });
    }

    if (body.type === 'draft.ready') {
      const id = Number(body.id);
      await db
        .prepare(
          "UPDATE email_drafts SET status='Ready',updated_at=CURRENT_TIMESTAMP WHERE id=?",
        )
        .bind(id)
        .run();
      await audit(db, 'draft.approve', 'email_draft', String(id), {
        externalAction: false,
      });
      return json(await listState(db));
    }

    if (body.type === 'draft.delete') {
      const id = Number(body.id);
      await db.prepare('DELETE FROM email_drafts WHERE id = ?').bind(id).run();
      await audit(db, 'draft.delete', 'email_draft', String(id), {});
      return json(await listState(db));
    }

    if (body.type === 'setting.permission') {
      const value = (typeof body.value === 'string' ? body.value : '').trim();
      await db
        .prepare(
          `INSERT INTO app_settings (key, value, updated_at)
           VALUES ('permission_mode', ?, CURRENT_TIMESTAMP)
           ON CONFLICT(key)
           DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(value)
        .run();
      await audit(db, 'setting.permission', 'setting', 'permission_mode', {
        value,
      });
      return json(await listState(db));
    }

    if (body.type === 'setting.local_model') {
      const value = (typeof body.value === 'string' ? body.value : '').trim();
      if (!value)
        return json({ error: 'Model name is required.' }, { status: 400 });
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
      return json(await listState(db));
    }

    if (body.type === 'setting.communication_style') {
      const value = (typeof body.value === 'string' ? body.value : '').trim();
      if (!value)
        return json(
          { error: 'Communication style is required.' },
          { status: 400 },
        );
      await db
        .prepare(
          `INSERT INTO app_settings (key, value, updated_at)
           VALUES ('communication_style', ?, CURRENT_TIMESTAMP)
           ON CONFLICT(key)
           DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(value)
        .run();
      await audit(
        db,
        'setting.communication_style',
        'setting',
        'communication_style',
        {
          value,
        },
      );
      return json(await listState(db));
    }

    if (body.type === 'integration.prepare') {
      const id = (typeof body.id === 'string' ? body.id : '').trim();
      if (!id)
        return json({ error: 'Integration id is required.' }, { status: 400 });
      await db
        .prepare(
          `UPDATE integrations
           SET status = 'Ready to connect', updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(id)
        .run();
      await db
        .prepare(
          "INSERT INTO integration_auth_states(integration_id,stage) VALUES(?,'Needs OAuth/API keys') ON CONFLICT(integration_id) DO UPDATE SET stage=excluded.stage,updated_at=CURRENT_TIMESTAMP",
        )
        .bind(id)
        .run();
      await audit(db, 'integration.prepare', 'integration', id, {
        status: 'Ready to connect',
      });
      return json(await listState(db));
    }

    if (body.type === 'integration.create') {
      const name = (typeof body.name === 'string' ? body.name : '').trim();
      const category =
        (typeof body.category === 'string' ? body.category : '').trim() ||
        'Tool';
      const scopes =
        (typeof body.scopes === 'string' ? body.scopes : '').trim() ||
        'Access level not specified yet. Keep this read/draft first.';
      const notes =
        (typeof body.notes === 'string' ? body.notes : '').trim() ||
        'Custom tool added by the owner. Prepare connection when credentials or OAuth are ready.';
      if (!name)
        return json({ error: 'Tool name is required.' }, { status: 400 });
      if (name.length > 80 || category.length > 40)
        return json(
          { error: 'Tool name or category is too long.' },
          { status: 400 },
        );
      const id = toolIdFromName(name);
      await db
        .prepare(
          `INSERT INTO integrations (id, name, category, status, scopes, notes)
           VALUES (?, ?, ?, 'Not connected', ?, ?)`,
        )
        .bind(id, name, category, scopes.slice(0, 240), notes.slice(0, 320))
        .run();
      await db
        .prepare(
          "INSERT INTO integration_auth_states(integration_id,stage) VALUES(?,'Not connected')",
        )
        .bind(id)
        .run();
      await audit(db, 'integration.create', 'integration', id, {
        name,
        category,
      });
      return json(await listState(db), { status: 201 });
    }

    if (body.type === 'project.create') {
      const name = (typeof body.name === 'string' ? body.name : '').trim();
      const summary =
        (typeof body.summary === 'string' ? body.summary : '').trim() ||
        'A focused workspace Javis can use to keep this context tidy.';
      if (!name)
        return json({ error: 'Project name is required.' }, { status: 400 });
      const result = await db
        .prepare(
          'INSERT INTO project_folders (name, summary, status) VALUES (?, ?, ?)',
        )
        .bind(name, summary, 'Active')
        .run();
      await audit(
        db,
        'project.create',
        'project_folder',
        String(result.meta.last_row_id),
        {
          name,
        },
      );
      return json(await listState(db), { status: 201 });
    }

    if (body.type === 'chat_thread.create') {
      const title = (typeof body.title === 'string' ? body.title : '').trim();
      const projectId = body.projectId ? Number(body.projectId) : null;
      const summary =
        (typeof body.summary === 'string' ? body.summary : '').trim() ||
        'A fresh internal chat for keeping this topic separate.';
      if (!title)
        return json({ error: 'Chat title is required.' }, { status: 400 });
      const result = await db
        .prepare(
          'INSERT INTO chat_threads (project_id, title, summary, status) VALUES (?, ?, ?, ?)',
        )
        .bind(projectId, title, summary, 'Open')
        .run();
      await audit(
        db,
        'chat_thread.create',
        'chat_thread',
        String(result.meta.last_row_id),
        {
          title,
          projectId,
        },
      );
      return json(await listState(db), { status: 201 });
    }

    return json({ error: 'Unknown Javis action.' }, { status: 400 });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : 'Unknown backend error',
      },
      { status: 500 },
    );
  }
}
