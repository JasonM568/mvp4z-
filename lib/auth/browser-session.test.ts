import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listenForBrowserLogout,
  logoutBrowserSession,
  MEMBER_ACCESS_TOKEN_KEY,
  MEMBER_REFRESH_TOKEN_KEY
} from "./browser-session";

const originalWindow = globalThis.window;

function setWindow(items: Record<string, string>) {
  const localStorage = {
    getItem: vi.fn((key: string) => items[key] ?? null),
    removeItem: vi.fn((key: string) => { delete items[key]; })
  };
  const listeners = new Map<string, (event: StorageEvent) => void>();
  globalThis.window = {
    localStorage,
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === "storage" && typeof listener === "function") listeners.set(type, listener as (event: StorageEvent) => void);
    }),
    removeEventListener: vi.fn((type: string) => { listeners.delete(type); })
  } as unknown as Window & typeof globalThis;
  return { localStorage, listeners };
}

describe("browser session logout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.window = originalWindow;
  });

  it("revokes with the refresh token and clears both local credentials", async () => {
    const state = setWindow({
      [MEMBER_ACCESS_TOKEN_KEY]: "access",
      [MEMBER_REFRESH_TOKEN_KEY]: "refresh"
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    await logoutBrowserSession();

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ refresh_token: "refresh" }),
      keepalive: true
    }));
    expect(state.localStorage.removeItem).toHaveBeenCalledWith(MEMBER_ACCESS_TOKEN_KEY);
    expect(state.localStorage.removeItem).toHaveBeenCalledWith(MEMBER_REFRESH_TOKEN_KEY);
  });

  it("preserves credentials and reports failure if session revocation fails", async () => {
    const state = setWindow({ [MEMBER_ACCESS_TOKEN_KEY]: "access", [MEMBER_REFRESH_TOKEN_KEY]: "refresh" });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    await expect(logoutBrowserSession()).resolves.toBe(false);

    expect(state.localStorage.removeItem).not.toHaveBeenCalled();
  });

  it("preserves credentials when the logout endpoint returns HTTP 500", async () => {
    const state = setWindow({ [MEMBER_ACCESS_TOKEN_KEY]: "access", [MEMBER_REFRESH_TOKEN_KEY]: "refresh" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));

    await expect(logoutBrowserSession()).resolves.toBe(false);

    expect(state.localStorage.removeItem).not.toHaveBeenCalled();
  });

  it("notifies sibling tabs when the access token is removed", () => {
    const { listeners } = setWindow({});
    const onLogout = vi.fn();
    const unsubscribe = listenForBrowserLogout(onLogout);
    const listener = listeners.get("storage");

    listener?.({ key: MEMBER_ACCESS_TOKEN_KEY, newValue: null } as StorageEvent);
    listener?.({ key: MEMBER_REFRESH_TOKEN_KEY, newValue: null } as StorageEvent);
    unsubscribe();

    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
