"use client";

export const MEMBER_ACCESS_TOKEN_KEY = "xunfeng_member_token";
export const MEMBER_REFRESH_TOKEN_KEY = "xunfeng_member_refresh";

/** Revoke this browser's Supabase session, then remove both local credentials. */
export async function logoutBrowserSession() {
  const refreshToken = window.localStorage.getItem(MEMBER_REFRESH_TOKEN_KEY);
  try {
    if (refreshToken) {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
        keepalive: true,
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) return false;
    }
  } catch {
    return false;
  }
  window.localStorage.removeItem(MEMBER_ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(MEMBER_REFRESH_TOKEN_KEY);
  return true;
}

/** localStorage removals are broadcast to sibling tabs on the same origin. */
export function listenForBrowserLogout(onLogout: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === MEMBER_ACCESS_TOKEN_KEY && event.newValue === null) onLogout();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
