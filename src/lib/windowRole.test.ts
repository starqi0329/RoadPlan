import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveWindowRole, roleFromQuery, shouldDeferMainShell } from "./windowRole";

describe("windowRole", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("从 ?window= 解析 pin / capsule", () => {
    expect(roleFromQuery("?window=pin")).toBe("pin");
    expect(roleFromQuery("?window=capsule")).toBe("capsule");
    expect(roleFromQuery("?window=main")).toBe("main");
    expect(roleFromQuery("")).toBe(null);
  });

  it("浏览器无 query 时是 main，且不推迟主壳", () => {
    vi.stubGlobal("window", {
      location: { search: "" },
    });
    // isTauri 在非 Tauri 为 false
    expect(resolveWindowRole()).toBe("main");
    expect(shouldDeferMainShell()).toBe(false);
  });

  it("有 ?window=pin 时同步即为 pin", () => {
    vi.stubGlobal("window", {
      location: { search: "?window=pin" },
    });
    expect(resolveWindowRole()).toBe("pin");
  });
});
