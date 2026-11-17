import { describe, expect, it } from "vitest";
import { coincideNombre, usarSuprimirPendiente } from "./suprimir";

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

describe("usarSuprimirPendiente", () => {
  it("confirmar después de que el botón cerró el diálogo sigue apuntando a la persona", () => {
    const s = usarSuprimirPendiente<{ id: string }>();
    s.pedir({ id: "p1" });
    expect(s.abierto.value).toBe(true);
    s.abierto.value = false; // el cierre llega antes del @click de confirmar
    expect(s.pendiente.value).toEqual({ id: "p1" });
  });
});
