export type ModuleCategory = "Daily Life" | "Tasks" | "Health" | "Money" | "Writing" | "Research" | "Learning" | "Utilities";
export type ModulePermission = "storage" | "tasks.read" | "tasks.write" | "ai" | "notifications";
export type UISlot = "sidebar" | "dashboard" | "command-palette" | "settings" | "search";
export type ModuleManifest = {
  id: string;
  name: string;
  version: string;
  icon: string;
  category: ModuleCategory;
  entryBundleUrl: string;
  signature: string;
  minHostVersion: string;
  description: string;
  sizeKb: number;
  rating: number;
  developer: string;
  permissions: ModulePermission[];
  uiSlots: UISlot[];
  routes: string[];
  dataSchema: Record<string, unknown>;
  settingsSchema: Record<string, unknown>;
  aiTools: string[];
  changelog: string[];
  screenshots: string[];
};

const slots: UISlot[] = ["sidebar", "dashboard", "command-palette", "settings", "search"];
const storageSchema = { type: "object", additionalProperties: true };
export const moduleCatalog: ModuleManifest[] = [
  { id: "tasks", name: "Tasks", version: "1.0.0", icon: "✓", category: "Tasks", entryBundleUrl: "builtin:tasks", signature: "daywell-builtin-v1:tasks", minHostVersion: "1.0.0", description: "Turn priorities into clear next steps. Add, organize, and finish tasks alongside your goals.", sizeKb: 18, rating: 0, developer: "Daywell", permissions: ["tasks.read", "tasks.write", "storage", "notifications"], uiSlots: slots, routes: ["/apps/tasks"], dataSchema: { type: "array", items: { type: "object", required: ["title", "completed", "priority"] } }, settingsSchema: { type: "object", properties: { showCompleted: { type: "boolean", default: false } } }, aiTools: ["suggest due dates from task text"], changelog: ["First release: quick add, priority, due dates, recurring tasks, and subtasks."], screenshots: [] },
  { id: "habits", name: "Habit tracker", version: "1.0.0", icon: "✿", category: "Health", entryBundleUrl: "builtin:habits", signature: "daywell-builtin-v1:habits", minHostVersion: "1.0.0", description: "Build small routines with daily check-ins and streaks that reward consistency.", sizeKb: 22, rating: 0, developer: "Daywell", permissions: ["storage", "notifications"], uiSlots: slots, routes: ["/apps/habits"], dataSchema: storageSchema, settingsSchema: { type: "object", properties: { reminderTime: { type: "string" } } }, aiTools: [], changelog: ["First release: habits, daily check-ins, and streak counts."], screenshots: [] },
  { id: "journal", name: "Journal", version: "1.0.0", icon: "✎", category: "Writing", entryBundleUrl: "builtin:journal", signature: "daywell-builtin-v1:journal", minHostVersion: "1.0.0", description: "Keep a private daily entry, note your mood, and look back on the week.", sizeKb: 25, rating: 0, developer: "Daywell", permissions: ["storage", "ai"], uiSlots: slots, routes: ["/apps/journal"], dataSchema: storageSchema, settingsSchema: { type: "object", properties: { dailyPrompt: { type: "boolean", default: true } } }, aiTools: ["summarize the week", "surface themes"], changelog: ["First release: dated entries, moods, prompts, and AI summary."], screenshots: [] },
  { id: "notes", name: "Notes & Capture", version: "1.0.0", icon: "▤", category: "Research", entryBundleUrl: "builtin:notes", signature: "daywell-builtin-v1:notes", minHostVersion: "1.0.0", description: "Capture thoughts in searchable notes, then organize them with folders and tags.", sizeKb: 24, rating: 0, developer: "Daywell", permissions: ["storage", "ai"], uiSlots: slots, routes: ["/apps/notes"], dataSchema: storageSchema, settingsSchema: { type: "object", properties: { defaultFolder: { "type": "string" } } }, aiTools: ["summarize", "extract tasks", "suggest links"], changelog: ["First release: quick text capture, folders, tags, and search."], screenshots: [] },
  { id: "money", name: "Money", version: "1.0.0", icon: "$", category: "Money", entryBundleUrl: "builtin:money", signature: "daywell-builtin-v1:money", minHostVersion: "1.0.0", description: "Log everyday expenses and see a simple weekly spending picture.", sizeKb: 20, rating: 0, developer: "Daywell", permissions: ["storage", "ai"], uiSlots: slots, routes: ["/apps/money"], dataSchema: storageSchema, settingsSchema: { type: "object", properties: { currency: { type: "string", default: "KES" } } }, aiTools: ["categorize expense descriptions"], changelog: ["First release: expense logging and weekly totals."], screenshots: [] },
];

export function getModuleManifest(id: string) { return moduleCatalog.find(module => module.id === id); }
