export interface AuthUser {
  id: string;
  email: string;
  full_name: string | null;
}

export interface AuthSession {
  user: AuthUser;
}

/**
 * The contract lib/auth/index.ts exposes. Implemented locally today
 * (lib/auth/local.ts); a future lib/auth/supabase.ts would implement the
 * same shape so components/auth/AuthProvider.tsx never has to change.
 */
export interface AuthProvider {
  getSession(): Promise<AuthSession | null>;
  signUp(email: string, password: string, fullName: string): Promise<AuthSession>;
  login(email: string, password: string): Promise<AuthSession>;
  logout(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
}
