import { env } from 'cloudflare:workers';

import { schemaStatements, seedStatements } from '@/db/schema';
import { jarvisVoiceMigration } from '@/db/voice-migration';

type D1Row = Record<string, unknown>;

let initialized = false;

export async function getDb() {
  const db = (env as { DB?: D1Database }).DB;
  if (!db) {
    throw new Error('Javis database binding is not configured.');
  }

  if (!initialized) {
    for (const statement of schemaStatements) {
      await db.prepare(statement).run();
    }
    for (const seed of seedStatements) {
      await db
        .prepare(seed.sql)
        .bind(...seed.params)
        .run();
    }
    await db.batch(jarvisVoiceMigration.map((sql) => db.prepare(sql)));
    await db.prepare('PRAGMA optimize').run();
    initialized = true;
  }

  return db;
}

export async function audit(
  db: D1Database,
  action: string,
  targetType: string,
  targetId: string | null,
  detail: unknown,
) {
  await db
    .prepare(
      `INSERT INTO audit_log (actor, action, target_type, target_id, detail)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind('owner', action, targetType, targetId, JSON.stringify(detail))
    .run();
}

export async function listState(db: D1Database) {
  const [
    settings,
    tasks,
    memories,
    knowledge,
    drafts,
    integrations,
    agentBackends,
    projectFolders,
    chatThreads,
    auditLog,
  ] = await Promise.all([
    db.prepare('SELECT key, value FROM app_settings ORDER BY key').all<D1Row>(),
    db
      .prepare(
        `SELECT id, title, lane, done
           FROM tasks
           ORDER BY done ASC, id DESC`,
      )
      .all<D1Row>(),
    db
      .prepare(
        `SELECT m.id, m.label, m.value, COALESCE(x.scope, 'global') as scope, x.project_id, COALESCE(x.pinned, 0) as pinned, COALESCE(x.archived, 0) as archived
           FROM memories m LEFT JOIN memory_metadata x ON x.memory_id = m.id
           ORDER BY pinned DESC, m.id DESC`,
      )
      .all<D1Row>(),
    db
      .prepare(
        `SELECT id, title, body, tag
           FROM knowledge_notes
           ORDER BY id DESC`,
      )
      .all<D1Row>(),
    db
      .prepare(
        `SELECT id, recipient as 'to', subject, body, status
           FROM email_drafts
           ORDER BY id DESC`,
      )
      .all<D1Row>(),
    db
      .prepare(
        `SELECT id, name, category, status, scopes, notes, updated_at
           FROM integrations
           ORDER BY category, name`,
      )
      .all<D1Row>(),
    db
      .prepare(
        `SELECT id, name, category, status, best_for, source_url, notes, updated_at
           FROM agent_backends
           ORDER BY category, name`,
      )
      .all<D1Row>(),
    db
      .prepare(
        `SELECT id, name, summary, status, created_at, updated_at
           FROM project_folders
           ORDER BY updated_at DESC, id DESC`,
      )
      .all<D1Row>(),
    db
      .prepare(
        `SELECT chat_threads.id, chat_threads.project_id, project_folders.name as project_name,
                  chat_threads.title, chat_threads.summary, chat_threads.status,
                  chat_threads.created_at, chat_threads.updated_at
           FROM chat_threads
           LEFT JOIN project_folders ON project_folders.id = chat_threads.project_id
           ORDER BY chat_threads.updated_at DESC, chat_threads.id DESC`,
      )
      .all<D1Row>(),
    db
      .prepare(
        `SELECT id, action, target_type, target_id, detail, created_at
           FROM audit_log
           ORDER BY id DESC
           LIMIT 8`,
      )
      .all<D1Row>(),
  ]);

  return {
    settings: Object.fromEntries(
      settings.results.map((row) => [String(row.key), String(row.value)]),
    ),
    tasks: tasks.results.map((task) => ({
      ...task,
      done: Boolean(task.done),
    })),
    memory: memories.results,
    knowledge: knowledge.results,
    drafts: drafts.results,
    integrations: integrations.results,
    agentBackends: agentBackends.results,
    projectFolders: projectFolders.results,
    chatThreads: chatThreads.results,
    auditLog: auditLog.results,
  };
}
