export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS voice_events (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS memory_metadata (memory_id INTEGER PRIMARY KEY REFERENCES memories(id), scope TEXT NOT NULL DEFAULT 'global', project_id INTEGER REFERENCES project_folders(id), pinned INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS memory_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'global', project_id INTEGER REFERENCES project_folders(id), status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS memory_summaries (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER REFERENCES project_folders(id), thread_id INTEGER REFERENCES chat_threads(id), summary TEXT NOT NULL, through_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS conversation_scope (message_id INTEGER PRIMARY KEY REFERENCES conversation_messages(id), thread_id INTEGER REFERENCES chat_threads(id))`,
  `CREATE INDEX IF NOT EXISTS idx_conversation_scope_thread ON conversation_scope(thread_id, message_id)`,
  `CREATE TABLE IF NOT EXISTS integration_auth_states (integration_id TEXT PRIMARY KEY REFERENCES integrations(id), stage TEXT NOT NULL DEFAULT 'Not connected', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    lane TEXT NOT NULL CHECK (lane IN ('Today', 'This week', 'Waiting', 'Ideas')),
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS knowledge_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    tag TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS conversation_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    model TEXT,
    provider TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS email_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Needs review', 'Ready')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS owner_account (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS approved_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    approved INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_token_hash TEXT NOT NULL UNIQUE,
    device_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES approved_devices(device_id)
  )`,
  `CREATE TABLE IF NOT EXISTS integrations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Not connected', 'Ready to connect', 'Connected')),
    scopes TEXT NOT NULL,
    notes TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS agent_backends (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Profiled', 'Ready to install', 'Installed', 'Connected', 'Disabled')),
    best_for TEXT NOT NULL,
    source_url TEXT NOT NULL,
    notes TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS project_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    summary TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS chat_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES project_folders(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_lane_done ON tasks (lane, done)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_notes_tag ON knowledge_notes (tag)`,
  `CREATE INDEX IF NOT EXISTS idx_conversation_messages_created_at ON conversation_messages (created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_conversation_messages_role ON conversation_messages (role)`,
  `CREATE INDEX IF NOT EXISTS idx_email_drafts_status ON email_drafts (status)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions (expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_integrations_status ON integrations (status)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_backends_status ON agent_backends (status)`,
  `CREATE INDEX IF NOT EXISTS idx_chat_threads_project_id ON chat_threads (project_id)`,
];

export const seedStatements = [
  {
    sql: `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`,
    params: ['permission_mode', 'Draft only'],
  },
  {
    sql: `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`,
    params: [
      'owner_policy',
      'Owner-only access until explicit invitations are added.',
    ],
  },
  {
    sql: `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`,
    params: ['model_provider', 'ollama'],
  },
  {
    sql: `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`,
    params: ['local_model', 'qwen3:8b'],
  },
  {
    sql: `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`,
    params: [
      'personality',
      'Friend-like, calm, conversational, loyal, lightly playful, and reassuring. Talk like a close capable friend, not a corporate assistant. Answer with useful grounded thoughts and keep the conversation moving naturally. Avoid emojis unless the user uses them first.',
    ],
  },
  {
    sql: `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`,
    params: ['communication_style', 'Companion'],
  },
  {
    sql: `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`,
    params: [
      'context_policy',
      'Keep the main chat light. Create or suggest project folders and fresh chats when work becomes a distinct topic, long-running project, or separate context.',
    ],
  },
  {
    sql: `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`,
    params: [
      'preferred_jarvis_stack',
      'Jared Rhod fullstack-agent: AI Memory Vault, Backtalk voice, AI Visualizer face, and Barehands.',
    ],
  },
  {
    sql: `UPDATE app_settings
      SET value = ?
      WHERE key = ? AND value = ?`,
    params: ['qwen3:8b', 'local_model', 'llama3.2'],
  },
  {
    sql: `INSERT INTO tasks (title, lane, done)
      SELECT ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM tasks)`,
    params: [
      'Decide the first business workflow Javis should learn',
      'Today',
      0,
    ],
  },
  {
    sql: `INSERT INTO tasks (title, lane, done)
      SELECT ?, ?, ?
      WHERE (SELECT COUNT(*) FROM tasks) = 1`,
    params: [
      'Collect current business documents into the knowledge base',
      'This week',
      0,
    ],
  },
  {
    sql: `INSERT INTO tasks (title, lane, done)
      SELECT ?, ?, ?
      WHERE (SELECT COUNT(*) FROM tasks) = 2`,
    params: ['Confirm which email account to connect first', 'Waiting', 0],
  },
  {
    sql: `INSERT INTO tasks (title, lane, done)
      SELECT ?, ?, ?
      WHERE (SELECT COUNT(*) FROM tasks) = 3`,
    params: [
      'Add voice input after the command center feels useful',
      'Ideas',
      0,
    ],
  },
  {
    sql: `INSERT INTO memories (label, value)
      SELECT ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM memories)`,
    params: [
      'Assistant tone',
      'Friend-like, calm, conversational, lightly playful, and reassuring. Be proactive and grounded. Use natural I/we language. Draft emails before sending.',
    ],
  },
  {
    sql: `INSERT INTO memories (label, value)
      SELECT ?, ?
      WHERE (SELECT COUNT(*) FROM memories) = 1`,
    params: [
      'Operating rule',
      'Ask before sending, deleting, purchasing, or changing account data.',
    ],
  },
  {
    sql: `INSERT INTO memories (label, value)
      SELECT ?, ?
      WHERE (SELECT COUNT(*) FROM memories) = 2`,
    params: [
      'Access rule',
      'Only approved users and devices should access Javis.',
    ],
  },
  {
    sql: `INSERT INTO knowledge_notes (title, body, tag)
      SELECT ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM knowledge_notes)`,
    params: [
      'Business overview',
      'Store the core offer, customers, prices, links, and current priorities here.',
      'Business',
    ],
  },
  {
    sql: `INSERT INTO knowledge_notes (title, body, tag)
      SELECT ?, ?, ?
      WHERE (SELECT COUNT(*) FROM knowledge_notes) = 1`,
    params: [
      'Client follow-up pattern',
      'When a client waits more than two working days, Javis should surface it in the briefing.',
      'Workflow',
    ],
  },
  {
    sql: `INSERT INTO email_drafts (recipient, subject, body, status)
      SELECT ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM email_drafts)`,
    params: [
      'New lead',
      'Thanks for reaching out',
      'Thanks for reaching out. I can help with that, and I have a couple of quick questions so I can point you in the right direction.',
      'Needs review',
    ],
  },
  {
    sql: `INSERT OR IGNORE INTO integrations (id, name, category, status, scopes, notes)
      VALUES (?, ?, ?, ?, ?, ?)`,
    params: [
      'gmail',
      'Gmail',
      'Email',
      'Not connected',
      'Read inbox, summarize threads, create drafts. Sending will require approval.',
      'Use first for email summaries, follow-ups, and reply drafting.',
    ],
  },
  {
    sql: `INSERT OR IGNORE INTO integrations (id, name, category, status, scopes, notes)
      VALUES (?, ?, ?, ?, ?, ?)`,
    params: [
      'google',
      'Google Workspace',
      'Productivity',
      'Not connected',
      'Calendar, Drive, Docs, and Sheets access by explicit scope.',
      'Use for daily briefings, document search, and business files.',
    ],
  },
  {
    sql: `INSERT OR IGNORE INTO integrations (id, name, category, status, scopes, notes)
      VALUES (?, ?, ?, ?, ?, ?)`,
    params: [
      'facebook',
      'Facebook',
      'Social',
      'Not connected',
      'Read pages/messages and draft replies only after account authorization.',
      'Useful later for business page monitoring and customer messages.',
    ],
  },
  {
    sql: `INSERT OR IGNORE INTO integrations (id, name, category, status, scopes, notes)
      VALUES (?, ?, ?, ?, ?, ?)`,
    params: [
      'instagram',
      'Instagram',
      'Social',
      'Not connected',
      'Read messages/comments and draft responses only after account authorization.',
      'Useful later for social inbox and content follow-ups.',
    ],
  },
  {
    sql: `INSERT OR IGNORE INTO integrations (id, name, category, status, scopes, notes)
      VALUES (?, ?, ?, ?, ?, ?)`,
    params: [
      'facebook-ads',
      'Meta Ads',
      'Business',
      'Not connected',
      'Read campaign metrics first. Budget changes must require approval.',
      'Future business analytics and campaign monitoring.',
    ],
  },
  {
    sql: `INSERT OR IGNORE INTO agent_backends (id, name, category, status, best_for, source_url, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params: [
      'jared-fullstack-agent',
      'Jared Rhod fullstack-agent',
      'Preferred Jarvis stack',
      'Installed',
      'Codex-native adaptation of AI Memory Vault, AI Visualizer face, Barehands, and Backtalk reference files.',
      'https://github.com/jaredrhod/fullstack-agent',
      'Installed at ~/my-agent as a Codex-native stack. Text-to-Codex and face/hands bridge are working; full push-to-talk speech-to-text replacement for Backtalk is next.',
    ],
  },
  {
    sql: `UPDATE agent_backends
      SET status = ?, best_for = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    params: [
      'Installed',
      'Codex-native adaptation of AI Memory Vault, AI Visualizer face, Barehands, and Backtalk reference files.',
      'Installed at ~/my-agent as a Codex-native stack. Text-to-Codex and face/hands bridge are working; full push-to-talk speech-to-text replacement for Backtalk is next.',
      'jared-fullstack-agent',
    ],
  },
  {
    sql: `INSERT OR IGNORE INTO agent_backends (id, name, category, status, best_for, source_url, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params: [
      'jared-ai-memory-vault',
      'Jared Rhod AI Memory Vault',
      'Memory system',
      'Profiled',
      'Plain-text/Markdown vault memory, AI priming, startup index, daily notes, active priorities, and one-source-of-truth memory discipline.',
      'https://github.com/jaredrhod/ai-memory-vault',
      'Best immediate piece to adopt into this Javis app. Current implementation uses D1 knowledge notes as the vault layer, with Markdown/Obsidian export as a later step.',
    ],
  },
  {
    sql: `INSERT OR IGNORE INTO agent_backends (id, name, category, status, best_for, source_url, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params: [
      'bionorthtech-jarvisai',
      'bionorthtech/JarvisAI',
      'Memory reference',
      'Profiled',
      'Local-first memory design: per-project semantic memory, global long-term facts, second-brain notes, document ingest, and Memory Gardener reporting.',
      'https://github.com/bionorthtech/JarvisAI',
      'Mined for memory preferences only. ChromaDB, Obsidian vault, and autonomous bots are not installed or connected.',
    ],
  },
  {
    sql: `INSERT OR IGNORE INTO agent_backends (id, name, category, status, best_for, source_url, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params: [
      'patrickkorb-jarvis',
      'patrickkorb/JARVIS',
      'Reference architecture',
      'Profiled',
      'Dispatcher/worker personal-agent architecture, tiered memory, automations, draft-first external actions, and scoped integrations.',
      'https://github.com/patrickkorb/jarvis',
      'Adopt as a blueprint for this Javis app. Do not treat as installed or connected unless explicitly integrated later.',
    ],
  },
  {
    sql: `INSERT OR IGNORE INTO agent_backends (id, name, category, status, best_for, source_url, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params: [
      'codex',
      'Codex',
      'Built-in',
      'Connected',
      'Careful repo work, product engineering, local implementation, review, and validation.',
      'https://openai.com/codex',
      'Primary builder for this Javis project. Use for direct local implementation with approval-aware guardrails.',
    ],
  },
  {
    sql: `INSERT OR IGNORE INTO agent_backends (id, name, category, status, best_for, source_url, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params: [
      'cline',
      'Cline',
      'Coding agent',
      'Profiled',
      'Broad autonomous coding, IDE/terminal work, MCP, scheduled agents, SDK workflows, and multi-agent teams.',
      'https://github.com/Cline/Cline',
      'Best first external coding-agent candidate after Codex. Needs install/runtime decision before use.',
    ],
  },
  {
    sql: `INSERT OR IGNORE INTO agent_backends (id, name, category, status, best_for, source_url, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params: [
      'aider',
      'Aider',
      'Coding agent',
      'Profiled',
      'Fast terminal pair programming, focused code edits, test loops, and git-aware changes.',
      'https://github.com/aider-ai/aider',
      'Good lightweight backend for narrow fixes and small features.',
    ],
  },
  {
    sql: `INSERT OR IGNORE INTO agent_backends (id, name, category, status, best_for, source_url, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params: [
      'openhands',
      'OpenHands / Agent Canvas',
      'Agent platform',
      'Profiled',
      'Self-hosted multi-agent control center with local, remote, Docker, and cloud backends.',
      'https://github.com/OpenHands/OpenHands',
      'Later-stage platform for coordinating multiple builders and automations.',
    ],
  },
  {
    sql: `INSERT OR IGNORE INTO agent_backends (id, name, category, status, best_for, source_url, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params: [
      'open-swe',
      'Open SWE',
      'Software factory',
      'Profiled',
      'Async issue-to-PR work from GitHub, Slack, Linear, dashboards, review, and CI monitoring.',
      'https://github.com/langchain-ai/open-swe',
      'Useful once Oakley-Rota has active repositories and a formal issue workflow.',
    ],
  },
  {
    sql: `INSERT OR IGNORE INTO agent_backends (id, name, category, status, best_for, source_url, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params: [
      'jiffy',
      'Jiffy',
      'Issue-to-PR',
      'Profiled',
      'Self-hosted GitHub, GitLab, or Gitea issue mention to pull request automation.',
      'https://github.com/Jiffy-Agnet/gateway',
      'Good when development requests should live as tracked issues.',
    ],
  },
  {
    sql: `INSERT OR IGNORE INTO agent_backends (id, name, category, status, best_for, source_url, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params: [
      'swe-agent',
      'SWE-agent',
      'Issue solver',
      'Profiled',
      'GitHub issue fixing, experiments, benchmark-like software engineering tasks, and agent evaluation.',
      'https://github.com/SWE-agent/SWE-agent',
      'Specialist/evaluation backend rather than the first Oakley-Rota production path.',
    ],
  },
  {
    sql: `INSERT INTO project_folders (name, summary, status)
      SELECT ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM project_folders)`,
    params: [
      'Javis Core',
      'The main build for Javis: communication, memory, privacy, local models, and integrations.',
      'Active',
    ],
  },
  {
    sql: `INSERT INTO chat_threads (project_id, title, summary, status)
      SELECT project_folders.id, ?, ?, ?
      FROM project_folders
      WHERE project_folders.name = ?
        AND NOT EXISTS (SELECT 1 FROM chat_threads)`,
    params: [
      'Main conversation',
      'Default thread for broad Javis planning and quick interaction.',
      'Open',
      'Javis Core',
    ],
  },
];
