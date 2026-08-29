import { store, type StoreName } from "@/lib/db/indexedStore";
import type { Repository } from "../repository";
import { nowIso } from "../repository";

/**
 * Generic Repository<T> backed by one IndexedDB object store. This is the
 * ONLY local implementation of Repository — every entity in lib/data/index.ts
 * is created by calling this once per store name, so there's a single place
 * that knows how persistence actually works.
 *
 * Rows with `updated_at`/`created_at` fields get them stamped automatically;
 * rows that don't have those fields are left untouched.
 */
export function createLocalRepo<T extends { id: string; created_at?: string; updated_at?: string }>(
  storeName: StoreName
): Repository<T> {
  const s = store<T>(storeName);

  return {
    list: () => s.list(),
    get: (id) => s.get(id),

    async create(row) {
      const withTimestamps = {
        ...row,
        created_at: row.created_at ?? nowIso(),
        updated_at: row.updated_at ?? nowIso(),
      };
      return s.put(withTimestamps);
    },

    async update(id, patch) {
      const existing = await s.get(id);
      if (!existing) throw new Error(`${storeName}: no row with id ${id}`);
      const updated = { ...existing, ...patch, updated_at: nowIso() } as T;
      return s.put(updated);
    },

    remove: (id) => s.remove(id),
  };
}
