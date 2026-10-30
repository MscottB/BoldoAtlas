import { describe, it, expect } from "vitest";
import { generarArbolFalso } from "./arbolFalso";

describe("generarArbolFalso", () => {
  it("genera n nodos, una sola raíz y padres existentes", () => {
    const { nodos } = generarArbolFalso(2000, 6, 1);
    expect(nodos).toHaveLength(2000);
    expect(nodos.filter((n) => n.padre === null)).toHaveLength(1);
    const ids = new Set(nodos.map((n) => n.id));
    expect(nodos.every((n) => n.padre === null || ids.has(n.padre))).toBe(true);
  });

  it("respeta el máximo de hijos por nodo", () => {
    const { nodos } = generarArbolFalso(500, 3, 2);
    const hijos = new Map<string, number>();
    for (const n of nodos) if (n.padre) hijos.set(n.padre, (hijos.get(n.padre) ?? 0) + 1);
    expect(Math.max(...hijos.values())).toBeLessThanOrEqual(3);
  });

  it("es determinista", () => expect(generarArbolFalso(50, 3, 7)).toEqual(generarArbolFalso(50, 3, 7)));
});
