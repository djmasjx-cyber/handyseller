/**
 * Хранение и чтение данных пользователя для проверки доступа на фронте.
 * Серверная проверка — в API (RolesGuard).
 */

export const AUTH_STORAGE_KEYS = {
  accessToken: "accessToken",
  user: "user",
} as const;

export interface StoredUser {
  id: string;
  email: string;
  name?: string | null;
  role?: string;
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEYS.user);
    if (!raw) return null;
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export function setStoredUser(user: StoredUser | null): void {
  if (typeof window === "undefined") return;
  if (!user) {
    localStorage.removeItem(AUTH_STORAGE_KEYS.user);
    return;
  }
  localStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(user));
}

export function isAdmin(): boolean {
  return getStoredUser()?.role === "ADMIN";
}
