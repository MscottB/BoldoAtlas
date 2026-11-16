import { describe, expect, it } from "vitest";
import { coincideNombre } from "./suprimir";

describe("coincideNombre", () => {
  it("sin distinguir mayúsculas ni espacios de los extremos", () => {
    expect(coincideNombre("  ana pérez ", "Ana Pérez")).toBe(true);
    expect(coincideNombre("ANA PÉREZ", " Ana Pérez")).toBe(true);
  });
  it("vacío o distinto no coincide", () => {
    expect(coincideNombre("", "Ana")).toBe(false);
    expect(coincideNombre("   ", "")).toBe(false);
    expect(coincideNombre("Ana P", "Ana Pérez")).toBe(false);
    expect(coincideNombre("Ana  Pérez", "Ana Pérez")).toBe(false);
  });
});
