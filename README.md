# Local AI Personal Assistant

A local-first personal AI assistant built as a portfolio project. It uses Ollama for on-device language-model conversations, SQLite-compatible local storage, owner authentication, persistent memory, project-based chats, task tracking, draft approval flows, and optional voice input/output.

## What it demonstrates

- Local model selection and chat using Ollama
- Persistent conversations, memory review, project folders, and task management
- Owner-only access with session-based authentication
- Local SQLite-compatible data layer and audit trail
- Voice controls: browser speech, push-to-talk, and optional local Piper text-to-speech
- Explicit approval states for draft actions; no external actions are executed by this project

## Privacy and safety

This public version contains no user data, databases, credentials, API keys, local model files, personal knowledge bases, or production integrations. The app is designed to run locally and the default model endpoint is Ollama on `127.0.0.1`.

## Run locally

Requirements: Node.js 22+ and [Ollama](https://ollama.com/).

```bash
npm install
ollama serve
ollama pull qwen3:8b
npm run dev
```

Open the local URL printed by Vinext, then create the initial owner account. The local database and all conversation content remain on the machine running the app.

## Optional local voice

```bash
npm run voice:setup
npm run voice:start
```

The bundled Piper service binds to loopback only. Browser speech recognition is optional and may send audio to the browser vendor; it is disabled unless the user explicitly enables it.

## Checks

```bash
npm run build
npx tsc --noEmit
node --test tests/*.test.mjs
npm run lint
```

## Scope

This is a local portfolio project, not a hosted service. It intentionally does not include deployment secrets, personal context files, third-party knowledge sources, or any integration executor for sending messages, modifying accounts, or making purchases.
