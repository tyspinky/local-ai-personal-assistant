'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
type Memory = {
  id: number;
  label: string;
  value: string;
  scope?: string;
  project_id?: number | null;
  pinned?: number;
  archived?: number;
};
type Review = { id: number; value: string };
export function MemoryTools({
  memory,
  projects,
  refresh,
  threadId,
  sessionMemory,
  setSessionMemory,
}: {
  memory: Memory[];
  projects: { id: number; name: string }[];
  refresh: () => Promise<void>;
  threadId: number | null;
  sessionMemory: string;
  setSessionMemory: (value: string) => void;
}) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [devices, setDevices] = useState<
    { label: string; current: boolean; expires_at: string }[]
  >([]);
  const [message, setMessage] = useState('');
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<Memory | null>(null);
  async function load() {
    try {
      const response = await fetch('/api/javis/v2');
      if (response.ok) {
        const data = (await response.json()) as {
          reviews: Review[];
          devices: { label: string; current: boolean; expires_at: string }[];
        };
        setReviews(data.reviews);
        setDevices(data.devices);
      }
    } catch {
      setMessage('Memory review is unavailable.');
    }
  }
  useEffect(() => {
    let active = true;
    void fetch('/api/javis/v2')
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as {
          reviews: Review[];
          devices: { label: string; current: boolean; expires_at: string }[];
        };
        if (active) {
          setReviews(data.reviews);
          setDevices(data.devices);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [memory]);
  async function action(body: Record<string, unknown>) {
    try {
      const r = await fetch('/api/javis/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await r.json()) as { error: string };
      if (!r.ok) throw new Error(data.error);
      setMessage('Saved.');
      setEditing(null);
      await refresh();
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save');
    }
  }
  return (
    <div className="memory-tools">
      <details className="session-details">
        <summary>Session memory / temporary</summary>
        <label className="memory-editor">
          Context for this session
          <textarea
            maxLength={2000}
            value={sessionMemory}
            onChange={(e) => setSessionMemory(e.target.value)}
            placeholder="Temporary context to include with your next messages…"
          />
        </label>
        <p>
          Clears when you lock or reload. Replies may still reference this
          context in saved conversations.
        </p>
        <button onClick={() => setSessionMemory('')}>
          Clear session context
        </button>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setArchived(!archived)}
        >
          {archived ? 'Active memories' : 'Archive'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(memory, null, 2)], {
                type: 'application/json',
              }),
            );
            const a = document.createElement('a');
            a.href = url;
            a.download = 'javis-memory.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Export
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            setMessage('Summarizing this channel…');
            try {
              const r = await fetch('/api/javis/summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ threadId }),
              });
              const d = (await r.json()) as { error: string };
              setMessage(r.ok ? 'Summary saved to this channel.' : d.error);
            } catch {
              setMessage('Summary failed.');
            }
          }}
        >
          Summarize chat
        </Button>
      </div>
      {reviews.length > 0 && (
        <div className="review-queue">
          <p>REVIEW / {reviews.length} suggested facts</p>
          {reviews.map((r) => (
            <div key={r.id}>
              <p>{r.value}</p>
              <Button
                size="sm"
                onClick={() =>
                  void action({
                    type: 'memory.review',
                    id: r.id,
                    approve: true,
                  })
                }
              >
                Save fact
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void action({
                    type: 'memory.review',
                    id: r.id,
                    approve: false,
                  })
                }
              >
                Dismiss
              </Button>
            </div>
          ))}
        </div>
      )}
      {memory
        .filter((m) => Boolean(m.archived) === archived)
        .map((item) => (
          <div key={item.id} className="memory-item">
            <div className="flex justify-between">
              <span>
                {item.pinned ? 'PINNED / ' : ''}
                {item.scope ?? 'global'}
              </span>
              <button onClick={() => setEditing({ ...item })}>Edit</button>
            </div>
            <p>{item.value}</p>
            <div className="flex gap-3">
              <button
                onClick={() =>
                  void action({
                    type: 'memory.update',
                    ...item,
                    pinned: !item.pinned,
                  })
                }
              >
                {item.pinned ? 'Unpin' : 'Pin'}
              </button>
              <button
                onClick={() =>
                  void action({
                    type: 'memory.update',
                    ...item,
                    archived: !item.archived,
                  })
                }
              >
                {item.archived ? 'Restore' : 'Archive'}
              </button>
              <button
                onClick={() => {
                  if (confirm('Permanently delete this memory?'))
                    void action({ type: 'memory.delete', id: item.id });
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      {editing && (
        <div className="memory-editor">
          <label>
            Memory
            <textarea
              value={editing.value}
              onChange={(e) =>
                setEditing({ ...editing, value: e.target.value })
              }
            />
          </label>
          <label>
            Scope
            <select
              value={editing.scope ?? 'global'}
              onChange={(e) =>
                setEditing({ ...editing, scope: e.target.value })
              }
            >
              <option>global</option>
              <option>business</option>
              <option>project</option>
            </select>
          </label>
          {editing.scope === 'project' && (
            <label>
              Project
              <select
                value={editing.project_id ?? ''}
                onChange={(e) =>
                  setEditing({ ...editing, project_id: Number(e.target.value) })
                }
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button
            onClick={() => void action({ type: 'memory.update', ...editing })}
          >
            Save changes
          </Button>
          <Button variant="ghost" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        </div>
      )}
      <output className="text-xs text-cyan-200">{message}</output>
      <details className="session-details">
        <summary>Security / {devices.length} active sessions</summary>
        {devices.map((d, i) => (
          <p key={i}>
            {d.label}
            {d.current ? ' · this device' : ''}
            <br />
            Expires {d.expires_at}
          </p>
        ))}
      </details>
    </div>
  );
}
