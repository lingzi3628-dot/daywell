import { authFetch } from "@/lib/client-auth";
import type { ModuleManifest, ModulePermission } from "./catalog";

export type HostTask = { id: string; title: string; completed: boolean; priority: string; dueDate: string | null; goalId: string | null };
export type HostSDK = {
  moduleId: string;
  storage: { get<T>(key: string): Promise<T | null>; set<T>(key: string, value: T): Promise<void>; remove(key: string): Promise<void> };
  tasks: { list(): Promise<HostTask[]>; add(input: { title: string; priority?: string; dueDate?: string | null }): Promise<HostTask>; complete(id: string, completed: boolean): Promise<void> };
  ai: { summarize(text: string): Promise<string>; extract(text: string): Promise<string>; generate(prompt: string): Promise<string> };
  ui: { toast(message: string): void; confirm(message: string): boolean; theme: Readonly<{ accent: "#596bd6"; surface: "#ffffff" }> };
  notifications: { remind(title: string, at: Date): Promise<void> };
  search: { register(provider: (query: string) => Promise<Array<{ title: string; detail?: string }>>): () => void };
  commands: { register(command: { id: string; label: string; run: () => void | Promise<void> }): () => void };
};

const forbidden = (service: string): never => { throw new Error(`This host does not provide ${service} yet. The module has no direct access to other app data.`); };
function requirePermission(permissions: Set<ModulePermission>, permission: ModulePermission) {
  if (!permissions.has(permission)) throw new Error(`Permission denied: ${permission}. Grant it in the Apps settings to continue.`);
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(url, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Host service failed (${response.status}).`);
  return body as T;
}

export function createHostSDK(manifest: ModuleManifest, granted: ModulePermission[]): HostSDK {
  const permissions = new Set(granted);
  const dataUrl = (key: string) => `/api/modules/data?module=${encodeURIComponent(manifest.id)}&key=${encodeURIComponent(key)}`;
  const cacheKey = (key: string) => `daywell:module:${manifest.id}:${key}`;
  const pendingKey = (key: string) => `${cacheKey(key)}:pending`;
  const read = async <T>(key: string): Promise<T | null> => {
    requirePermission(permissions, "storage");
    const cached = window.localStorage.getItem(cacheKey(key)); const pending = window.localStorage.getItem(pendingKey(key));
    if (pending && cached) { try { await json(dataUrl(key), { method: "PUT", body: JSON.stringify({ value: JSON.parse(cached) }) }); window.localStorage.removeItem(pendingKey(key)); } catch { /* Keep offline edits queued for the next read. */ } }
    try { const r = await json<{ value: T | null }>(dataUrl(key)); if (!pending) { if (r.value === null) window.localStorage.removeItem(cacheKey(key)); else window.localStorage.setItem(cacheKey(key), JSON.stringify(r.value)); } return pending && cached ? JSON.parse(cached) as T : r.value; }
    catch { return cached ? JSON.parse(cached) as T : null; }
  };
  const write = async <T>(key: string, value: T) => {
    requirePermission(permissions, "storage"); const encoded = JSON.stringify(value); window.localStorage.setItem(cacheKey(key), encoded); window.localStorage.setItem(pendingKey(key), "1");
    try { await json(dataUrl(key), { method: "PUT", body: JSON.stringify({ value }) }); window.localStorage.removeItem(pendingKey(key)); }
    catch { window.dispatchEvent(new CustomEvent("daywell:toast", { detail: "Saved on this device. It will sync when you’re back online." })); }
  };
  return {
    moduleId: manifest.id,
    storage: {
      get: read,
      set: write,
      remove: async key => { requirePermission(permissions, "storage"); await json(dataUrl(key), { method: "DELETE" }); },
    },
    tasks: {
      list: async () => { requirePermission(permissions, "tasks.read"); const r = await json<{ tasks: HostTask[] }>("/api/data"); return r.tasks || []; },
      add: async input => { requirePermission(permissions, "tasks.write"); const r = await json<{ item: HostTask }>("/api/data", { method: "POST", body: JSON.stringify({ resource: "tasks", data: input }) }); return r.item; },
      complete: async (id, completed) => { requirePermission(permissions, "tasks.write"); await json("/api/data", { method: "PATCH", body: JSON.stringify({ resource: "tasks", id, data: { completed } }) }); },
    },
    ai: {
      summarize: async text => { requirePermission(permissions, "ai"); const r = await json<{ content: string }>("/api/ai", { method: "POST", body: JSON.stringify({ action: "module-tool", moduleId: manifest.id, tool: "summarize", input: text }) }); return r.content; },
      extract: async text => { requirePermission(permissions, "ai"); const r = await json<{ content: string }>("/api/ai", { method: "POST", body: JSON.stringify({ action: "module-tool", moduleId: manifest.id, tool: "extract", input: text }) }); return r.content; },
      generate: async prompt => { requirePermission(permissions, "ai"); const r = await json<{ content: string }>("/api/ai", { method: "POST", body: JSON.stringify({ action: "module-tool", moduleId: manifest.id, tool: "generate", input: prompt }) }); return r.content; },
    },
    ui: { toast: message => window.dispatchEvent(new CustomEvent("daywell:toast", { detail: message })), confirm: message => window.confirm(message), theme: { accent: "#596bd6", surface: "#ffffff" } },
    notifications: { remind: async (title, at) => { requirePermission(permissions, "notifications"); if (at.getTime() <= Date.now()) throw new Error("Choose a reminder time in the future."); if ("Notification" in window && Notification.permission === "granted") { const delay = at.getTime() - Date.now(); window.setTimeout(() => new Notification(title), Math.min(delay, 2_147_000_000)); } else if ("Notification" in window && Notification.permission === "default") { const permission = await Notification.requestPermission(); if (permission !== "granted") throw new Error("Notification permission was not granted."); } else forbidden("background notifications"); } },
    search: { register: provider => { window.dispatchEvent(new CustomEvent("daywell:module-search-register", { detail: { moduleId: manifest.id, provider } })); return () => window.dispatchEvent(new CustomEvent("daywell:module-search-unregister", { detail: manifest.id })); } },
    commands: { register: command => { window.dispatchEvent(new CustomEvent("daywell:module-command-register", { detail: { moduleId: manifest.id, ...command } })); return () => window.dispatchEvent(new CustomEvent("daywell:module-command-unregister", { detail: { moduleId: manifest.id, commandId: command.id } })); } },
  };
}

export const hostServiceStubs = { calendar: () => forbidden("calendar"), notes: () => forbidden("notes"), people: () => forbidden("people"), files: () => forbidden("files") };
