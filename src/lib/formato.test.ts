import { describe, expect, it } from "vitest";
import { tamano } from "./formato";

describe("tamano", () => {
  it("usa KB bajo 1 MB y MB desde ahí", () => {
    expect(tamano(2048, "es")).toMatch(/^2\s?kB$/i);
    expect(tamano(3 * 1024 * 1024, "es")).toMatch(/^3\s?MB$/i);
  });
});
