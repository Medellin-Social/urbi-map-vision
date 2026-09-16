import { describe, it, expect, beforeEach, vi } from "vitest";
import { logout } from "@/hooks/useAuth";
import { setToken, getToken } from "@/lib/apiClient";
import { auth } from "@/lib/auth";

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("logout()", () => {
  it("calls backend /auth/logout and clears local session", async () => {
    setToken("fake.jwt.token");
    auth.set({ name: "Ana", email: "ana@test.co" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);

    await logout();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getToken()).toBeNull();
    expect(auth.get()).toBeNull();
  });

  it("still clears local session when the backend call fails", async () => {
    setToken("fake.jwt.token");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await logout();

    expect(getToken()).toBeNull();
  });

  it("skips the backend call when there is no token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await logout();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
