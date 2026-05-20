// Server-only helper: builds a Lovable AI Gateway client. Do NOT import in client code.
export const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export async function callAiJson<T>(opts: {
  model?: string;
  system?: string;
  user: string;
  schema?: Record<string, unknown>;
}): Promise<T | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");

  const messages: Array<{ role: string; content: string }> = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.user });

  const body: Record<string, unknown> = {
    model: opts.model ?? "google/gemini-3-flash-preview",
    messages,
  };
  if (opts.schema) {
    body.tools = [
      {
        type: "function",
        function: {
          name: "emit",
          description: "Emit the result in the required structured format",
          parameters: opts.schema,
        },
      },
    ];
    body.tool_choice = { type: "function", function: { name: "emit" } };
  } else {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) throw new Error("AI rate limit exceeded. Please retry shortly.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Settings → Workspace → Usage.");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI gateway error [${res.status}]: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const msg = data?.choices?.[0]?.message;
  try {
    if (msg?.tool_calls?.[0]?.function?.arguments) {
      return JSON.parse(msg.tool_calls[0].function.arguments) as T;
    }
    if (typeof msg?.content === "string") {
      return JSON.parse(msg.content) as T;
    }
  } catch (e) {
    console.error("AI JSON parse failed", e, msg);
  }
  return null;
}
