"use client";

import { createClient } from "@/lib/supabase/client";
import type { Repository } from "../repository";
import type { Profile } from "@/types";

/**
 * profiles is structurally different from every other table: its primary
 * key (`id`) IS the auth user id, there's no separate `user_id` column,
 * and a row is auto-created by the `handle_new_user()` trigger the moment
 * someone signs up (see database/supabase-schema.sql) — the app should
 * never need to insert one. That's different enough from every other
 * entity that it doesn't fit lib/data/remote/genericSupabaseRepo.ts's
 * assumptions, so it gets its own small implementation here instead.
 */
export const supabaseProfileRepo: Repository<Profile> = {
  async list() {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return [];
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userData.user.id).maybeSingle();
    if (error) throw new Error(`profiles.list() failed: ${error.message}`);
    return data ? [data as Profile] : [];
  },

  async get(id) {
    const supabase = createClient();
    const { data, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`profiles.get(${id}) failed: ${error.message}`);
    return (data ?? undefined) as Profile | undefined;
  },

  async create(row) {
    // The signup trigger already created this row — a "create" here really
    // means "the row exists with defaults, fill in what we have," so this
    // is an update, not an insert (which would just fail on the PK conflict).
    return this.update(row.id, row);
  },

  async update(id, patch) {
    const supabase = createClient();
    const { data, error } = await supabase.from("profiles").update(patch).eq("id", id).select().single();
    if (error) throw new Error(`profiles.update(${id}) failed: ${error.message}`);
    return data as Profile;
  },

  async remove() {
    // Deleting a profile means deleting the auth user (cascades via the FK
    // in the schema) — that's an account-deletion action with its own
    // confirmation flow, not something this generic repo method should do
    // silently. Not needed by any current feature.
    throw new Error("profiles.remove() is not supported — deleting a profile means deleting the account, which isn't implemented yet.");
  },
};
