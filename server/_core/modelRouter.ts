import { ENV } from "./env";

/**
 * Vendor-neutral OpenAI-compatible model router.
 *
 * Any provider exposing /v1/chat/completions works: Together, Groq, Fireworks,
 * DeepSeek, Qwen (DashScope), Mistral, OpenRouter, vLLM, Ollama, LM Studio...
 * Swapping models is a config change only — no code edits:
 *
 *   AI_PROVIDER_BASE_URL=https://api.groq.com/openai/v1
 *   AI_PROVIDER_API_KEY=gsk_...
 *   AI_MODEL=llama-3.3-70b-versatile
 *
 * Precedence: explicit AI_* env > legacy Forge (manus managed runtime) > none.
 * Callers must always pass a deterministic fallback string; the router returns
 * it on any failure so the product keeps working without any model at all.
 */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function modelRouterConfigured(): boolean {
  return Boolean(process.env.AI_PROVIDER_BASE_URL && process.env.AI_PROVIDER_API_KEY && process.env.AI_MODEL);
}

export async function routeChat(input: { system: string; user: string; maxTokens?: number; fallback: string }): Promise<string> {
  if (modelRouterConfigured()) {
    try {
      const base = (process.env.AI_PROVIDER_BASE_URL ?? "").replace(/\/$/, "");
      const response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.AI_PROVIDER_API_KEY}` },
        body: JSON.stringify({
          model: process.env.AI_MODEL,
          messages: [{ role: "system", content: input.system }, { role: "user", content: input.user }],
          max_tokens: input.maxTokens ?? 700,
          temperature: 0.4,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) {
        const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const content = body.choices?.[0]?.message?.content;
        if (typeof content === "string" && content.trim()) return content.trim();
      } else {
        console.warn("[ModelRouter] provider error", response.status, (await response.text()).slice(0, 160));
      }
    } catch (error) {
      console.warn("[ModelRouter] request failed", (error as Error).message?.slice(0, 160));
    }
  }
  // Legacy managed-runtime path (Manus Forge) when running inside that host.
  if (ENV.forgeApiUrl && ENV.forgeApiKey) {
    try {
      const { invokeLLM } = await import("./llm");
      const { listLLMModels } = await import("./llm");
      const { data } = await listLLMModels();
      const model = data.find(m => m.id === "gpt-5-mini")?.id || data.find(m => m.id.startsWith("gpt-5"))?.id || data[0]?.id;
      if (model) {
        const response = await invokeLLM({ model, messages: [{ role: "system", content: input.system }, { role: "user", content: input.user }], maxTokens: input.maxTokens ?? 700 });
        const content = response.choices[0]?.message?.content;
        if (typeof content === "string" && content.trim()) return content.trim();
      }
    } catch (error) {
      console.warn("[ModelRouter] legacy path failed", (error as Error).message?.slice(0, 160));
    }
  }
  return input.fallback;
}
