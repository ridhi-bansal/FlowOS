"use client";

import { createClient } from "@/lib/supabase/client";
import type { Repository } from "../repository";

/**
 * Generic Repository<T> backed by one Supabase table, via the same
 * interface as lib/data/local/genericRepo.ts's IndexedDB version. Every
 * remote entity in lib/data/index.ts is created by calling this once per
 * table name — mirrors the local file's shape exactly, so switching one
 * for the other (see lib/data/index.ts) doesn't change how any component
 * calls it.
 *
 * Row Level Security in the database (see database/supabase-schema.sql) is
 * the actual security boundary — a user genuinely cannot read or write another
 * user's rows no matter what this code does. The explicit `.eq("user_id", ...)`
 * filters below are a client-side courtesy (clearer queries, and one fewer
 * round trip on an RLS-rejected write attempt), not the enforcement itself.
 */
export function createSupabaseRepo<T extends { id: string; user_id?: string; created_at?: string; updated_at?: string }>(
  table: string
): Repository<T> {
  async function currentUserId(): Promise<string> {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new Error(`${table}: no authenticated user — this repository requires a logged-in session.`);
    return data.user.id;
  }

  return {
    async list() {
      const supabase = createClient();
      const userId = await currentUserId();
      const { data, error } = await supabase.from(table).select("*").eq("user_id", userId);
      if (error) throw new Error(`${table}.list() failed: ${error.message}`);
      return (data ?? []) as T[];
    },

    async get(id) {
      const supabase = createClient();
      const { data, error } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(`${table}.get(${id}) failed: ${error.message}`);
      return (data ?? undefined) as T | undefined;
    },

    async create(row) {
      const supabase = createClient();
      const userId = await currentUserId();
      // Always stamp the real authenticated user id here, ignoring
      // whatever the caller put in row.user_id — every service in
      // lib/services/* hardcodes user_id: "local" when building a new row
      // (a harmless placeholder in local/IndexedDB mode, where there's
      // only ever one tenant per browser). If this used `row.user_id ??
      // userId` instead, that literal string "local" would win (it's
      // truthy) and every insert would fail RLS / fail as an invalid uuid.
      const payload = { ...row, user_id: userId };
      const { data, error } = await supabase.from(table).insert(payload).select().single();
      if (error) throw new Error(`${table}.create() failed: ${error.message}`);
      return data as T;
    },

    async update(id, patch) {
      const supabase = createClient();
      const { data, error } = await supabase.from(table).update(patch).eq("id", id).select().single();
      if (error) throw new Error(`${table}.update(${id}) failed: ${error.message}`);
      return data as T;
    },

    async remove(id) {
      const supabase = createClient();
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw new Error(`${table}.remove(${id}) failed: ${error.message}`);
    },
  };
}
