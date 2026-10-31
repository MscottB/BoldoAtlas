import { describe, expect, it } from "vitest";
import type { Conexion } from "../../db/tipos";
import { p, puestos, u, unidades } from "./fixture";
import {
  calcularLayout,
  colapsadosIniciales,
  contraerRama,
  expandirRama,
  subgrafoVisible,
  unidadesDeRama,
  type Subgrafo,
} from "./layout";
import { TIPO_GERENCIA, TIPO_OTRA } from "@/db/tipos";
import { VISTA_POR_DEFECTO, separaciones, tamPuesto, tamUnidad, type ConfigVista } from "./vista";

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
    const pos = await calcularLayout(g, undefined, undefined, {
      ...VISTA_POR_DEFECTO,
      direccion: "horizontal",
    });
    for (const [a, b] of g.jerarquicas) expect(pos.get(b)!.x).toBeGreaterThan(pos.get(a)!.x);
  });

  it("calcularLayout compacto con tarjetas de una línea ocupa menos alto que el normal", async () => {
    const g = subgrafoVisible(unidades, [], new Set(), puestos);
    const alto = async (densidad: "normal" | "compacta") => {
      const c = { ...VISTA_POR_DEFECTO, densidad };
      const pos = await calcularLayout(g, tamUnidad(c, false), tamPuesto(c), c);
      return Math.max(...[...pos.values()].map((x) => x.y));
    };
    expect(await alto("compacta")).toBeLessThan((await alto("normal")) / 2);
  });
});

// Dibuja el subgrafo y mide cada tarjeta: `centro` en el eje de los hermanos y `nivel` (borde inicial) en el de los niveles.
async function dibujar(g: Subgrafo, c: ConfigVista = VISTA_POR_DEFECTO) {
  const tam = tamUnidad(c, false);
  const tp = tamPuesto(c);
  const pos = await calcularLayout(g, tam, tp, c);
  const h = c.direccion === "horizontal";
  const medida = (id: string) => (g.puestos.some((x) => x.id === id) ? tp : tam);
  const centro = (id: string) => {
    const q = pos.get(id)!;
    return h ? q.y + medida(id).alto / 2 : q.x + medida(id).ancho / 2;
  };
  const nivel = (id: string) => (h ? pos.get(id)!.x : pos.get(id)!.y);
  return { pos, centro, nivel, largo: (id: string) => (h ? medida(id).ancho : medida(id).alto) };
}

