import { describe, expect, it } from "vitest";
import type { Conexion } from "../../db/tipos";
import { u, unidades } from "./fixture";
import { calcularLayout, colapsadosIniciales, subgrafoVisible } from "./layout";

const lateral: Conexion = { id: "c1", origen_id: "mecanica", destino_id: "finanzas", etiqueta: null };
const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort();

describe("layout del árbol", () => {
  it("colapsadosIniciales colapsa desde el nivel 1 con hijos, no la raíz", () => {
    const c = colapsadosIniciales(unidades);
    expect(c.has("operaciones")).toBe(true);
    expect(c.has("mantencion")).toBe(true);
    expect(c.has("gg")).toBe(false);
    expect(c.has("finanzas")).toBe(false); // sin hijos
    expect(c.has("mecanica")).toBe(false);
  });

  it("subgrafoVisible oculta ramas colapsadas y la lateral con un extremo oculto", () => {
    const g = subgrafoVisible(unidades, [lateral], colapsadosIniciales(unidades));
    expect(ids(g.nodos)).toEqual(["finanzas", "gg", "operaciones"]);
    expect(g.jerarquicas).toEqual([
      ["gg", "operaciones"],
      ["gg", "finanzas"],
    ]);
    expect(g.laterales).toEqual([]);
  });

  it("al expandir aparece la lateral", () => {
    const colapsados = colapsadosIniciales(unidades);
    colapsados.delete("operaciones");
    colapsados.delete("mantencion");
    const g = subgrafoVisible(unidades, [lateral], colapsados);
    expect(ids(g.nodos)).toEqual(["electrica", "finanzas", "gg", "mantencion", "mecanica", "operaciones"]);
    expect(g.laterales).toEqual([lateral]);
  });

  it("soporta varias raíces", () => {
    const dos = [...unidades, u("otra", "otra", "Otra raíz", null), u("hija", "gerencia", "Hija", "otra")];
    expect(colapsadosIniciales(dos).has("otra")).toBe(false);
    expect(colapsadosIniciales(dos).has("hija")).toBe(false);
    const g = subgrafoVisible(dos, [], colapsadosIniciales(dos));
    expect(ids(g.nodos)).toEqual(["finanzas", "gg", "hija", "operaciones", "otra"]);
  });

  it("calcularLayout da una posición por nodo y el hijo queda más abajo", async () => {
    const g = subgrafoVisible(unidades, [lateral], new Set());
    const pos = await calcularLayout(g);
    expect(pos.size).toBe(g.nodos.length);
    for (const [padre, hijo] of g.jerarquicas) {
      expect(pos.get(hijo)!.y).toBeGreaterThan(pos.get(padre)!.y);
    }
  });
});
