'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { JavisCore, CoreOrb } from '@/components/javis/core';
import { MemoryTools } from '@/components/javis/memory-tools';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Archive,
  Bell,
  Bot,
  Brain,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Circle,
  FileText,
  LockKeyhole,
  MessagesSquare,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  SquarePen,
  Trash2,
  Wrench,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type Task = {
  id: number;
  title: string;
  lane: 'Today' | 'This week' | 'Waiting' | 'Ideas';
  done: boolean;
};

type Memory = {
  id: number;
  label: string;
  value: string;
};

type Knowledge = {
  id: number;
  title: string;
  body: string;
  tag: string;
};

type Draft = {
  id: number;
  to: string;
  subject: string;
  body: string;
  status: 'Needs review' | 'Ready';
};

type Integration = {
  id: string;
  name: string;
  category: string;
  status: 'Not connected' | 'Ready to connect' | 'Connected';
  scopes: string;
  notes: string;
  updated_at: string;
};

type AgentBackend = {
  id: string;
  name: string;
  category: string;
  status:
    | 'Profiled'
    | 'Ready to install'
    | 'Installed'
    | 'Connected'
    | 'Disabled';
  best_for: string;
  source_url: string;
  notes: string;
  updated_at: string;
};

type AuditEntry = {
  id: number;
  action: string;
  target_type: string;
  target_id: string | null;
  detail: string;
  created_at: string;
};

