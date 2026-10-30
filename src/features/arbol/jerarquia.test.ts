import { describe, expect, it } from "vitest";
import { TIPO_AREA, TIPO_GERENCIA, TIPO_OTRA, TIPO_SUBAREA, type ValorCatalogo } from "@/db/tipos";
import { a, asignaciones, p, puestos, tipos, u, unidades } from "./fixture";
import {
  creaCiclo,
  descendientes,
  dotacion,
  dotacionPorUnidad,
  hijos,
  indexar,
  indiceHijos,
  jefeVisible,
  leyendaDeMarcas,
  marcaHeredada,
  marcasPorUnidad,
  ruta,
  rutaPorTipo,
  rutasPorTipo,
  rutaSuperiores,
  rutaTexto,
  tipoHijo,
  tiposEnUso,
  unidadesDePersona,
  vigentesPorPuesto,
} from "./jerarquia";

const BORRADO = "2026-01-01T00:00:00.000Z";

describe("jerarquía", () => {
  it("indexar indexa por id", () => {
    expect(indexar(unidades).get("mecanica")?.nombre).toBe("Mecánica");
  });

  it("hijos ordena por orden y luego nombre, e ignora borradas", () => {
    expect(hijos(unidades, "gg").map((x) => x.id)).toEqual(["operaciones", "finanzas"]);
    expect(hijos(unidades, "mantencion").map((x) => x.id)).toEqual(["electrica", "mecanica"]);
  });

  it("ruta y rutaTexto van de la raíz a la unidad", () => {
    expect(ruta(unidades, "mecanica").map((x) => x.id)).toEqual([
      "gg",
      "operaciones",
      "mantencion",
      "mecanica",
    ]);
    expect(rutaTexto(unidades, "mecanica")).toBe("Gerencia General › Operaciones › Mantención › Mecánica");
  });

  it("descendientes no incluye la propia unidad ni las borradas", () => {
    expect(descendientes(unidades, "operaciones")).toEqual(new Set(["mantencion", "mecanica", "electrica"]));
  });

  it("creaCiclo detecta mover bajo sí misma o bajo un descendiente", () => {
    expect(creaCiclo(unidades, "operaciones", "mecanica")).toBe(true);
    expect(creaCiclo(unidades, "mecanica", "finanzas")).toBe(false);
    expect(creaCiclo(unidades, "x", "x")).toBe(true);
    expect(creaCiclo(unidades, "gg", null)).toBe(false);
  });

  it("dotacion cuenta puestos con titular vigente (directos y de la rama) y vacantes de la rama", () => {
    // p6 tiene solo un reemplazo vigente y p2 solo un titular cerrado: son vacantes y no suman dotación.
    expect(dotacion(unidades, puestos, asignaciones, "mantencion")).toEqual({
      directa: 1,
      total: 5,
      vacantes: 1,
    });
    expect(dotacion(unidades, puestos, asignaciones, "gg")).toEqual({ directa: 1, total: 6, vacantes: 2 });
  });

  it("dotacionPorUnidad da lo mismo que dotacion para cada unidad viva, en una pasada", () => {
    const ps = [...puestos, { ...p("p9", "mecanica"), deleted_at: BORRADO }];
    const as = [...asignaciones, a("a9", "p9", "t9"), { ...a("a10", "p6", "t9"), deleted_at: BORRADO }];
    const todas = dotacionPorUnidad(unidades, ps, as);
    const vivas = unidades.filter((x) => !x.deleted_at);
    expect([...todas.keys()].sort()).toEqual(vivas.map((x) => x.id).sort());
    for (const x of vivas) expect(todas.get(x.id)).toEqual(dotacion(unidades, ps, as, x.id));
  });

  it("dotacion ignora puestos y asignaciones borrados", () => {
    const ps = [...puestos, { ...p("p9", "mantencion"), deleted_at: BORRADO }];
    const as = [...asignaciones, a("a9", "p9", "t9"), { ...a("a10", "p6", "t9"), deleted_at: BORRADO }];
    expect(dotacion(unidades, ps, as, "mantencion")).toEqual({ directa: 1, total: 5, vacantes: 1 });
  });
});

// "Superintendencia" entre Gerencia y Área; Mantención pasa a ser una.
const SUPER = "sup";
const conSuper: ValorCatalogo[] = [
  ...tipos,
  { id: SUPER, nombre: "Superintendencia", orden: 15, deleted_at: null },
];
const unidadesConSuper = unidades.map((x) => (x.id === "mantencion" ? { ...x, tipo_id: SUPER } : x));

