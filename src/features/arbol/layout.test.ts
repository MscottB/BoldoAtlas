import { describe, expect, it } from "vitest";
import type { Conexion } from "../../db/tipos";
import { p, puestos, u, unidades } from "./fixture";
import { calcularLayout, colapsadosIniciales, subgrafoVisible, unidadesDeRama } from "./layout";
import { TIPO_GERENCIA, TIPO_OTRA } from "@/db/tipos";
import { opcionesElk, tamPuesto, tamUnidad } from "./vista";

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
    const dos = [
      ...unidades,
      u("otra", TIPO_OTRA, "Otra raíz", null),
      u("hija", TIPO_GERENCIA, "Hija", "otra"),
    ];
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

  it("unidadesDeRama deja la raíz pedida y sus descendientes vivos, sin hermanos ni ancestros", () => {
    const rama = unidadesDeRama(unidades, "operaciones");
    expect(ids(rama)).toEqual(["electrica", "mantencion", "mecanica", "operaciones"]);
    expect(rama.find((x) => x.id === "operaciones")!.parent_id).toBeNull();
    const g = subgrafoVisible(rama, [lateral], new Set());
    expect(ids(g.nodos)).toEqual(["electrica", "mantencion", "mecanica", "operaciones"]);
    expect(g.laterales).toEqual([]); // Finanzas queda fuera de la rama
  });

  it("sin puestos el subgrafo no los trae", () => {
    expect(subgrafoVisible(unidades, [], colapsadosIniciales(unidades)).puestos).toEqual([]);
  });

  it("subgrafoVisible con puestos: solo los de unidades visibles y vivas, colgando de su unidad", () => {
    const borrado = { ...p("p9", "gg"), deleted_at: "2026-01-01T00:00:00.000Z" };
    const g = subgrafoVisible(unidades, [], colapsadosIniciales(unidades), [...puestos, borrado]);
    expect(ids(g.puestos)).toEqual(["p1", "p2"]); // los de Mantención y su rama están plegados
    expect(g.jerarquicas).toContainEqual(["gg", "p1"]);
    expect(g.jerarquicas).toContainEqual(["finanzas", "p2"]);
    expect(g.jerarquicas).toHaveLength(4);
    expect(g.nodos).toHaveLength(3); // los puestos no son unidades
  });

  it("una unidad plegada igual muestra sus puestos", () => {
    const colapsados = colapsadosIniciales(unidades);
    expect(colapsados.has("operaciones")).toBe(true);
    const g = subgrafoVisible(unidades, [], colapsados, [p("px", "operaciones")]);
    expect(ids(g.puestos)).toEqual(["px"]);
  });

  it("calcularLayout ubica los puestos debajo de su unidad", async () => {
    const g = subgrafoVisible(unidades, [], new Set(), puestos);
    const pos = await calcularLayout(g);
    expect(pos.size).toBe(g.nodos.length + g.puestos.length);
    for (const x of g.puestos) expect(pos.get(x.id)!.y).toBeGreaterThan(pos.get(x.unidad_id)!.y);
  });

  it("calcularLayout horizontal pone los hijos a la derecha de su unidad", async () => {
    const g = subgrafoVisible(unidades, [], new Set(), puestos);
    const pos = await calcularLayout(
      g,
      undefined,
      undefined,
      opcionesElk({ direccion: "horizontal", densidad: "normal" }),
    );
    for (const [a, b] of g.jerarquicas) expect(pos.get(b)!.x).toBeGreaterThan(pos.get(a)!.x);
  });

  it("calcularLayout compacto con tarjetas de una línea ocupa menos alto que el normal", async () => {
    const g = subgrafoVisible(unidades, [], new Set(), puestos);
    const alto = async (densidad: "normal" | "compacta") => {
      const c = { direccion: "vertical", densidad } as const;
      const pos = await calcularLayout(g, tamUnidad(c, false), tamPuesto(c), opcionesElk(c));
      return Math.max(...[...pos.values()].map((x) => x.y));
    };
    expect(await alto("compacta")).toBeLessThan((await alto("normal")) / 2);
  });
});