type ProjectFolder = {
  id: number;
  name: string;
  summary: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type ChatThread = {
  id: number;
  project_id: number | null;
  project_name: string | null;
  title: string;
  summary: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type JavisState = {
  settings: {
    permission_mode?: string;
    local_model?: string;
    communication_style?: string;
    model_provider?: string;
    owner_policy?: string;
    context_policy?: string;
  };
  tasks: Task[];
  memory: Memory[];
  knowledge: Knowledge[];
  drafts: Draft[];
  integrations: Integration[];
  agentBackends: AgentBackend[];
  projectFolders: ProjectFolder[];
  chatThreads: ChatThread[];
  auditLog: AuditEntry[];
};

type OllamaModel = {
  name: string;
  sizeGb: number | null;
  modifiedAt: string | null;
};

type AuthStatusResponse = {
  setupRequired?: boolean;
  authenticated?: boolean;
  error?: string;
};

type ModelListResponse = {
  models?: OllamaModel[];
  selectedModel?: string;
  error?: string;
};

type ChatResponse = {
  answer?: string;
  provider?: string;
  model?: string;
  state?: JavisState;
  error?: string;
  hint?: string;
};

const quickPrompts = [
  'Morning check-in',
  'Help me reply warmly',
  'What needs my attention?',
  'Remember this idea',
];

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [memory, setMemory] = useState<Memory[]>([]);
  const [knowledge, setKnowledge] = useState<Knowledge[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [agentBackends, setAgentBackends] = useState<AgentBackend[]>([]);
  const [projectFolders, setProjectFolders] = useState<ProjectFolder[]>([]);
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [permission, setPermission] = useState('Draft only');
  const [communicationStyle, setCommunicationStyle] = useState('Companion');
  const [backendStatus, setBackendStatus] = useState('Connecting');
  const [modelStatus, setModelStatus] = useState('Ollama not checked');
  const [modelName, setModelName] = useState('qwen3:8b');
  const [modelOptions, setModelOptions] = useState<OllamaModel[]>([]);
  const [javisReply, setJavisReply] = useState(
    "I'm here with you. Tell me what is on your mind, what needs sorting, or what you want to get moving, and we'll take it one piece at a time.",
  );
  const [isThinking, setIsThinking] = useState(false);
  const chatInFlight = useRef(false);
  const [query, setQuery] = useState('');
  const [chat, setChat] = useState('');
  const [newTask, setNewTask] = useState('');
  const [newMemory, setNewMemory] = useState('');
  const [newNote, setNewNote] = useState('');
  const [newDraft, setNewDraft] = useState('');
  const [newToolName, setNewToolName] = useState('');
  const [newToolCategory, setNewToolCategory] = useState('Tool');
  const [newToolScopes, setNewToolScopes] = useState('');
  const [newToolNotes, setNewToolNotes] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newChatTitle, setNewChatTitle] = useState('');
  const [authStatus, setAuthStatus] = useState<
    'checking' | 'setup' | 'login' | 'authenticated'
  >('checking');
  const [displayName, setDisplayName] = useState('Owner');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('Primary MacBook');
  const [authMessage, setAuthMessage] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [voiceInput, setVoiceInput] = useState(false);
  const [sessionMemory, setSessionMemory] = useState('');
  const [activeThread, setActiveThread] = useState<number | null>(null);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [reviewDraft, setReviewDraft] = useState<Draft | null>(null);

  useEffect(() => {
    void loadAuth();
  }, []);

  async function loadAuth() {
    try {
      const response = await fetch('/api/auth/status', { cache: 'no-store' });
      const data = (await response.json()) as AuthStatusResponse;

      if (data.setupRequired) {
        setAuthStatus('setup');
        return;
      }

      if (data.authenticated) {
        setAuthStatus('authenticated');
        await loadState();
        await loadModels();
        return;
      }

      setAuthStatus('login');
    } catch {
      setAuthStatus('login');
      setAuthMessage('Auth service is not available yet.');
    }
  }

  async function submitAuth() {
    setAuthMessage('');
    const endpoint =
      authStatus === 'setup' ? '/api/auth/setup' : '/api/auth/login';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName,
        password: ownerPassword,
        deviceLabel,
      }),
    });
    const data = (await response.json()) as AuthStatusResponse;

    if (!response.ok) {
      setAuthMessage(data.error ?? 'Could not authenticate.');
      return;
    }

    setOwnerPassword('');
    setAuthStatus('authenticated');
    await loadState();
    await loadModels();
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuthStatus('login');
    setSessionMemory('');
    setChat('');
    setAuthMessage('Logged out.');
  }

  function applyState(state: JavisState) {
    setTasks(state.tasks);
    setMemory(state.memory);
    setKnowledge(state.knowledge);
    setDrafts(state.drafts);
    setIntegrations(state.integrations ?? []);
    setAgentBackends(state.agentBackends ?? []);
    setProjectFolders(state.projectFolders ?? []);
    setChatThreads(state.chatThreads ?? []);
    setAuditLog(state.auditLog);
    setPermission(state.settings.permission_mode ?? 'Draft only');
    setCommunicationStyle(state.settings.communication_style ?? 'Companion');
    setModelName(state.settings.local_model ?? 'qwen3:8b');
    setBackendStatus('Secure backend online');
  }

  async function loadState() {
    try {
      const response = await fetch('/api/javis', { cache: 'no-store' });
      if (!response.ok) throw new Error('Backend did not respond.');
      applyState((await response.json()) as JavisState);
    } catch {
      setBackendStatus('Backend unavailable — retry after reconnecting');
    }
  }

  async function commit(action: Record<string, unknown>) {
    try {
      const response = await fetch('/api/javis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
      });
      if (!response.ok) {
        setBackendStatus('Backend action failed — please retry');
        return false;
      }
      applyState((await response.json()) as JavisState);
      return true;
    } catch {
      setBackendStatus('Backend unavailable — please retry');
      return false;
    }
  }

  async function loadModels() {
    try {
      const response = await fetch('/api/javis/models', { cache: 'no-store' });
      const data = (await response.json()) as ModelListResponse;
      if (!response.ok)
        throw new Error(data.error ?? 'Model server unavailable.');
      const models = data.models ?? [];
      setModelOptions(models);
      setModelName(data.selectedModel ?? 'qwen3:8b');
      setModelStatus(`Ollama online: ${models.length} models`);
    } catch {
      setModelOptions([]);
      setModelStatus('Ollama unavailable');
    }
  }

  const openTasks = tasks.filter((task) => !task.done);
  const todayTasks = tasks.filter(
    (task) => task.lane === 'Today' && !task.done,
  );
  const waitingTasks = tasks.filter(
    (task) => task.lane === 'Waiting' && !task.done,
  );
  const jaredStack = agentBackends.find(
    (backend) => backend.id === 'jared-fullstack-agent',
  );

  const filteredKnowledge = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return knowledge;
    return knowledge.filter((item) =>
      `${item.title} ${item.body} ${item.tag}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [knowledge, query]);

  function addTask() {
    const title = newTask.trim();
    if (!title) return;
    setNewTask('');
    void commit({ type: 'task.create', title });
  }

  function addMemory() {
    const value = newMemory.trim();
    if (!value) return;
    setNewMemory('');
    void commit({ type: 'memory.create', value });
  }

  function addKnowledge() {
    const body = newNote.trim();
    if (!body) return;
    setNewNote('');
    void commit({
      type: 'knowledge.create',
      title: body.split('\n')[0].slice(0, 42) || 'Untitled note',
      body,
    });
  }

  function addDraft() {
    const body = newDraft.trim();
    if (!body) return;
    setNewDraft('');
    void commit({ type: 'draft.create', body });
  }

  async function sendChat(
    fromVoice = voiceInput,
    transcript?: string,
  ): Promise<string | undefined> {
    const request = (transcript ?? chat).trim();
    if (!request || chatInFlight.current) return;
    chatInFlight.current = true;
    setChat('');
    setIsThinking(true);
    setModelStatus('Asking local model');

    try {
      const response = await fetch('/api/javis/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: request,
          model: modelName,
          voice: fromVoice,
          threadId: activeThread,
          sessionMemory,
        }),
      });
      const data = (await response.json()) as ChatResponse;

      if (!response.ok) {
        setJavisReply(`${data.error} ${data.hint ?? ''}`.trim());
        setModelStatus('Ollama unavailable');
        return;
      }

      setJavisReply(data.answer ?? '');
      setModelStatus(`${data.provider ?? 'local'}: ${data.model ?? modelName}`);
      if (data.state) applyState(data.state);
      return data.answer;
    } catch {
      setJavisReply(
        'I could not reach the local model. Install Ollama and pull a model, then try again.',
      );
      setModelStatus('Ollama unavailable');
    } finally {
      chatInFlight.current = false;
      setIsThinking(false);
    }
  }

  function updatePermission(mode: string) {
    setPermission(mode);
    void commit({ type: 'setting.permission', value: mode });
  }

  function updateCommunicationStyle(style: string) {
    setCommunicationStyle(style);
    void commit({ type: 'setting.communication_style', value: style });
  }

  function updateModel(model: string) {
    setModelName(model);
    void fetch('/api/javis/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    }).then(() => loadState());
  }

  function prepareIntegration(id: string) {
    void commit({ type: 'integration.prepare', id });
  }

  async function addTool() {
    const name = newToolName.trim();
    if (!name) return;
    const ok = await commit({
      type: 'integration.create',
      name,
      category: newToolCategory.trim() || 'Tool',
      scopes: newToolScopes.trim(),
      notes: newToolNotes.trim(),
    });
    if (!ok) return;
    setNewToolName('');
    setNewToolCategory('Tool');
    setNewToolScopes('');
    setNewToolNotes('');
  }

  function addProjectFolder() {
    const name = newProjectName.trim();
    if (!name) return;
    setNewProjectName('');
    void commit({
      type: 'project.create',
      name,
      summary: `Workspace for ${name}.`,
    });
  }

  function addChatThread() {
    const title = newChatTitle.trim();
    if (!title) return;
    setNewChatTitle('');
    void commit({
      type: 'chat_thread.create',
      title,
      projectId: selectedProject,
      summary: `Fresh context for ${title}.`,
    });
  }

  if (authStatus !== 'authenticated') {
    const isSetup = authStatus === 'setup';
    return (
      <main className="javis-lock flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.18),transparent_30rem),linear-gradient(135deg,#07111f_0%,#101827_52%,#151414_100%)] p-4 text-slate-100">
        <div className="locked-core">
          <CoreOrb state="locked" />
        </div>
        <Card className="w-full max-w-md rounded-lg border-cyan-300/20 bg-slate-950/70 text-slate-100 shadow-2xl shadow-black/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl">
              <span className="flex size-11 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-cyan-200">
                <LockKeyhole className="size-5" />
              </span>
              {authStatus === 'checking'
                ? 'Checking access'
                : isSetup
                  ? 'Create owner access'
                  : 'Owner login'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6 text-slate-400">
              Javis is private by default. Create your owner session, and I will
              keep the dashboard, memory, tasks, and local model routes locked
              to approved access only.
            </p>
            {isSetup && (
              <label
                className="space-y-2 text-sm text-slate-300"
                htmlFor="owner-name"
              >
                <span>Owner name</span>
                <Input
                  id="owner-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="border-white/15 bg-white/[0.04] text-slate-100"
                />
              </label>
            )}
            <label
              className="space-y-2 text-sm text-slate-300"
              htmlFor="device-label"
            >
              <span>Device label</span>
              <Input
                id="device-label"
                value={deviceLabel}
                onChange={(event) => setDeviceLabel(event.target.value)}
                className="border-white/15 bg-white/[0.04] text-slate-100"
              />
            </label>
            <label
              className="space-y-2 text-sm text-slate-300"
              htmlFor="owner-password"
            >
              <span>Owner password</span>
              <Input
                id="owner-password"
                type="password"
                value={ownerPassword}
                onChange={(event) => setOwnerPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void submitAuth();
                }}
                className="border-white/15 bg-white/[0.04] text-slate-100"
              />
            </label>
            {authMessage && (
              <p className="rounded-lg border border-amber-200/20 bg-amber-200/10 p-3 text-sm text-amber-100">
                {authMessage}
              </p>
            )}
            <Button
              className="h-10 w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
              disabled={authStatus === 'checking'}
              onClick={() => void submitAuth()}
            >
              <ShieldCheck className="size-4" />
              {isSetup ? 'Create owner session' : 'Unlock Javis'}
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="javis-hud min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.16),transparent_32rem),linear-gradient(135deg,#07111f_0%,#101827_48%,#151414_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-cyan-200">
              <Brain className="size-5" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase text-cyan-200">
                JAVIS / V2.0
              </p>
              <h1 className="text-2xl font-semibold text-white">
                Private command interface
              </h1>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              {['Read only', 'Draft only', 'Ask first'].map((mode) => (
                <Button
                  key={mode}
                  size="sm"
                  variant={permission === mode ? 'default' : 'outline'}
                  className={
                    permission === mode
                      ? 'bg-cyan-300 text-slate-950 hover:bg-cyan-200'
                      : 'border-white/15 bg-white/[0.03] text-slate-200 hover:bg-white/[0.07]'
                  }
                  onClick={() => updatePermission(mode)}
                >
                  <ShieldCheck className="size-4" />
                  {mode}
                </Button>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-white/15 bg-white/[0.03] text-slate-200 hover:bg-white/[0.07]"
              onClick={() => void logout()}
            >
              <LockKeyhole className="size-4" />
              Lock
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-white/15 bg-white/[0.03] text-slate-200 hover:bg-white/[0.07]"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="size-4" />
              Settings
            </Button>
          </div>
        </header>

        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent className="integration-dialog" showCloseButton={false}>
            <div className="max-h-[86vh] w-full max-w-3xl overflow-auto rounded-lg border border-white/10 bg-slate-950 p-4 text-slate-100 shadow-2xl shadow-black/50">
              <div className="mb-4 flex items-center justify-between gap-3">
                <DialogTitle className="flex items-center gap-2 text-lg font-medium">
                  <Settings className="size-5 text-cyan-200" />
                  Javis settings
                </DialogTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-slate-300 hover:bg-white/[0.07]"
                  onClick={() => setSettingsOpen(false)}
                >
                  Close
                </Button>
              </div>
              <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
                <section className="space-y-3 rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <h3 className="text-sm font-medium text-cyan-100">
                    Connection rules
                  </h3>
                  <p className="text-sm leading-6 text-slate-400">
                    Every service starts read/draft first. Sending, posting,
                    deleting, spending, or changing accounts still needs your
                    approval.
                  </p>
                  <div className="space-y-2 text-sm text-slate-300">
                    <p>Mode: {permission}</p>
                    <p>Model: {modelName}</p>
                    <p>Style: {communicationStyle}</p>
                  </div>
                </section>
                <section className="space-y-3 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.04] p-4">
                  <div className="flex items-center gap-2">
                    <Wrench className="size-4 text-cyan-200" />
                    <h3 className="text-sm font-medium text-cyan-100">
                      Tools
                    </h3>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr]">
                    <label
                      className="space-y-2 text-sm text-slate-300"
                      htmlFor="tool-name"
                    >
                      <span>Tool name</span>
                      <Input
                        id="tool-name"
                        value={newToolName}
                        onChange={(event) =>
                          setNewToolName(event.target.value)
                        }
                        placeholder="Linear, Todoist, local script..."
                        className="border-white/15 bg-white/[0.04] text-slate-100"
                      />
                    </label>
                    <label
                      className="space-y-2 text-sm text-slate-300"
                      htmlFor="tool-category"
                    >
                      <span>Category</span>
                      <Input
                        id="tool-category"
                        value={newToolCategory}
                        onChange={(event) =>
                          setNewToolCategory(event.target.value)
                        }
                        className="border-white/15 bg-white/[0.04] text-slate-100"
                      />
                    </label>
                  </div>
                  <label
                    className="space-y-2 text-sm text-slate-300"
                    htmlFor="tool-scopes"
                  >
                    <span>Access scope</span>
                    <Input
                      id="tool-scopes"
                      value={newToolScopes}
                      onChange={(event) => setNewToolScopes(event.target.value)}
                      placeholder="Read tasks, draft updates, no external actions yet"
                      className="border-white/15 bg-white/[0.04] text-slate-100"
                    />
                  </label>
                  <label
                    className="space-y-2 text-sm text-slate-300"
                    htmlFor="tool-notes"
                  >
                    <span>Notes</span>
                    <Textarea
                      id="tool-notes"
                      value={newToolNotes}
                      onChange={(event) => setNewToolNotes(event.target.value)}
                      placeholder="What Javis should use this for"
                      className="min-h-20 border-white/15 bg-white/[0.04] text-slate-100"
                    />
                  </label>
                  <Button
                    size="sm"
                    className="bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                    disabled={!newToolName.trim()}
                    onClick={() => void addTool()}
                  >
                    <Plus className="size-4" />
                    Add tool
                  </Button>
                </section>
                <section className="space-y-3 lg:col-span-2">
                  <p className="text-xs text-slate-400">
                    Not connected → Ready to connect → Needs OAuth/API keys →
                    Connected read-only → Draft enabled → Approval-gated
                    actions. Account access is not implemented yet.
                  </p>
                  <h3 className="text-sm font-medium text-cyan-100">
                    Integrations
                  </h3>
                  {integrations.map((integration) => (
                    <div
                      key={integration.id}
                      className="rounded-lg border border-white/10 bg-white/[0.04] p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-medium text-slate-100">
                              {integration.name}
                            </h4>
                            <Badge
                              variant="outline"
                              className="border-white/15 text-slate-300"
                            >
                              {integration.category}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm leading-5 text-slate-400">
                            {integration.notes}
                          </p>
                        </div>
                        <Badge
                          className={
                            integration.status === 'Connected'
                              ? 'bg-emerald-200 text-slate-950'
                              : integration.status === 'Ready to connect'
                                ? 'bg-amber-200 text-slate-950'
                                : 'bg-slate-700 text-slate-100'
                          }
                        >
                          {integration.status}
                        </Badge>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-slate-500">
                        {integration.scopes}
                      </p>
                      <Button
                        size="sm"
                        className="mt-3 bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                        onClick={() => prepareIntegration(integration.id)}
                      >
                        <Plus className="size-4" />
                        {integration.status === 'Ready to connect'
                          ? 'Needs OAuth / API keys'
                          : 'Prepare connection'}
                      </Button>
                    </div>
                  ))}
                </section>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog
          open={reviewDraft !== null}
          onOpenChange={(open) => {
            if (!open) setReviewDraft(null);
          }}
        >
          <DialogContent className="approval-dialog">
            <DialogHeader>
              <DialogTitle>Owner review required</DialogTitle>
            </DialogHeader>
            {reviewDraft && (
              <>
                <p className="text-sm">To: {reviewDraft.to}</p>
                <strong>{reviewDraft.subject}</strong>
                <p className="whitespace-pre-wrap text-sm leading-6">
                  {reviewDraft.body}
                </p>
                <p className="text-xs text-amber-200">
                  This approves the local draft for manual use. Sending is not
                  connected.
                </p>
                <Button
                  onClick={async () => {
                    if (
                      await commit({ type: 'draft.ready', id: reviewDraft.id })
                    )
                      setReviewDraft(null);
                  }}
                >
                  Approve draft
                </Button>
                <Button variant="outline" onClick={() => setReviewDraft(null)}>
                  Keep in review
                </Button>
              </>
            )}
          </DialogContent>
        </Dialog>

        <nav className="hud-nav" aria-label="Command modules">
          <a href="#command">01 / COMMAND</a>
          <a href="#memory">02 / MEMORY</a>
          <a href="#projects">03 / PROJECTS</a>
          <a href="#drafts">04 / DRAFTS</a>
          <button onClick={() => setSettingsOpen(true)}>
            05 / INTEGRATIONS
          </button>
          <span>
            <i className="status-dot" />
            {backendStatus}
          </span>
        </nav>
        <div className="mission-strip">
          <span>
            PERSONAL OPERATIONS <b>COMMAND DECK</b>
          </span>
          <span>
            {todayTasks.length} TODAY <i>/</i> {openTasks.length} OPEN TASKS{' '}
            <i>/</i> {drafts.length} DRAFTS
          </span>
        </div>
        <section className="grid flex-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
          <aside className="space-y-4">
            <Card className="rounded-lg border-white/10 bg-white/[0.05] text-slate-100 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Bell className="size-4 text-cyan-200" />
                  Daily briefing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg bg-cyan-300/10 p-3 text-sm text-cyan-50">
                  You have {openTasks.length} open tasks, {waitingTasks.length}{' '}
                  waiting item, and {drafts.length} draft ready. Nothing too
                  wild; we can work through it steadily.
                </div>
                <ul className="space-y-2">
                  {todayTasks.map((task) => (
                    <li
                      key={task.id}
                      className="flex gap-2 text-sm text-slate-300"
                    >
                      <ChevronRight className="mt-0.5 size-4 text-cyan-200" />
                      <span>{task.title}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="rounded-lg border-white/10 bg-white/[0.05] text-slate-100 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <LockKeyhole className="size-4 text-emerald-200" />
                  Safety rules
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-300">
                <p>Current mode: {permission}</p>
                <p>Backend: {backendStatus}</p>
                <p>
                  I will ask before sending, deleting, buying, publishing, or
                  changing accounts.
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-lg border-white/10 bg-white/[0.05] text-slate-100 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles className="size-4 text-violet-200" />
                  Personality
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-300">
                <p>Calm, sharp, and dryly witty. Useful answers first.</p>
                <p>
                  I will help like someone in your corner, while keeping the
                  serious stuff careful.
                </p>
                <div className="grid grid-cols-3 gap-2 pt-2">
                  {['Companion', 'Focus', 'Coach'].map((style) => (
                    <Button
                      key={style}
                      size="sm"
                      variant={
                        communicationStyle === style ? 'default' : 'outline'
                      }
                      className={
                        communicationStyle === style
                          ? 'bg-violet-200 text-slate-950 hover:bg-violet-100'
                          : 'border-white/15 bg-white/[0.03] text-slate-200 hover:bg-white/[0.07]'
                      }
                      onClick={() => updateCommunicationStyle(style)}
                    >
                      {style}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg border-white/10 bg-white/[0.05] text-slate-100 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Bot className="size-4 text-amber-200" />
                  Jared stack
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-amber-200/20 bg-amber-200/10 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-amber-50">
                      {jaredStack?.status ?? 'Ready to install'}
                    </p>
                    <Badge className="bg-amber-200 text-slate-950">
                      Target
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-amber-50/80">
                    {jaredStack?.best_for ??
                      'Memory, voice, face, and hands through Claude Code.'}
                  </p>
                </div>
                <div className="space-y-2 text-sm text-slate-300">
                  <p>Install home: ~/my-agent</p>
                  <p>Working: memory, face, hands, and Codex chat adapter.</p>
                  <p>Next: full push-to-talk voice input for Codex.</p>
                  <p>Current app role: bridge and migration control center.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg border-white/10 bg-white/[0.05] text-slate-100 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Bot className="size-4 text-amber-200" />
                  Local model
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  value={modelName}
                  onChange={(event) => setModelName(event.target.value)}
                  placeholder="qwen3:8b"
                  className="border-white/15 bg-white/[0.04] text-slate-100"
                />
                <p className="text-sm text-slate-400">{modelStatus}</p>
                <div className="space-y-2">
                  {modelOptions.length === 0 && (
                    <p className="rounded-lg bg-black/20 p-3 text-sm text-slate-400">
                      Start Ollama, then refresh models.
                    </p>
                  )}
                  {modelOptions.map((model) => (
                    <button
                      key={model.name}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                        modelName === model.name
                          ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-50'
                          : 'border-white/10 bg-black/20 text-slate-300 hover:bg-white/[0.07]'
                      }`}
                      onClick={() => updateModel(model.name)}
                    >
                      <span>{model.name}</span>
                      <span className="text-xs text-slate-500">
                        {model.sizeGb ? `${model.sizeGb} GB` : 'local'}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="border-white/15 bg-white/[0.03] text-slate-200 hover:bg-white/[0.07]"
                    onClick={() => updateModel(modelName)}
                  >
                    <Check className="size-4" />
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    className="border-white/15 bg-white/[0.03] text-slate-200 hover:bg-white/[0.07]"
                    onClick={() => void loadModels()}
                  >
                    <RefreshCw className="size-4" />
                    Refresh
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg border-white/10 bg-white/[0.05] text-slate-100 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <MessagesSquare className="size-4 text-cyan-200" />
                  <span id="projects">Projects / Fresh chats</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={newProjectName}
                    onChange={(event) => setNewProjectName(event.target.value)}
                    placeholder="New project folder..."
                    className="border-white/15 bg-white/[0.04] text-slate-100"
                  />
                  <Button size="icon" onClick={addProjectFolder}>
                    <Plus className="size-4" />
                  </Button>
                </div>
                <label className="text-xs text-slate-400">
                  Project for new chats
                  <select
                    className="project-select"
                    value={selectedProject ?? ''}
                    onChange={(e) =>
                      setSelectedProject(
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  >
                    <option value="">General / no project</option>
                    {projectFolders.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex gap-2">
                  <Input
                    value={newChatTitle}
                    onChange={(event) => setNewChatTitle(event.target.value)}
                    placeholder="New internal chat..."
                    className="border-white/15 bg-white/[0.04] text-slate-100"
                  />
                  <Button size="icon" onClick={addChatThread}>
                    <Plus className="size-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {projectFolders.map((project) => (
                    <div
                      key={project.id}
                      className="rounded-lg bg-black/20 p-3"
                    >
                      <p className="text-sm font-medium text-slate-100">
                        {project.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {project.summary}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {chatThreads.map((thread) => (
                    <button
                      key={thread.id}
                      disabled={isThinking}
                      onClick={() => {
                        setActiveThread(thread.id);
                        setJavisReply(
                          `Fresh channel: ${thread.title}. What are we working on?`,
                        );
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setActiveThread(thread.id);
                          setJavisReply(`Channel: ${thread.title}`);
                        }
                      }}
                      className="w-full text-left rounded-lg border border-white/10 bg-white/[0.03] p-3"
                    >
                      <p className="text-sm font-medium text-slate-100">
                        {thread.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {thread.project_name ?? 'No folder'} · {thread.status}
                      </p>
                    </button>
                  ))}
                </div>
                <p className="text-xs leading-5 text-slate-500">
                  Javis can suggest fresh chats when a topic needs its own
                  context, then we keep the main thread lighter.
                </p>
              </CardContent>
            </Card>
          </aside>

          <section className="grid content-start gap-4">
            <div id="command">
              <JavisCore
                chat={chat}
                setChat={setChat}
                reply={javisReply}
                thinking={isThinking}
                offline={modelStatus === 'Ollama unavailable'}
                approval={reviewDraft !== null}
                send={sendChat}
                onVoiceChange={setVoiceInput}
              />
              <div className="quick-commands">
                {quickPrompts.map((prompt) => (
                  <button key={prompt} onClick={() => setChat(prompt)}>
                    {prompt}
                    <ChevronRight size={12} />
                  </button>
                ))}
              </div>
              <p className="thread-readout">
                CONTEXT /{' '}
                {chatThreads.find((t) => t.id === activeThread)?.title ??
                  'Main conversation'}{' '}
                <button
                  onClick={() => {
                    setActiveThread(null);
                    setJavisReply('I’m here. What are we working on?');
                  }}
                >
                  Main channel
                </button>
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="rounded-lg border-white/10 bg-white/[0.05] text-slate-100 shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Check className="size-4 text-emerald-200" />
                    Tasks
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      value={newTask}
                      onChange={(event) => setNewTask(event.target.value)}
                      placeholder="Add a task..."
                      className="border-white/15 bg-white/[0.04] text-slate-100"
                    />
                    <Button size="icon" onClick={addTask}>
                      <Plus className="size-4" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {tasks.slice(0, 6).map((task) => (
                      <div
                        key={task.id}
                        className="flex min-h-10 items-center gap-3 rounded-lg bg-black/20 px-3"
                      >
                        <Checkbox
                          checked={task.done}
                          onCheckedChange={(checked) =>
                            void commit({
                              type: 'task.toggle',
                              id: task.id,
                              done: checked === true,
                            })
                          }
                        />
                        <span
                          className={`flex-1 text-sm ${
                            task.done
                              ? 'text-slate-500 line-through'
                              : 'text-slate-200'
                          }`}
                        >
                          {task.title}
                        </span>
                        <Badge
                          variant="outline"
                          className="border-white/10 text-slate-400"
                        >
                          {task.lane}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-lg border-white/10 bg-white/[0.05] text-slate-100 shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Brain className="size-4 text-violet-200" />
                    <span id="memory">Memory vault</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      value={newMemory}
                      onChange={(event) => setNewMemory(event.target.value)}
                      placeholder="Teach Javis something..."
                      className="border-white/15 bg-white/[0.04] text-slate-100"
                    />
                    <Button size="icon" onClick={addMemory}>
                      <Plus className="size-4" />
                    </Button>
                  </div>
                  <MemoryTools
                    memory={memory}
                    projects={projectFolders}
                    refresh={loadState}
                    threadId={activeThread}
                    sessionMemory={sessionMemory}
                    setSessionMemory={setSessionMemory}
                  />
                </CardContent>
              </Card>
            </div>
          </section>

          <aside className="space-y-4">
            <Card className="rounded-lg border-white/10 bg-white/[0.05] text-slate-100 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Search className="size-4 text-cyan-200" />
                  Knowledge
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search notes..."
                  className="border-white/15 bg-white/[0.04] text-slate-100"
                />
                <Textarea
                  value={newNote}
                  onChange={(event) => setNewNote(event.target.value)}
                  placeholder="Add business context..."
                  className="min-h-24 border-white/15 bg-white/[0.04] text-slate-100"
                />
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={addKnowledge}
                >
                  <FileText className="size-4" />
                  Add note
                </Button>
                <div className="max-h-72 space-y-2 overflow-auto pr-1">
                  {filteredKnowledge.map((item) => (
                    <div key={item.id} className="rounded-lg bg-black/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-slate-100">
                          {item.title}
                        </p>
                        <Badge
                          variant="outline"
                          className="border-white/10 text-slate-400"
                        >
                          {item.tag}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-slate-400">{item.body}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg border-white/10 bg-white/[0.05] text-slate-100 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <SquarePen className="size-4 text-amber-200" />
                  <span id="drafts">Approval / Drafts</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={newDraft}
                  onChange={(event) => setNewDraft(event.target.value)}
                  placeholder="Paste or write an email draft..."
                  className="min-h-24 border-white/15 bg-white/[0.04] text-slate-100"
                />
                <Button
                  className="w-full bg-amber-200 text-slate-950 hover:bg-amber-100"
                  onClick={addDraft}
                >
                  <Archive className="size-4" />
                  Save draft
                </Button>
                <div className="space-y-2">
                  {drafts.map((draft) => (
                    <div key={draft.id} className="rounded-lg bg-black/20 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-100">
                            {draft.subject}
                          </p>
                          <p className="text-xs text-slate-500">
                            To: {draft.to}
                          </p>
                        </div>
                        <button
                          aria-label="Delete draft"
                          className="text-slate-500 transition hover:text-red-300"
                          onClick={() =>
                            window.confirm(
                              'Delete this local draft? This cannot be undone.',
                            ) &&
                            void commit({ type: 'draft.delete', id: draft.id })
                          }
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <p className="mt-2 text-sm text-slate-400">
                        {draft.body}
                      </p>
                      <div className="mt-3 flex items-center gap-2 text-xs text-amber-100">
                        <Circle className="size-2 fill-current" />
                        {draft.status}
                      </div>
                      <Button
                        size="sm"
                        className="mt-3"
                        variant="outline"
                        onClick={() => setReviewDraft(draft)}
                      >
                        Review draft
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg border-white/10 bg-white/[0.05] text-slate-100 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <BriefcaseBusiness className="size-4 text-emerald-200" />
                  Audit trail
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-300">
                {auditLog.map((entry) => (
                  <div key={entry.id} className="rounded-lg bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-200">
                        {entry.action}
                      </span>
                      <span className="text-xs text-slate-500">
                        {entry.target_type}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {entry.created_at}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </aside>
        </section>
        <footer className="hud-footer">
          <span>JAVIS / PRIVATE INTELLIGENCE SYSTEM</span>
          <span>LOCAL FIRST · OWNER ACCESS · ACTIONS REQUIRE APPROVAL</span>
        </footer>
      </div>
    </main>
  );
}