describe("tipos de unidad", () => {
  const nombres = (r: ReturnType<typeof rutaPorTipo>) => r.map((x) => [x.tipo.nombre, x.unidad.id]);

  it("rutaPorTipo: para cada tipo, la unidad más cercana hacia arriba, en orden del catálogo", () => {
    expect(nombres(rutaPorTipo(unidades, tipos, "mecanica"))).toEqual([
      ["Gerencia", "operaciones"],
      ["Área", "mantencion"],
      ["Subárea", "mecanica"],
      ["Otra", "gg"],
    ]);
    expect(nombres(rutaPorTipo(unidades, tipos, "finanzas"))).toEqual([
      ["Gerencia", "finanzas"],
      ["Otra", "gg"],
    ]);
  });

  it("rutaPorTipo con un tipo agregado entre otros", () => {
    expect(nombres(rutaPorTipo(unidadesConSuper, conSuper, "mecanica"))).toEqual([
      ["Gerencia", "operaciones"],
      ["Superintendencia", "mantencion"],
      ["Subárea", "mecanica"],
      ["Otra", "gg"],
    ]);
  });

  it("rutaPorTipo con un tipo renombrado y uno desactivado (sigue válido en sus unidades)", () => {
    const cambiados = tipos.map((t) =>
      t.id === TIPO_GERENCIA
        ? { ...t, nombre: "Dirección" }
        : t.id === TIPO_AREA
          ? { ...t, deleted_at: BORRADO }
          : t,
    );
    expect(nombres(rutaPorTipo(unidades, cambiados, "mantencion"))).toEqual([
      ["Dirección", "operaciones"],
      ["Área", "mantencion"],
      ["Otra", "gg"],
    ]);
  });

  it("con un tipo repetido en el camino, gana la unidad más cercana", () => {
    // Otra dentro de Otra (GG › … › Mecánica › Interna › Detalle) y Área dentro de Área.
    const repetidas = [
      ...unidades,
      u("interna", TIPO_OTRA, "Interna", "mecanica"),
      u("detalle", TIPO_SUBAREA, "Detalle", "interna"),
      u("areaInterna", TIPO_AREA, "Área interna", "mantencion"),
    ];
    expect(nombres(rutaPorTipo(repetidas, tipos, "detalle"))).toEqual([
      ["Gerencia", "operaciones"],
      ["Área", "mantencion"],
      ["Subárea", "detalle"],
      ["Otra", "interna"],
    ]);
    expect(nombres(rutaPorTipo(repetidas, tipos, "areaInterna"))).toContainEqual(["Área", "areaInterna"]);
  });

  it("rutaSuperiores: los superiores por tipo, sin la unidad; un Área dentro de un Área muestra la externa", () => {
    const repetidas = [...unidades, u("areaInterna", TIPO_AREA, "Área interna", "mantencion")];
    const rutas = rutasPorTipo(repetidas, tipos, new Set([TIPO_GERENCIA, TIPO_AREA]));
    const ids = (id: string) => rutaSuperiores(rutas, repetidas.find((x) => x.id === id)!).map((x) => x.id);
    expect(ids("areaInterna")).toEqual(["operaciones", "mantencion"]);
    expect(ids("mantencion")).toEqual(["operaciones"]);
    expect(ids("gg")).toEqual([]);
  });

  it("tipoHijo: el siguiente tipo activo en orden; el último se repite; sin superior, el primero", () => {
    expect(tipoHijo(tipos, TIPO_GERENCIA)).toBe(TIPO_AREA);
    expect(tipoHijo(tipos, TIPO_AREA)).toBe(TIPO_SUBAREA);
    expect(tipoHijo(tipos, TIPO_SUBAREA)).toBe(TIPO_OTRA);
    expect(tipoHijo(tipos, TIPO_OTRA)).toBe(TIPO_OTRA);
    expect(tipoHijo(tipos, null)).toBe(TIPO_GERENCIA);
  });

  it("tipoHijo con un tipo agregado, uno renombrado y uno reordenado", () => {
    expect(tipoHijo(conSuper, TIPO_GERENCIA)).toBe(SUPER);
    expect(tipoHijo(conSuper, SUPER)).toBe(TIPO_AREA);
    const renombrado = tipos.map((t) => (t.id === TIPO_GERENCIA ? { ...t, nombre: "Dirección" } : t));
    expect(tipoHijo(renombrado, TIPO_GERENCIA)).toBe(TIPO_AREA);
    const otraPrimero = tipos.map((t) => (t.id === TIPO_OTRA ? { ...t, orden: 5 } : t));
    expect(tipoHijo(otraPrimero, null)).toBe(TIPO_OTRA);
    expect(tipoHijo(otraPrimero, TIPO_OTRA)).toBe(TIPO_GERENCIA);
  });

  it("tipoHijo salta los desactivados; sin activos, undefined", () => {
    const sinArea = tipos.map((t) =>
      t.id === TIPO_AREA || t.id === TIPO_OTRA ? { ...t, deleted_at: BORRADO } : t,
    );
    expect(tipoHijo(sinArea, TIPO_GERENCIA)).toBe(TIPO_SUBAREA);
    expect(tipoHijo(sinArea, TIPO_SUBAREA)).toBe(TIPO_SUBAREA);
    expect(tipoHijo(sinArea, TIPO_OTRA)).toBe(TIPO_SUBAREA);
    expect(
      tipoHijo(
        tipos.map((t) => ({ ...t, deleted_at: BORRADO })),
        null,
      ),
    ).toBeUndefined();
  });
});

