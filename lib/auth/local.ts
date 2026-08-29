"use client";

import type { AuthProvider, AuthSession, AuthUser } from "./types";
import { newId } from "@/lib/data/repository";

/**
 * ============================================================================
 * LOCAL MOCK AUTH — NOT REAL SECURITY
 * ============================================================================
 * There is no auth server here. "Accounts" are rows in localStorage on this
 * browser, and "passwords" are compared with a trivial non-cryptographic
 * hash — good enough to gate the local demo UI, not remotely good enough
 * for real credentials. Never let a person paste a real password into this
 * build; the Settings/login UI should say so.
 *
 * This exists so the rest of the app (AuthProvider, RequireAuth, every page
 * that reads the current user) can be written once against AuthProvider
 * (lib/auth/types.ts) and never touched again when this is swapped for
 * lib/auth/supabase.ts backed by real Supabase Auth.
 * ============================================================================
 */

const USERS_KEY = "flowos.auth.users.v1";
const SESSION_KEY = "flowos.auth.session.v1";

interface StoredUser extends AuthUser {
  passwordHash: string;
}

function readUsers(): StoredUser[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(USERS_KEY);
  return raw ? (JSON.parse(raw) as StoredUser[]) : [];
}

function writeUsers(users: StoredUser[]) {
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

// Deliberately weak — this is a local demo, not a credential store. Do not
// reuse this function for anything that matters.
function weakHash(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (Math.imul(31, h) + value.charCodeAt(i)) | 0;
  }
  return `h${h}`;
}

export const localAuth: AuthProvider = {
  async getSession() {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  },

  async signUp(email, password, fullName) {
    const users = readUsers();
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error("An account with that email already exists on this device.");
    }
    const user: StoredUser = {
      id: newId(),
      email,
      full_name: fullName || null,
      passwordHash: weakHash(password),
    };
    writeUsers([...users, user]);
    const session: AuthSession = { user: { id: user.id, email: user.email, full_name: user.full_name } };
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  },

  async login(email, password) {
    const users = readUsers();
    const match = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!match || match.passwordHash !== weakHash(password)) {
      throw new Error("Incorrect email or password.");
    }
    const session: AuthSession = { user: { id: match.id, email: match.email, full_name: match.full_name } };
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  },

  async logout() {
    window.localStorage.removeItem(SESSION_KEY);
  },

  async requestPasswordReset() {
    // No email delivery in the local build. A real provider (e.g. Supabase
    // Auth) would send a reset email here; this mock only documents the
    // shape of the call so the UI doesn't need to change later.
    throw new Error(
      "Password reset requires a connected auth provider and isn't available in this local-only build."
    );
  },
};