describe("layout ordenado", () => {
  for (const direccion of ["vertical", "horizontal"] as const)
    for (const conPuestos of [false, true])
      it(`hermanos en su orden y cada superior centrado sobre sus hijos (${direccion}${conPuestos ? ", con puestos" : ""})`, async () => {
        const g = subgrafoVisible(unidades, [], new Set(), conPuestos ? puestos : []);
        const { centro } = await dibujar(g, { ...VISTA_POR_DEFECTO, direccion });
        // En el fixture Finanzas va primero en la lista pero su `orden` es 1; Eléctrica y Mecánica empatan y van por nombre.
        expect(centro("operaciones")).toBeLessThan(centro("finanzas"));
        expect(centro("electrica")).toBeLessThan(centro("mecanica"));
        const hijos = new Map<string, string[]>();
        for (const [a, b] of g.jerarquicas) hijos.set(a, [...(hijos.get(a) ?? []), b]);
        for (const [padre, hs] of hijos) {
          const cs = hs.map(centro);
          for (let i = 1; i < cs.length; i++) expect(cs[i]).toBeGreaterThan(cs[i - 1]!);
          expect(Math.abs(centro(padre) - (cs[0]! + cs[cs.length - 1]!) / 2)).toBeLessThanOrEqual(1);
        }
      });

  it("varias raíces quedan lado a lado en un mismo nivel, en su orden", async () => {
    const dos = [
      ...unidades,
      u("otra", TIPO_OTRA, "Otra raíz", null, 1),
      u("hija", TIPO_GERENCIA, "Hija", "otra"),
    ];
    const { centro, nivel } = await dibujar(subgrafoVisible(dos, [], new Set()));
    expect(nivel("otra")).toBe(nivel("gg"));
    expect(centro("gg")).toBeLessThan(centro("otra"));
    expect(nivel("hija")).toBe(nivel("operaciones"));
  });

  it("los niveles se separan por separaciones().niveles en ambas direcciones y densidades", async () => {
    const g = subgrafoVisible(unidades, [], new Set());
    for (const direccion of ["vertical", "horizontal"] as const)
      for (const densidad of ["normal", "compacta"] as const) {
        const c = { ...VISTA_POR_DEFECTO, direccion, densidad };
        const { nivel, largo } = await dibujar(g, c);
        expect(nivel("operaciones") - nivel("gg") - largo("gg")).toBeCloseTo(separaciones(c).niveles, 0);
        expect(nivel("mantencion")).toBeGreaterThan(nivel("operaciones"));
        expect(nivel("finanzas")).toBe(nivel("operaciones"));
      }
  });

  it("las conexiones laterales no cambian el layout", async () => {
    const abierto = new Set<string>();
    const sin = await calcularLayout(subgrafoVisible(unidades, [], abierto));
    const con = await calcularLayout(subgrafoVisible(unidades, [lateral], abierto));
    expect(con).toEqual(sin);
  });

  it("orden estricto por niveles: toda tarjeta de un nivel empieza en la misma línea, también los puestos", async () => {
    const g = subgrafoVisible(unidades, [], new Set(), puestos);
    // p2 es puesto de Finanzas: mismo nivel que Mantención, pero más corto; sin la opción queda centrado en la fila.
    const libre = await dibujar(g);
    expect(libre.nivel("p2") + libre.largo("p2") / 2).toBeCloseTo(
      libre.nivel("mantencion") + libre.largo("mantencion") / 2,
      0,
    );
    for (const direccion of ["vertical", "horizontal"] as const) {
      const { nivel } = await dibujar(g, { ...VISTA_POR_DEFECTO, direccion, nivelesEstrictos: true });
      expect(nivel("p2")).toBe(nivel("mantencion"));
      expect(nivel("p1")).toBe(nivel("operaciones"));
      expect(nivel("p4")).toBe(nivel("p7"));
    }
  });
});

describe("expandir y contraer", () => {
  it("colapsadosIniciales con nivel: 1 deja solo las raíces (todo plegado); 3 abre hasta el tercer nivel", () => {
    expect(colapsadosIniciales(unidades, 1)).toEqual(new Set(["gg", "operaciones", "mantencion"]));
    expect(ids(subgrafoVisible(unidades, [], colapsadosIniciales(unidades, 1)).nodos)).toEqual(["gg"]);
    expect(colapsadosIniciales(unidades, 3)).toEqual(new Set(["mantencion"]));
    expect(colapsadosIniciales(unidades, 6)).toEqual(new Set());
    expect(colapsadosIniciales(unidades)).toEqual(colapsadosIniciales(unidades, 2));
  });

  it("expandirRama abre la unidad y toda su rama, sin tocar las demás", () => {
    const r = expandirRama(new Set(["gg", "operaciones", "mantencion", "otra"]), unidades, "operaciones");
    expect(r).toEqual(new Set(["gg", "otra"]));
  });

  it("contraerRama pliega la unidad y sus subramas (al reabrirla se ve un nivel); una hoja no cambia nada", () => {
    expect(contraerRama(new Set(["x"]), unidades, "operaciones")).toEqual(
      new Set(["x", "operaciones", "mantencion"]),
    );
    expect(contraerRama(new Set(), unidades, "mecanica")).toEqual(new Set());
    const g = subgrafoVisible(unidades, [], contraerRama(new Set(), unidades, "gg"));
    expect(ids(g.nodos)).toEqual(["gg"]);
  });
});