describe("puestos y asignaciones", () => {
  const conJefe = (jefe_puesto_id: string | null) => ({ ...u("x", TIPO_AREA, "X", null), jefe_puesto_id });

  it("vigentesPorPuesto ignora las cerradas y las borradas", () => {
    const v = vigentesPorPuesto([...asignaciones, { ...a("a9", "p2", "t9"), deleted_at: BORRADO }]);
    expect(v.get("p2")).toBeUndefined();
    expect(v.get("p6")).toEqual({ reemplazo: asignaciones[5] });
    expect(v.get("p1")).toEqual({ titular: asignaciones[0] });
  });

  it("jefeVisible: el titular vigente del puesto de jefatura o, si no hay, su reemplazo vigente", () => {
    const v = vigentesPorPuesto([...asignaciones, a("a9", "p1", "t9", "reemplazo")]);
    expect(jefeVisible(conJefe("p1"), v)?.trabajador_id).toBe("t1");
    expect(jefeVisible(conJefe("p6"), v)).toMatchObject({ trabajador_id: "t3", tipo: "reemplazo" });
    expect(jefeVisible(conJefe("p2"), v)).toBeNull();
    expect(jefeVisible(conJefe(null), v)).toBeNull();
  });

  it("unidadesDePersona: unidades de sus asignaciones vigentes, sin repetir ni contar las cerradas", () => {
    expect(unidadesDePersona(puestos, asignaciones, "t3")).toEqual(["mantencion", "mecanica"]);
    expect(unidadesDePersona(puestos, asignaciones, "t2")).toEqual([]);
    const otroEnMecanica = [...asignaciones, a("a9", "p5", "t4", "reemplazo")];
    expect(unidadesDePersona(puestos, otroEnMecanica, "t4")).toEqual(["mecanica"]);
    const borrado = [...puestos.slice(0, 2), { ...p("p3", "mantencion"), deleted_at: BORRADO }];
    expect(unidadesDePersona(borrado, asignaciones, "t3")).toEqual([]);
  });
});

describe("marcaHeredada", () => {
  const marcadas = unidades.map((x) =>
    x.id === "operaciones"
      ? { ...x, marca_color: "#c2410c", marca_codigo: "OPE" }
      : x.id === "mecanica"
        ? { ...x, marca_color: "#2563eb", marca_codigo: null }
        : x,
  );

  it("toma la unidad más cercana hacia arriba, incluida ella misma, con marca y del nivel pedido", () => {
    expect(marcaHeredada(marcadas, "mecanica", "cualquiera")).toEqual({ color: "#2563eb", codigo: null });
    expect(marcaHeredada(marcadas, "mecanica", TIPO_GERENCIA)).toEqual({ color: "#c2410c", codigo: "OPE" });
    expect(marcaHeredada(marcadas, "operaciones", TIPO_GERENCIA)).toEqual({
      color: "#c2410c",
      codigo: "OPE",
    });
    expect(marcaHeredada(marcadas, "electrica", "cualquiera")).toEqual({ color: "#c2410c", codigo: "OPE" });
  });

  it("funciona con un tipo agregado", () => {
    const conMarca = unidadesConSuper.map((x) => (x.id === "mantencion" ? { ...x, marca_codigo: "MAN" } : x));
    expect(marcaHeredada(conMarca, "electrica", SUPER)).toEqual({ color: null, codigo: "MAN" });
    expect(marcaHeredada(conMarca, "electrica", TIPO_AREA)).toBeNull();
  });

  it("null si ninguna unidad de ese nivel en la ruta tiene marca", () => {
    expect(marcaHeredada(marcadas, "mecanica", TIPO_AREA)).toBeNull();
    expect(marcaHeredada(marcadas, "finanzas", TIPO_GERENCIA)).toBeNull();
    expect(marcaHeredada(marcadas, "gg", "cualquiera")).toBeNull();
  });
});

