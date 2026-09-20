import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { schemaStatements } from '../db/schema.ts';
import {
  saveConversationTurn,
  getConversationMemoryContext,
} from '../lib/server/conversation-memory.ts';
import {
  localEndpoint,
  spokenText,
  PlaybackQueue,
  defaultVoiceSettings,
} from '../lib/voice/providers.ts';
function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const sql of schemaStatements) sqlite.exec(sql);
  return {
    sqlite,
    prepare(sql) {
      let args = [];
      return {
        bind(...values) {
          args = values;
          return this;
        },
        async run() {
          const r = sqlite.prepare(sql).run(...args);
          return { meta: { last_row_id: Number(r.lastInsertRowid) } };
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...args) };
        },
        async first() {
          return sqlite.prepare(sql).get(...args);
        },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.run());
        sqlite.exec('COMMIT');
        return result;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
test('additive schema can run twice and preserves existing data', () => {
  const db = database();
  db.sqlite.exec(
    "INSERT INTO memories(label,value) VALUES('Owner','Existing fact')",
  );
  for (const sql of schemaStatements) db.sqlite.exec(sql);
  assert.equal(
    db.sqlite.prepare('SELECT value FROM memories').get().value,
    'Existing fact',
  );
  db.sqlite.close();
});
test('durable turns and summaries remain isolated by chat channel', async () => {
  const db = database();
  db.sqlite.exec(
    "INSERT INTO project_folders(id,name,summary) VALUES(1,'A','A'); INSERT INTO chat_threads(id,project_id,title,summary) VALUES(1,1,'One',''),(2,1,'Two','')",
  );
  for (const [threadId, prompt] of [
    [null, 'Main channel fact'],
    [1, 'Project channel alpha'],
    [2, 'Separate channel beta'],
  ])
    await saveConversationTurn({
      db,
      prompt,
      answer: 'Acknowledged',
      model: 'test',
      provider: 'test',
      threadId,
    });
  db.sqlite.exec(
    "INSERT INTO memory_summaries(thread_id,project_id,summary,through_id) VALUES(1,1,'Saved decision alpha',4)",
  );
  const context = await getConversationMemoryContext(db, 'Continue', 1);
  assert.match(context, /alpha/);
  assert.doesNotMatch(context, /Main channel fact|Separate channel beta/);
  const main = await getConversationMemoryContext(db, 'Continue');
  assert.match(main, /Main channel fact/);
  assert.doesNotMatch(main, /alpha|beta/);
  db.sqlite.close();
});
test('local speech endpoint rejects remote destinations and embedded credentials', () => {
  for (const value of [
    'https://example.com/speech',
    'file:///tmp/voice',
    'http://user:pass@localhost:7860',
    'http://localhost.evil.test',
    'http://192.168.1.20',
  ])
    assert.throws(() => localEndpoint(value));
  assert.equal(
    localEndpoint('http://127.0.0.1:7860/v1/audio/speech'),
    'http://127.0.0.1:7860/v1/audio/speech',
  );
});
test('spoken reply removes code and links while preserving readable sentences', () => {
  const output = spokenText(
    '**Hello.** See [the report](https://example.com). ```js\nsecretCode()\n``` We can continue.',
  );
  assert.match(output, /Hello/);
  assert.doesNotMatch(output, /secretCode|https:|\*\*/);
  assert.ok(spokenText('Long '.repeat(500)).length <= 650);
});
test('local voice failure falls back; interruption cancels pending speech', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalSpeech = globalThis.speechSynthesis;
  const originalUtterance = globalThis.SpeechSynthesisUtterance;
  const calls = [];
  globalThis.window = { speechSynthesis: {} };
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  globalThis.speechSynthesis = {
    getVoices: () => [],
    speak: (u) => {
      calls.push(u.text);
      queueMicrotask(() => u.onend());
    },
    cancel: () => {},
  };
  globalThis.fetch = async () => {
    throw new Error('offline');
  };
  try {
    const queue = new PlaybackQueue();
    let fallbacks = 0;
    await queue.enqueue(
      'First',
      { ...defaultVoiceSettings, provider: 'kokoro' },
      () => fallbacks++,
    );
    assert.equal(fallbacks, 1);
    assert.deepEqual(calls, ['First']);
    const pending = queue.enqueue(
      'Must not speak',
      defaultVoiceSettings,
      () => {},
    );
    queue.stop();
    await pending;
    assert.deepEqual(calls, ['First']);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    globalThis.speechSynthesis = originalSpeech;
    globalThis.SpeechSynthesisUtterance = originalUtterance;
  }
});

test('voice installation preserves owner preferences and runs only once', async () => {
  const { jarvisVoiceMigration } = await import('../db/voice-migration.ts');
  const db = database();
  db.sqlite
    .prepare('INSERT INTO app_settings(key,value) VALUES(?,?)')
    .run(
      'voice_v2',
      JSON.stringify({
        ...defaultVoiceSettings,
        provider: 'browser',
        voice: 'Previous voice',
        speed: 1.2,
        volume: 0.4,
        browserRecognition: false,
      }),
    );
  await db.batch(jarvisVoiceMigration.map((sql) => db.prepare(sql)));
  const installed = JSON.parse(
    db.sqlite
      .prepare("SELECT value FROM app_settings WHERE key='voice_v2'")
      .get().value,
  );
  assert.equal(installed.voice, 'jarvis-high');
  assert.equal(installed.provider, 'piper');
  assert.equal(installed.volume, 0.4);
  assert.equal(installed.speed, 1.2);
  assert.equal(installed.browserRecognition, false);
  assert.equal(installed.autoSpeak, true);
  db.sqlite
    .prepare("UPDATE app_settings SET value=? WHERE key='voice_v2'")
    .run(
      JSON.stringify({ ...installed, provider: 'browser', autoSpeak: false }),
    );
  await db.batch(jarvisVoiceMigration.map((sql) => db.prepare(sql)));
  const preserved = JSON.parse(
    db.sqlite
      .prepare("SELECT value FROM app_settings WHERE key='voice_v2'")
      .get().value,
  );
  assert.equal(preserved.provider, 'browser');
  assert.equal(preserved.autoSpeak, false);
  assert.equal(
    db.sqlite
      .prepare(
        "SELECT count(*) AS n FROM audit_log WHERE action='voice.install'",
      )
      .get().n,
    1,
  );
  db.sqlite.close();
});
