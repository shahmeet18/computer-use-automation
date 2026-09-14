export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolSpec {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Minimal OpenAI-compatible chat completions client against OpenRouter.
 * The model is swappable via OPENROUTER_MODEL (e.g. "anthropic/claude-sonnet-4.5",
 * "openai/gpt-4o") with no client code changes.
 */
export async function chat(
  messages: ChatMessage[],
  tools: ToolSpec[],
): Promise<ChatMessage> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set. Copy .env.example to .env and fill it in.');
  }
  const model = process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4.5';

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, tools }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter request failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    choices?: { message: ChatMessage }[];
    error?: { message: string };
  };

  if (data.error) {
    throw new Error(`OpenRouter error: ${data.error.message}`);
  }
  const message = data.choices?.[0]?.message;
  if (!message) {
    throw new Error(`OpenRouter response had no choices: ${JSON.stringify(data)}`);
  }
  return message;
}
