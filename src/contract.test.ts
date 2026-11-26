import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION } from "./bindings";

describe("契约", () => {
  it("版本是 0.2.0", () => {
    expect(CONTRACT_VERSION).toBe("0.2.0");
  });
});
