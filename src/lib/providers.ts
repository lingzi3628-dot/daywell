import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type ProviderConfig = { provider: string; model: string; apiKey: string; endpoint?: string | null };
type Msg = { role: string; content: string };
export const supportedProviders = ["OpenRouter", "OpenAI", "Gemini", "GLM", "Hugging Face", "Custom"];
const endpoints: Record<string, string> = {
  OpenRouter: "https://openrouter.ai/api/v1/chat/completions",
  OpenAI: "https://api.openai.com/v1/chat/completions",
  GLM: "https://api.z.ai/api/paas/v4/chat/completions",
  "Hugging Face": "https://router.huggingface.co/v1/chat/completions",
};
function isPrivateIP(ip: string) {
  const normalized = ip.toLowerCase();
  if (normalized.includes(":") || normalized.startsWith("::ffff:")) return true; // Custom endpoints use public IPv4 DNS only.
  const parts = normalized.split(".").map(Number);
  const [a,b] = parts;
  return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a >= 224;
}
export async function validateEndpoint(endpoint: string) {
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new Error("Enter a valid HTTPS API endpoint URL."); }
  if (url.protocol !== "https:" || !!url.username || !!url.password || !!url.hash || url.port && url.port !== "443") throw new Error("Use a public HTTPS endpoint without credentials, fragments, or custom ports.");
  if (!url.pathname.endsWith("/chat/completions")) throw new Error("Endpoint must end in /chat/completions.");
  if (url.search) throw new Error("Remove query parameters from the endpoint URL.");
  if (isIP(url.hostname) || !url.hostname.includes(".") || url.hostname.endsWith(".local") || url.hostname.endsWith(".internal")) throw new Error("Use a public domain name, not a local or IP address.");
  const records = await lookup(url.hostname, { all: true, family: 4 });
  if (!records.length || records.some(record => isPrivateIP(record.address))) throw new Error("Endpoint must resolve to a public address.");
  return url.toString();
}
export async function callProvider(config: ProviderConfig, system: string, prompt: string, history: Msg[] = [], timeout = 45000): Promise<string> {
  if (!supportedProviders.includes(config.provider)) throw new Error("Unsupported provider.");
  if (!config.model.trim() || !config.apiKey.trim()) throw new Error("Model and API key are required.");
  const headers: Record<string,string> = { "Content-Type": "application/json" };
  let url: string; let body: object;
  if (config.provider === "Gemini") {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
    headers["x-goog-api-key"] = config.apiKey;
    body = { systemInstruction: { parts: [{ text: system }] }, contents: [...history.slice(-12), { role: "user", content: prompt }].map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })), generationConfig: { maxOutputTokens: 1600 } };
  } else {
    url = config.provider === "Custom" ? await validateEndpoint(config.endpoint || "") : endpoints[config.provider];
    headers.Authorization = `Bearer ${config.apiKey}`;
    if (config.provider === "OpenRouter") headers["X-OpenRouter-Title"] = "Daywell";
    body = { model: config.model, messages: [{ role: "system", content: system }, ...history.slice(-12).map(m => ({ role: m.role, content: m.content })), { role: "user", content: prompt }], max_tokens: 1600, temperature: 0.7 };
  }
  let response: Response;
  try { response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(timeout) }); }
  catch (e) { if (e instanceof Error && e.name === "TimeoutError") throw new Error("The provider timed out. Check your endpoint and try again."); throw new Error("Could not reach the provider. Check your endpoint and network access."); }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = result?.error?.message || (typeof result?.error === "string" ? result.error : result?.message);
    throw new Error(`Provider returned ${response.status}${detail ? `: ${String(detail).slice(0, 250)}` : ". Check your key and model ID."}`);
  }
  const content = config.provider === "Gemini" ? result?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") : result?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("The model returned no text. Check that it supports chat completions.");
  return content.trim();
}