describe("vista: marcas, rutas y tipos en uso", () => {
  const marcadas = unidades.map((x) =>
    x.id === "gg"
      ? { ...x, marca_color: "#111111", marca_codigo: "GG" }
      : x.id === "operaciones"
        ? { ...x, marca_color: "#c2410c", marca_codigo: "OPE" }
        : x.id === "finanzas"
          ? { ...x, marca_color: null, marca_codigo: "FIN" }
          : x,
  );

  it("marcasPorUnidad coincide con marcaHeredada para cada unidad y nivel", () => {
    for (const nivel of [TIPO_GERENCIA, TIPO_AREA, TIPO_OTRA]) {
      const marcas = marcasPorUnidad(marcadas, nivel);
      for (const x of marcadas.filter((y) => !y.deleted_at)) {
        const esperada = marcaHeredada(marcadas, x.id, nivel);
        const m = marcas.get(x.id) ?? null;
        expect(m && { color: m.color, codigo: m.codigo }).toEqual(esperada);
      }
    }
  });

  it("marcasPorUnidad apunta a la unidad que define la marca y no incluye borradas", () => {
    const marcas = marcasPorUnidad(marcadas, TIPO_GERENCIA);
    expect(marcas.get("mecanica")?.unidad.id).toBe("operaciones");
    expect(marcas.get("gg")).toBeNull(); // GG es de tipo Otra: no tiene marca de Gerencia ni hereda
    expect(marcas.has("borrada")).toBe(false);
  });

  it("leyendaDeMarcas: una entrada por unidad que define marca, solo las que se ven, en orden del árbol", () => {
    const marcas = marcasPorUnidad(marcadas, TIPO_GERENCIA);
    const visibles = ["gg", "finanzas", "operaciones", "mantencion"].map((id) =>
      marcadas.find((x) => x.id === id)!,
    );
    expect(leyendaDeMarcas(marcas, visibles).map((m) => m.unidad.id)).toEqual(["finanzas", "operaciones"]);
    expect(leyendaDeMarcas(marcas, [marcadas.find((x) => x.id === "gg")!])).toEqual([]);
  });

  it("rutasPorTipo coincide con rutaPorTipo restringida a los tipos elegidos", () => {
    const elegidos = new Set([TIPO_GERENCIA, TIPO_SUBAREA]);
    const rutas = rutasPorTipo(unidades, tipos, elegidos);
    for (const x of unidades.filter((y) => !y.deleted_at)) {
      const esperada = rutaPorTipo(unidades, tipos, x.id).filter((r) => elegidos.has(r.tipo.id));
      expect(rutas.get(x.id)!.map((y) => y.id)).toEqual(esperada.map((r) => r.unidad.id));
    }
  });

  it("tiposEnUso: tipos de alguna unidad viva, en el orden del catálogo", () => {
    expect(tiposEnUso(unidades, tipos).map((t) => t.id)).toEqual([
      TIPO_GERENCIA,
      TIPO_AREA,
      TIPO_SUBAREA,
      TIPO_OTRA,
    ]);
    const solo = unidades.filter((x) => x.id === "mantencion" || x.id === "borrada");
    expect(tiposEnUso(solo, tipos).map((t) => t.id)).toEqual([TIPO_AREA]);
  });
});

describe("indiceHijos", () => {
  it("agrupa igual que hijos para cada unidad y para las raíces", () => {
    const indice = indiceHijos(unidades);
    for (const x of unidades) expect(indice.get(x.id) ?? []).toEqual(hijos(unidades, x.id));
    expect(indice.get(null)?.map((x) => x.id)).toEqual(["gg"]);
  });
});
