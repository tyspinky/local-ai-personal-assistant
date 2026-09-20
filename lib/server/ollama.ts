type OllamaMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type OllamaResponse = {
  message?: {
    content?: string;
  };
  error?: string;
};

type OllamaTagsResponse = {
  models?: Array<{
    name: string;
    size?: number;
    modified_at?: string;
  }>;
};

export type LocalChatResult = {
  provider: 'ollama';
  model: string;
  content: string;
};

export type OllamaModel = {
  name: string;
  sizeGb: number | null;
  modifiedAt: string | null;
};

const defaultOllamaBaseUrl = 'http://127.0.0.1:11434';

function cleanModelOutput(content: string) {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/Thinking\.\.\.[\s\S]*?\.\.\.done thinking\./gi, '')
    .trim();
}

export async function askOllama({
  model,
  messages,
}: {
  model: string;
  messages: OllamaMessage[];
}): Promise<LocalChatResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(`${defaultOllamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        think: false,
        options: {
          temperature: 0.4,
          num_ctx: 16384,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama responded with ${response.status}.`);
    }

    const data = (await response.json()) as OllamaResponse;
    if (data.error) throw new Error(data.error);

    const content = cleanModelOutput(data.message?.content ?? '');
    if (!content) throw new Error('Ollama returned an empty response.');

    return { provider: 'ollama', model, content };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        'Ollama took longer than two minutes to answer. Try a shorter prompt or switch to a smaller/faster model.',
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function listOllamaModels(): Promise<OllamaModel[]> {
  const response = await fetch(`${defaultOllamaBaseUrl}/api/tags`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Ollama responded with ${response.status}.`);
  }

  const data = (await response.json()) as OllamaTagsResponse;
  return (data.models ?? []).map((model) => ({
    name: model.name,
    sizeGb: model.size ? Number((model.size / 1024 ** 3).toFixed(1)) : null,
    modifiedAt: model.modified_at ?? null,
  }));
}
