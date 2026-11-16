import { describe, it, expect } from "vitest";
import { armarEliminados, type FilaEliminado } from "./eliminados";

const fila = (o: Partial<FilaEliminado> & { id: string }): FilaEliminado => ({
  nombre: o.id,
  fecha: "2026-01-01T00:00:00Z",
  padre_nombre: null,
  padre_eliminado: 0,
  ...o,
});

describe("armarEliminados", () => {
  it("ordena de lo más reciente a lo más antiguo, mezclando los tres tipos", () => {
    const r = armarEliminados(
      {
        persona: [fila({ id: "a", fecha: "2026-01-02T00:00:00Z" })],
        unidad: [fila({ id: "b", fecha: "2026-03-01T00:00:00Z" })],
        puesto: [fila({ id: "c", fecha: "2026-02-01T00:00:00Z" })],
      },
      new Set(),
    );
    expect(r.map((e) => e.id)).toEqual(["b", "c", "a"]);
    expect(r.map((e) => e.tipo)).toEqual(["unidad", "puesto", "persona"]);
  });

  it("quita a las suprimidas", () => {
    const r = armarEliminados(
      { persona: [fila({ id: "a" }), fila({ id: "z" })], unidad: [], puesto: [] },
      new Set(["z"]),
    );
    expect(r.map((e) => e.id)).toEqual(["a"]);
  });

  it("bloqueo: el nombre de la unidad eliminada que impide restaurar un puesto o una subunidad", () => {
    const r = armarEliminados(
      {
        persona: [fila({ id: "p" })],
        unidad: [
          fila({ id: "u1", padre_nombre: "Raíz", padre_eliminado: 1 }),
          fila({ id: "u2", padre_nombre: "Viva", padre_eliminado: 0 }),
        ],
        puesto: [fila({ id: "q1", padre_nombre: "Hija", padre_eliminado: 1 })],
      },
      new Set(),
    );
    expect(Object.fromEntries(r.map((e) => [e.id, e.bloqueo]))).toEqual({
      p: null,
      u1: "Raíz",
      u2: null,
      q1: "Hija",
    });
  });
});
