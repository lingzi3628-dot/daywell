import type { ModuleManifest, UISlot } from "./catalog";

export type SlotEntry = { moduleId: string; slot: UISlot; id: string; label: string; route?: string };
export class ModuleSlotRegistry {
  private entries = new Map<string, SlotEntry>();
  register(manifest: ModuleManifest): SlotEntry[] {
    this.unregister(manifest.id);
    const entries = manifest.uiSlots.map(slot => ({ moduleId: manifest.id, slot, id: `${manifest.id}:${slot}`, label: manifest.name, route: manifest.routes[0] }));
    for (const entry of entries) this.entries.set(entry.id, entry);
    return entries;
  }
  unregister(moduleId: string) { for (const [id, entry] of this.entries) if (entry.moduleId === moduleId) this.entries.delete(id); }
  list(slot?: UISlot) { return [...this.entries.values()].filter(entry => !slot || entry.slot === slot); }
  clear() { this.entries.clear(); }
}
