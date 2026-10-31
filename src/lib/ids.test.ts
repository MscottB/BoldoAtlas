import { describe, expect, it } from "vitest";
import { ahora, nuevoId } from "./ids";

describe("ids", () => {
  it("nuevoId genera UUID v7", () =>
    expect(nuevoId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));

  it("ahora devuelve ISO UTC", () =>
    expect(ahora()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/));
});
