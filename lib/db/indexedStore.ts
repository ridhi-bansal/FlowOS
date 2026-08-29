"use client";

/**
 * Minimal promise-based IndexedDB wrapper. No external dependency.
 *
 * This is FlowOS's local-mode persistence layer (see lib/supabase/config.ts
 * for how local vs. Supabase mode is decided). Every local repository in
 * lib/data/local/* is built on top of `store()` below, and nothing outside
 * lib/data/ talks to IndexedDB directly. See lib/data/index.ts for the
 * local/Supabase switch.
 *
 * IMPORTANT: in local mode, this data lives only in the current browser.
 * It is NOT synced anywhere, NOT backed up, and is lost if the user clears
 * site data. Do not present this as saved "to the cloud" anywhere in the
 * UI while local mode is active.
 */

const DB_NAME = "flowos";
const DB_VERSION = 1;

export const STORE_NAMES = [
  "profiles", "areas", "tags", "goals", "projects", "milestones", "tasks",
  "task_tags", "attachments", "events", "focus_sessions", "time_entries",
  "habits", "habit_logs", "journal_entries", "reviews", "coach_conversations",
  "coach_messages", "integrations", "notifications",
] as const;

export type StoreName = (typeof STORE_NAMES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable in this environment (server-side render?)."));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORE_NAMES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" });
        }
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

async function tx<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const s = t.objectStore(storeName);
    const req = fn(s);
    t.oncomplete = () => resolve((req as IDBRequest<T> | undefined)?.result as T);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/** Typed CRUD surface for one IndexedDB object store. Every row needs an `id: string`. */
export function store<T extends { id: string }>(name: StoreName) {
  return {
    async list(): Promise<T[]> {
      return tx<T[]>(name, "readonly", (s) => s.getAll() as unknown as IDBRequest<T[]>);
    },
    async get(id: string): Promise<T | undefined> {
      return tx<T | undefined>(name, "readonly", (s) => s.get(id) as IDBRequest<T | undefined>);
    },
    async put(row: T): Promise<T> {
      await tx<IDBValidKey>(name, "readwrite", (s) => s.put(row));
      return row;
    },
    async putMany(rows: T[]): Promise<void> {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const t = db.transaction(name, "readwrite");
        const s = t.objectStore(name);
        for (const row of rows) s.put(row);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
    },
    async remove(id: string): Promise<void> {
      await tx<undefined>(name, "readwrite", (s) => s.delete(id) as unknown as IDBRequest<undefined>);
    },
    async clear(): Promise<void> {
      await tx<undefined>(name, "readwrite", (s) => s.clear() as unknown as IDBRequest<undefined>);
    },
    async count(): Promise<number> {
      return tx<number>(name, "readonly", (s) => s.count());
    },
  };
}
